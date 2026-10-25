-- Final functions and required private protocol helpers. Private helper grants remain revoked.

CREATE OR REPLACE FUNCTION public.cleanup_sentiment_analysis()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_table_name = 'reports' then
    delete from public.sentiment_analysis
    where subject_type = 'report' and subject_id = old.id;
  else
    delete from public.sentiment_analysis
    where subject_type = 'comment' and subject_id = old.id;
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.profiles where id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_sentiment_training(p_mode text DEFAULT 'continue'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result uuid;
begin
  if p_mode is distinct from 'continue' and p_mode is distinct from 'fresh' then
    raise exception 'Training mode must be "continue" or "fresh"' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(72846102);
  select id into result from public.sentiment_training_jobs where status = 'queued' for update;
  if result is null then
    insert into public.sentiment_training_jobs (training_mode) values (p_mode) returning id into result;
    insert into public.sentiment_training_events(job_id, action) values (result, 'queued');
  else
    -- Coalesce approvals during a short debounce window. The snapshot is taken
    -- when a worker claims the job, not while an approval request is running.
    if p_mode = 'fresh' then
      update public.sentiment_training_jobs set training_mode = 'fresh' where id = result and training_mode is distinct from 'fresh';
    end if;
    update public.sentiment_training_jobs set available_at = least(created_at + interval '2 minutes', now() + interval '30 seconds') where id = result;
  end if;
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.handle_new_credibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.user_credibility (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, first_name, middle_name, last_name, user_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'firstName',
    new.raw_user_meta_data->>'middleName',
    new.raw_user_meta_data->>'lastName',
    coalesce(new.raw_user_meta_data->>'userName', new.raw_user_meta_data->>'name', ''),
    'user'
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_dataset(p_actor uuid, p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor public.profiles%rowtype;
  batch public.sentiment_datasets%rowtype;
  sample public.sentiment_training_samples%rowtype;
  item jsonb;
  result_id uuid;
  next_status text;
  note text;
begin
  select * into actor from public.profiles where id = p_actor;
  if actor.id is null or actor.role not in ('admin', 'super_admin') or actor.status = 'Disabled' then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  -- Serialize dataset mutations, including duplicate checks and review/export
  -- snapshots. A database uniqueness constraint provides an additional guard.
  perform pg_advisory_xact_lock(72846102);
  if p_action = 'submit' then
    if (p_payload->>'privacy_reviewed') is distinct from 'true' then raise exception 'Data review confirmation required' using errcode = '22023'; end if;
    if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') not between 1 and 1000 then
      raise exception 'Provide 1 to 1000 examples' using errcode = '22023';
    end if;
    insert into public.sentiment_datasets(name, source, created_by, created_by_name)
    values (p_payload->>'name', p_payload->>'source', p_actor, coalesce(actor.fullname, actor.user_name, 'Admin')) returning id into result_id;
    for item in select value from jsonb_array_elements(p_payload->'rows') loop
      insert into public.sentiment_training_samples(dataset_id, text, language, label, text_key)
      values (result_id, item->>'text', item->>'language', item->>'label', item->>'text_key');
    end loop;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
    values (result_id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), 'submitted', jsonb_build_object('count', jsonb_array_length(p_payload->'rows'), 'source', p_payload->>'source', 'privacy_reviewed', true));
    return jsonb_build_object('id', result_id);
  end if;
  select * into batch from public.sentiment_datasets where id = (p_payload->>'dataset_id')::uuid for update;
  if batch.id is null then raise exception 'Dataset not found' using errcode = 'P0002'; end if;
  if (p_payload->>'version') is null or batch.version <> (p_payload->>'version')::integer then
    raise exception 'Dataset changed. Refresh and try again.' using errcode = '40001';
  end if;
  if p_action = 'export' then
    if actor.role <> 'super_admin' then raise exception 'Only super admins can export training data' using errcode = '42501'; end if;
    if batch.status <> 'approved' then raise exception 'Only approved datasets can be exported' using errcode = '22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('text', text, 'language', language, 'label', label) order by id), '[]'::jsonb)
      into item from public.sentiment_training_samples where dataset_id = batch.id and active;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
      values (batch.id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), 'exported', jsonb_build_object('version', batch.version, 'count', jsonb_array_length(item), 'format', p_payload->>'format'));
    return jsonb_build_object('dataset_id', batch.id, 'version', batch.version, 'status', 'approved', 'samples', item);
  end if;
  if p_action = 'edit' then
    if batch.status <> 'pending' then raise exception 'Only pending examples can be edited' using errcode = '22023'; end if;
    if batch.created_by is distinct from p_actor and actor.role <> 'super_admin' then raise exception 'Only the submitter or super admin can edit' using errcode = '42501'; end if;
    select * into sample from public.sentiment_training_samples where id = (p_payload->>'sample_id')::uuid and dataset_id = batch.id for update;
    if sample.id is null then raise exception 'Example not found' using errcode = 'P0002'; end if;
    item := p_payload->'sample';
    update public.sentiment_training_samples set text = item->>'text', language = item->>'language', label = item->>'label', text_key = item->>'text_key' where id = sample.id;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
    values (batch.id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), 'edited', jsonb_build_object('sample_id', sample.id, 'before', to_jsonb(sample), 'after', item));
  elsif p_action in ('approve', 'reject', 'archive') then
    note := coalesce(p_payload->>'note', '');
    if char_length(note) > 1000 then raise exception 'Review note is too long' using errcode = '22023'; end if;
    if p_action in ('approve', 'reject') then
      if actor.role <> 'super_admin' then raise exception 'Only super admins can review datasets' using errcode = '42501'; end if;
      if batch.status <> 'pending' then raise exception 'Only pending datasets can be reviewed' using errcode = '22023'; end if;
      if p_action = 'reject' and btrim(note) = '' then raise exception 'A rejection reason is required' using errcode = '22023'; end if;
    else
      if batch.status = 'archived' then raise exception 'Dataset is already archived' using errcode = '22023'; end if;
      if actor.role <> 'super_admin' and (batch.status <> 'pending' or batch.created_by is distinct from p_actor) then
        raise exception 'Only your own pending dataset can be archived' using errcode = '42501';
      end if;
    end if;
    next_status := case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'archived' end;
    update public.sentiment_datasets set status = next_status,
      reviewed_by = case when p_action = 'archive' then reviewed_by else p_actor end,
      review_note = case when p_action = 'archive' then review_note else note end
      where id = batch.id;
    update public.sentiment_training_samples set active = (next_status = 'approved') where dataset_id = batch.id;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
    values (batch.id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), next_status, jsonb_build_object('from', batch.status, 'to', next_status, 'note', note));
  else
    raise exception 'Unsupported action' using errcode = '22023';
  end if;
  update public.sentiment_datasets set version = version + 1, updated_at = now() where id = batch.id;
  return jsonb_build_object('id', batch.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_supporting_model(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles%rowtype; model public.sentiment_supporting_models%rowtype;
  state public.sentiment_model_state%rowtype; cap integer; enabled integer; filename text;
begin
  if p_action <> 'enable' then return public.manage_sentiment_supporting_model_independent_legacy(p_actor,p_action,p_model,p_generation,p_payload); end if;
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(72846102);
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.generation is distinct from p_generation then raise exception 'Model pool changed. Refresh first.' using errcode='40001'; end if;
  select * into model from public.sentiment_supporting_models where id=p_model for update;
  if model.id is null or model.status <> 'disabled' then raise exception 'Only a disabled model can be enabled' using errcode='22023'; end if;
  select max_enabled into cap from public.sentiment_supporting_settings where id=1;
  select count(*) into enabled from public.sentiment_supporting_models where status='enabled';
  if enabled>=cap then raise exception 'Enabled model limit reached. Disable another model first.' using errcode='22023'; end if;
  if (model.metrics->>'passed') is distinct from 'true' or not public.valid_sentiment_independent_policy(model.routing_policy) then
    raise exception 'Independent quality evaluation required. Retrain legacy candidates first.' using errcode='22023'; end if;
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
    if model.routing_policy->'builtin_hashes'->>filename is distinct from p_payload->'builtin_hashes'->>filename then
      raise exception 'Built-in fingerprint changed; re-evaluate routing compatibility.' using errcode='22023'; end if;
  end loop;
  update public.sentiment_supporting_models set status='enabled',updated_at=now() where id=p_model;
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,actor_id,action,details) values(p_model,p_actor,'support_enable',jsonb_build_object('admission','independent-v1'));
  return jsonb_build_object('id',p_model);
end $function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_supporting_model_independent_legacy(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles%rowtype; state public.sentiment_model_state%rowtype;
  model public.sentiment_supporting_models%rowtype; cap integer; enabled integer; language text; rule jsonb; filename text;
begin
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(72846102);
  select * into state from public.sentiment_model_state where id=1 for update;
  if p_generation is distinct from state.generation then raise exception 'Model pool changed. Refresh first.' using errcode='40001'; end if;
  select count(*) into enabled from public.sentiment_supporting_models where status='enabled';
  select max_enabled into cap from public.sentiment_supporting_settings where id=1;
  if p_action='set_limit' then
    cap := (p_payload->>'limit')::integer;
    if cap is null or cap not between 1 and 3 or enabled>cap then raise exception 'Limit must be 1–3 and cannot be below the enabled count' using errcode='22023'; end if;
    update public.sentiment_supporting_settings set max_enabled=cap where id=1;
  else
    select * into model from public.sentiment_supporting_models where id=p_model for update;
    if model.id is null or model.status='deleted' then raise exception 'Supporting model not found' using errcode='22023'; end if;
    if p_action='enable' then
      if model.status <> 'disabled' then raise exception 'Only a disabled model can be enabled' using errcode='22023'; end if;
      if enabled>=cap then raise exception 'Enabled model limit reached. Disable another model first.' using errcode='22023'; end if;
      if (model.metrics->>'passed') is distinct from 'true' or not public.valid_sentiment_pool_policy(model.routing_policy) then raise exception 'A passing model and verified fallback policy are required' using errcode='22023'; end if;
      foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
        if model.routing_policy->'builtin_hashes'->>filename is distinct from p_payload->'builtin_hashes'->>filename then
          raise exception 'Built-in model differs from the evaluated policy. Re-evaluate first.' using errcode='22023';
        end if;
      end loop;
      -- Full-pool validation must include exactly the currently enabled IDs.
      if coalesce((select jsonb_agg(id::text order by id::text) from public.sentiment_supporting_models where status='enabled'),'[]'::jsonb)
        is distinct from coalesce(model.routing_policy->'evaluated_pool_ids','[]'::jsonb) then
        raise exception 'Enabled pool differs from this model’s evaluated combination. Queue fresh evaluation.' using errcode='22023';
      end if;
      update public.sentiment_supporting_models set status='enabled',updated_at=now() where id=p_model;
    elsif p_action='disable' then
      if model.status <> 'enabled' then raise exception 'Only an enabled model can be disabled' using errcode='22023'; end if;
      update public.sentiment_supporting_models set status='disabled',updated_at=now() where id=p_model;
      -- Remove dependent combinations too; removing a disagreeing participant
      -- must not silently turn an unvalidated remaining vote into a result.
      loop
        update public.sentiment_supporting_models m set status='disabled',updated_at=now()
        where m.status='enabled' and exists(select 1 from jsonb_array_elements_text(m.routing_policy->'evaluated_pool_ids') dependency
          where not exists(select 1 from public.sentiment_supporting_models parent where parent.id::text=dependency and parent.status='enabled'));
        exit when not found;
      end loop;
    elsif p_action='archive' then
      if model.status <> 'disabled' then raise exception 'Disable the model before archiving' using errcode='22023'; end if;
      update public.sentiment_supporting_models set status='archived',updated_at=now() where id=p_model;
    elsif p_action='restore' then
      if model.status <> 'archived' then raise exception 'Only an archived model can be restored to disabled' using errcode='22023'; end if;
      update public.sentiment_supporting_models set status='disabled',updated_at=now() where id=p_model;
    elsif p_action='delete' then
      if model.status <> 'archived' then raise exception 'Archive the disabled model before deleting' using errcode='22023'; end if;
      if exists(select 1 from public.sentiment_training_jobs j where j.status in ('training','evaluating') and j.lease_until>now()
         and (j.base_job_id=p_model or j.snapshot->'supporting_models' @> jsonb_build_array(jsonb_build_object('id',p_model)))) then
        raise exception 'A live training/evaluation still references this model. Wait for it to finish.' using errcode='22023';
      end if;
      -- Logical permanent removal. Private artifacts/audit are retained so an
      -- in-flight inference cannot lose files. No blind storage deletion.
      update public.sentiment_supporting_models set status='deleted',deleted_at=now(),updated_at=now() where id=p_model;
    else raise exception 'Unsupported model action' using errcode='22023'; end if;
  end if;
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,actor_id,action,details) values(p_model,p_actor,'support_'||p_action,p_payload-'builtin_hashes');
  return jsonb_build_object('id',p_model);
end $function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_training(p_actor uuid, p_action text, p_job uuid DEFAULT NULL::uuid, p_generation bigint DEFAULT NULL::bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles%rowtype; target uuid; selected text[]; ids uuid[];
begin
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode='42501'; end if;
  if p_action <> 'queue' then raise exception 'Built-in models are permanent.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(72846102);
  if p_payload ? 'dataset_ids' then
    if jsonb_typeof(p_payload->'dataset_ids') <> 'array' or jsonb_array_length(p_payload->'dataset_ids')=0 then raise exception 'Select approved datasets.' using errcode='22023'; end if;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_payload->'dataset_ids');
    if exists(select 1 from unnest(ids) i where not exists(select 1 from public.sentiment_datasets d where d.id=i and d.status='approved')) then raise exception 'Only approved datasets can be selected.' using errcode='22023'; end if;
  else
    -- Scope new work from newly approved dataset versions, not baseline languages
    -- or older attempted uploads. Retry with no new approvals keeps the last scope.
    select array_agg(d.id) into ids from public.sentiment_datasets d where d.status='approved' and not exists(
      select 1 from public.sentiment_training_jobs j where j.status in ('ready','failed') and j.finished_at is not null
      and j.snapshot->'datasets' @> jsonb_build_array(jsonb_build_object('id',d.id,'version',d.version)));
    if ids is null then
      select training_languages into selected from public.sentiment_training_jobs
      where training_languages is not null order by created_at desc limit 1;
    end if;
  end if;
  select array_agg(distinct s.language order by s.language) into selected from public.sentiment_training_samples s
    join public.sentiment_datasets d on d.id=s.dataset_id where s.active and d.status='approved' and (ids is null or d.id=any(ids))
    and (selected is null or s.language=any(selected));
  if selected is null then raise exception 'Approve at least one training example before queueing.' using errcode='22023'; end if;
  target := public.enqueue_sentiment_training(coalesce(p_payload->>'mode','continue'));
  update public.sentiment_training_jobs set training_languages=selected where id=target;
  return jsonb_build_object('job_id',target,'requested_languages',selected);
end $function$;

CREATE OR REPLACE FUNCTION public.queue_approved_sentiment_training()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform pg_advisory_xact_lock(72846102);
  update public.sentiment_model_state set data_revision=data_revision+1 where id=1;
  insert into public.sentiment_dataset_events(dataset_id,actor_id,actor_name,action,details)
    values(new.id,new.reviewed_by,'Reviewed training pool','training_pool_updated',jsonb_build_object('reason',new.status,'automatic_training',false));
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.record_sentiment_support_usage(p_ids uuid[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.sentiment_supporting_models set use_count=use_count+1,last_used_at=now()
  where id=any(p_ids) and status <> 'deleted';
$function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_capabilities()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('continued_training',true,'automatic_activation',false,'supporting_pool',true,'fresh_candidates',true,
    'independent_admission',true,'manual_training',true,'manual_enable',true,'language_scoped_training',true);
$function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_pool_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with approved as (
    select s.*,d.version from public.sentiment_training_samples s
    join public.sentiment_datasets d on d.id=s.dataset_id where d.status='approved' and s.active
  ), pending as (
    select a.* from approved a where not exists (
      select 1 from public.sentiment_training_jobs j
      where (j.status='ready'
        or (j.status in ('training','evaluating') and j.lease_until>now())
        or (j.status='failed' and jsonb_typeof(j.metrics->'training')='object'))
      and j.snapshot->'datasets' @> jsonb_build_array(jsonb_build_object('id',a.dataset_id,'version',a.version))
    )
  ), distribution as (
    select language,jsonb_build_object('total',count(*),'negative',count(*) filter(where label='negative'),
      'neutral',count(*) filter(where label='neutral'),'positive',count(*) filter(where label='positive')) counts
    from pending group by language
  ), recent as (
    select d.id,d.name,d.version,d.updated_at approved_at,count(*) example_count,
      coalesce(p.fullname,p.user_name,'Super admin') approved_by
    from pending a join public.sentiment_datasets d on d.id=a.dataset_id
    left join public.profiles p on p.id=d.reviewed_by
    group by d.id,d.name,d.version,d.updated_at,p.fullname,p.user_name
    order by d.updated_at desc,d.id limit 10
  )
  select jsonb_build_object('queueSummaryVersion',1,
    'approvedExamples',(select count(*) from approved),
    'approvedDatasets',(select count(*) from public.sentiment_datasets where status='approved'),
    'pendingDatasets',(select count(*) from public.sentiment_datasets where status='pending'),
    'newExamples',(select count(*) from pending),
    'readyToQueueExamples',(select count(*) from pending),
    'readyToQueueDatasets',(select count(distinct dataset_id) from pending),
    'languages',coalesce((select jsonb_object_agg(language,counts) from distribution),'{}'::jsonb),
    'readyDatasets',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'version',version,
      'exampleCount',example_count,'approvedAt',approved_at,'approvedBy',approved_by)
      order by approved_at desc,id) from recent),'[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare job public.sentiment_training_jobs%rowtype; state public.sentiment_model_state%rowtype;
  result jsonb; policy jsonb; manifest jsonb; filename text; file jsonb; language text; qualified text[]; required text[];
begin
  -- protocol: supporting-pool-v1; protocol: supporting-pool-v2; admission: independent-v1; language-scope-v1
  if p_action='capabilities' then return public.sentiment_training_capabilities(); end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action='claim' then
    if p_payload->>'language_scope_protocol' is distinct from '1' then raise exception 'Updated language-scoped worker required. Restart the worker.' using errcode='22023'; end if;
    result := public.sentiment_training_worker_scope_legacy(p_action,p_job,p_lease,p_payload);
    if result is null then return null; end if;
    select * into job from public.sentiment_training_jobs where id=(result->>'id')::uuid;
    if job.training_languages is null then
      select array_agg(distinct s->>'language' order by s->>'language') into job.training_languages from jsonb_array_elements(job.snapshot->'samples') s;
    end if;
    if job.training_languages is null or cardinality(job.training_languages) not between 1 and 3 or exists(
      select 1 from unnest(job.training_languages) l where l not in ('cebuano','english','filipino') or
      not exists(select 1 from jsonb_array_elements(job.snapshot->'samples') s where s->>'language'=l)) then
      raise exception 'Training scope no longer has approved examples; queue a new run.' using errcode='22023'; end if;
    update public.sentiment_training_jobs set training_languages=job.training_languages,
      snapshot=snapshot || jsonb_build_object('scope_version',1,'requested_languages',job.training_languages)
      where id=job.id returning * into job;
    return to_jsonb(job);
  end if;
  if p_action <> 'complete' then return public.sentiment_training_worker_scope_legacy(p_action,p_job,p_lease,p_payload); end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status <> 'evaluating' or job.lease_token is distinct from p_lease or job.lease_until is null or job.lease_until<now() then raise exception 'Training lease is stale or invalid' using errcode='40001'; end if;
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.active_job_id is not null or job.data_revision is distinct from state.data_revision then raise exception 'Approved data changed during evaluation' using errcode='40001'; end if;
  policy := p_payload->'metrics'->'routing_policy'; manifest := p_payload->'manifest';
  if job.snapshot->'scope_version' is distinct from '1'::jsonb or policy->'scope_version' is distinct from '1'::jsonb
    or policy->'requested_languages' is distinct from job.snapshot->'requested_languages'
    or p_payload->'metrics'->'requested_languages' is distinct from job.snapshot->'requested_languages'
    or (p_payload->'metrics'->>'admission') is distinct from 'independent-v1'
    or (p_payload->'metrics'->>'passed') is distinct from 'true' or (p_payload->'metrics'->>'pool_protocol') is distinct from '1'
    or p_payload->'metrics'->>'training_mode' is distinct from job.training_mode
    or not public.valid_sentiment_independent_policy(policy) or policy->'builtin_hashes' is distinct from job.snapshot->'builtin_hashes' then
    raise exception 'Valid language-scoped held-out quality evidence required' using errcode='22023'; end if;
  select array_agg(key order by key) into qualified from jsonb_object_keys(policy->'languages') key;
  if manifest->'languages' is distinct from to_jsonb(qualified) or p_payload->'metrics'->'qualified_languages' is distinct from to_jsonb(qualified) then raise exception 'Qualified languages and artifacts differ' using errcode='22023'; end if;
  required := array['language_id.onnx'];
  foreach language in array qualified loop required := required || array['sentiment_'||language||'.onnx','sentiment_'||language||'.joblib']; end loop;
  foreach filename in array required loop
    file := case when filename like '%.joblib' then manifest->'training_files'->filename else manifest->'files'->filename end;
    if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
      or file->>'path' is distinct from job.id::text||'/'||job.lease_token::text||'/'||filename then raise exception 'Complete qualified-language artifacts required' using errcode='22023'; end if;
  end loop;
  if (select count(*) from jsonb_object_keys(manifest->'files')) <> cardinality(qualified)+1 or
     (select count(*) from jsonb_object_keys(manifest->'training_files')) <> cardinality(qualified) then raise exception 'Unexpected unqualified artifacts' using errcode='22023'; end if;
  update public.sentiment_training_jobs set status='ready',metrics=p_payload->'metrics',artifact_manifest=manifest,finished_at=now(),lease_until=null where id=job.id;
  insert into public.sentiment_supporting_models(id,name,status,artifact_manifest,routing_policy,metrics,datasets)
    values(job.id,'Supporting model '||left(job.id::text,8),'disabled',manifest,policy,p_payload->'metrics',coalesce(job.snapshot->'datasets','[]'::jsonb));
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,action,details) values(job.id,'support_registered',jsonb_build_object('qualified_languages',qualified,'enabled',false,'manual_review_required',true));
  return jsonb_build_object('id',job.id,'qualified_languages',qualified,'support_enabled',false,'built_in_unchanged',true);
end $function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker_independent_legacy(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare job public.sentiment_training_jobs%rowtype; state public.sentiment_model_state%rowtype;
  result jsonb; manifest jsonb; policy jsonb; filename text; file jsonb; cap integer; enabled integer; auto_enable boolean;
begin
  -- protocol: supporting-pool-v1
  -- protocol: supporting-pool-v2
  if p_action='capabilities' then return public.sentiment_training_capabilities(); end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action='claim' then
    if (p_payload->>'pool_protocol') is distinct from '1' then raise exception 'Updated supporting-pool worker required' using errcode='22023'; end if;
    if (p_payload->>'worker_protocol') is distinct from 'supporting-pool-v2' then raise exception 'Updated fresh-candidate worker required. Restart the worker after applying sentiment_fresh_candidates.sql.' using errcode='22023'; end if;
    foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
      if coalesce(p_payload->'builtin_hashes'->>filename,'') !~ '^[a-f0-9]{64}$' then raise exception 'Built-in hashes required' using errcode='22023'; end if;
    end loop;
    if exists(select 1 from public.sentiment_model_state where active_job_id is not null) then raise exception 'Legacy primary pointer must be cleared by the pool migration' using errcode='22023'; end if;
    result := public.sentiment_training_worker_pool_legacy(p_action,p_job,p_lease,p_payload);
    if result is null then return null; end if;
    update public.sentiment_training_jobs set base_job_id=null,
      snapshot=snapshot || jsonb_build_object('pool_protocol',1,'builtin_hashes',p_payload->'builtin_hashes',
        'supporting_models',coalesce((select jsonb_agg(jsonb_build_object('id',id,'artifact_manifest',artifact_manifest,'routing_policy',routing_policy) order by id)
          from public.sentiment_supporting_models where status='enabled'),'[]'::jsonb))
      where id=(result->>'id')::uuid returning * into job;
    return to_jsonb(job);
  end if;
  if p_action <> 'complete' then return public.sentiment_training_worker_pool_legacy(p_action,p_job,p_lease,p_payload); end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status <> 'evaluating' or job.lease_token is distinct from p_lease or job.lease_until is null or job.lease_until<now() then
    raise exception 'Training lease is stale or invalid' using errcode='40001';
  end if;
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.active_job_id is not null or job.base_generation is distinct from state.generation or job.data_revision is distinct from state.data_revision then
    raise exception 'Pool or approved data changed during evaluation' using errcode='40001';
  end if;
  if (p_payload->'metrics'->>'passed') is distinct from 'true' or
     (p_payload->'metrics'->>'pool_protocol') is distinct from '1' or
     (job.snapshot->>'pool_protocol') is distinct from '1' then
    raise exception 'A passing supporting-pool evaluation is required' using errcode='22023';
  end if;
  -- Fresh jobs must carry fresh-training evidence from an updated worker;
  -- continue jobs may omit it (outdated workers default to continued training).
  if coalesce(job.training_mode,'continue') = 'fresh' then
    if (p_payload->'metrics'->>'training_mode') is distinct from 'fresh' then
      raise exception 'Fresh training evidence required. Restart the worker and queue this job again.' using errcode='22023';
    end if;
  elsif (p_payload->'metrics'->>'training_mode') is not null and (p_payload->'metrics'->>'training_mode') is distinct from coalesce(job.training_mode,'continue') then
    raise exception 'Training mode mismatch between job and worker' using errcode='22023';
  end if;
  manifest := p_payload->'manifest';
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx','sentiment_english.joblib','sentiment_filipino.joblib','sentiment_cebuano.joblib'] loop
    file := case when filename like '%.joblib' then manifest->'training_files'->filename else manifest->'files'->filename end;
    if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
      or (file->>'path') is distinct from (job.id::text||'/'||job.lease_token::text||'/'||filename) then
      raise exception 'Complete checked inference/training artifacts required' using errcode='22023';
    end if;
  end loop;
  policy := coalesce(p_payload->'metrics'->'routing_policy','{}'::jsonb);
  if policy->'builtin_hashes' is distinct from job.snapshot->'builtin_hashes' then raise exception 'Built-in fingerprint differs' using errcode='22023'; end if;
  select max_enabled into cap from public.sentiment_supporting_settings where id=1;
  select count(*) into enabled from public.sentiment_supporting_models where status='enabled';
  auto_enable := public.valid_sentiment_pool_policy(policy) and enabled<cap;
  if auto_enable and coalesce(policy->'evaluated_pool_ids','[]'::jsonb) is distinct from
     coalesce((select jsonb_agg(id::text order by id::text) from public.sentiment_supporting_models where status='enabled'),'[]'::jsonb) then
    raise exception 'Evaluated pool does not match enabled models' using errcode='40001';
  end if;
  update public.sentiment_training_jobs set status='ready',metrics=p_payload->'metrics',artifact_manifest=manifest,finished_at=now(),lease_until=null where id=job.id;
  insert into public.sentiment_supporting_models(id,name,status,artifact_manifest,routing_policy,metrics,datasets)
    values(job.id,'Supporting model '||left(job.id::text,8),case when coalesce(auto_enable,false) then 'enabled' else 'disabled' end,
      manifest,policy,p_payload->'metrics',coalesce(job.snapshot->'datasets','[]'::jsonb));
  update public.sentiment_model_state set generation=generation+1,active_job_id=null,previous_job_id=null,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,action,details) values(job.id,'support_registered',jsonb_build_object('enabled',coalesce(auto_enable,false),'built_in_unchanged',true));
  return jsonb_build_object('id',job.id,'support_enabled',coalesce(auto_enable,false),'built_in_unchanged',true);
end $function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker_pool_legacy(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  job public.sentiment_training_jobs%rowtype;
  state public.sentiment_model_state%rowtype;
  inputs jsonb;
  filename text;
  file jsonb;
begin
  -- protocol: continued-training-v1
  if p_action = 'capabilities' then
    return jsonb_build_object('continued_training', true, 'automatic_activation', true);
  end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action = 'claim' then
    update public.sentiment_training_jobs set status = 'failed', error = 'Worker lease expired. Queue a retry.', finished_at = now()
      where status in ('training','evaluating') and lease_until < now();
    if exists (select 1 from public.sentiment_training_jobs where status in ('training','evaluating')) then return null; end if;
    select * into job from public.sentiment_training_jobs where status = 'queued' and available_at <= now() order by created_at limit 1 for update;
    if job.id is null then return null; end if;
    select * into state from public.sentiment_model_state where id = 1;
    if (select count(*) from (select 1 from public.sentiment_training_samples s join public.sentiment_datasets d on d.id = s.dataset_id where d.status = 'approved' and s.active limit 50001) pool) > 50000 then
      update public.sentiment_training_jobs set status='failed', error='Approved pool exceeds the 50,000-example worker limit.', finished_at=now() where id=job.id;
      return null;
    end if;
    select jsonb_build_object(
      'datasets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'version', version) order by id) from public.sentiment_datasets where status = 'approved'), '[]'::jsonb),
      'samples', coalesce((select jsonb_agg(jsonb_build_object('text', s.text, 'language', s.language, 'label', s.label) order by s.id)
        from public.sentiment_training_samples s join public.sentiment_datasets d on d.id = s.dataset_id where d.status = 'approved' and s.active), '[]'::jsonb)
    ) into inputs;
    update public.sentiment_training_jobs set status='training', started_at=now(), lease_token=gen_random_uuid(), lease_until=now()+interval '5 minutes',
      snapshot=inputs, data_revision=state.data_revision, base_generation=state.generation, base_job_id=state.active_job_id
      where id=job.id returning * into job;
    insert into public.sentiment_training_events(job_id, action) values (job.id, 'training');
    return to_jsonb(job);
  end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status not in ('training','evaluating') or job.lease_token is distinct from p_lease or job.lease_until < now() then
    raise exception 'Training lease is stale or invalid' using errcode='40001';
  end if;
  if p_action = 'heartbeat' then
    update public.sentiment_training_jobs set lease_until=now()+interval '5 minutes' where id=job.id;
  elsif p_action = 'evaluating' then
    update public.sentiment_training_jobs set status='evaluating', lease_until=now()+interval '5 minutes' where id=job.id;
  elsif p_action = 'fail' then
    update public.sentiment_training_jobs set status='failed', error=left(coalesce(p_payload->>'error','Training failed'),1000), metrics=p_payload->'metrics', finished_at=now(), lease_until=null where id=job.id;
  elsif p_action = 'complete' then
    if job.status <> 'evaluating' or (p_payload->'metrics'->>'passed') is distinct from 'true' then
      raise exception 'A passing evaluation is required' using errcode='22023';
    end if;
    if (p_payload->'metrics'->'training'->>'mode') is distinct from 'continued' then
      raise exception 'Updated continued-training worker required. Cold-trained bundles cannot auto-activate.' using errcode='22023';
    end if;
    foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
      file := p_payload->'manifest'->'files'->filename;
      if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
        or (file->>'path') is distinct from (job.id::text || '/' || job.lease_token::text || '/' || filename) then
        raise exception 'Incomplete or invalid model manifest' using errcode='22023';
      end if;
    end loop;
    foreach filename in array array['sentiment_english.joblib','sentiment_filipino.joblib','sentiment_cebuano.joblib'] loop
      file := p_payload->'manifest'->'training_files'->filename;
      if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
        or (file->>'path') is distinct from (job.id::text || '/' || job.lease_token::text || '/' || filename) then
        raise exception 'Complete checksummed training state is required' using errcode='22023';
      end if;
    end loop;
    select * into state from public.sentiment_model_state where id=1 for update;
    if job.base_generation is distinct from state.generation or job.base_job_id is distinct from state.active_job_id
      or job.data_revision is distinct from state.data_revision then
      raise exception 'Training result is stale. New approved data or model state must be trained first.' using errcode='40001';
    end if;
    -- Publish and switch the pointer in ONE transaction. A failure anywhere
    -- leaves both the old pointer and the candidate job unchanged.
    update public.sentiment_training_jobs set status='ready', metrics=p_payload->'metrics', artifact_manifest=p_payload->'manifest',
      finished_at=now(), lease_until=null where id=job.id;
    update public.sentiment_model_state set previous_job_id=state.active_job_id, active_job_id=job.id,
      generation=generation+1, updated_at=now() where id=1;
    insert into public.sentiment_training_events(job_id, action, details)
      values (job.id, 'auto_activate', jsonb_build_object('previous_job_id',state.active_job_id,'previous_generation',state.generation,'mode','continued'));
  else
    raise exception 'Unsupported worker action' using errcode='22023';
  end if;
  if p_action <> 'heartbeat' then insert into public.sentiment_training_events(job_id, action) values (job.id,p_action); end if;
  return jsonb_build_object('id',job.id,'auto_activated',p_action='complete');
end $function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker_scope_legacy(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare job public.sentiment_training_jobs%rowtype; state public.sentiment_model_state%rowtype;
  result jsonb; policy jsonb; manifest jsonb; filename text; file jsonb;
begin
  -- protocol: supporting-pool-v1; protocol: supporting-pool-v2; admission: independent-v1
  if p_action='capabilities' then return public.sentiment_training_capabilities(); end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action='claim' then
    if (p_payload->>'admission_protocol') is distinct from 'independent-v1' then
      raise exception 'Updated independent-quality worker required. Restart the worker.' using errcode='22023'; end if;
    result := public.sentiment_training_worker_independent_legacy(p_action,p_job,p_lease,p_payload);
    if result is null then return null; end if;
    update public.sentiment_training_jobs set snapshot=snapshot || jsonb_build_object('admission','independent-v1','supporting_models','[]'::jsonb)
      where id=(result->>'id')::uuid returning * into job;
    return to_jsonb(job);
  end if;
  if p_action <> 'complete' then return public.sentiment_training_worker_independent_legacy(p_action,p_job,p_lease,p_payload); end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status <> 'evaluating' or job.lease_token is distinct from p_lease or job.lease_until is null or job.lease_until<now() then
    raise exception 'Training lease is stale or invalid' using errcode='40001'; end if;
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.active_job_id is not null or job.data_revision is distinct from state.data_revision then
    raise exception 'Approved data changed during evaluation' using errcode='40001'; end if;
  if (job.snapshot->>'admission') is distinct from 'independent-v1' or (p_payload->'metrics'->>'admission') is distinct from 'independent-v1'
    or (p_payload->'metrics'->>'pool_protocol') is distinct from '1' or (p_payload->'metrics'->>'passed') is distinct from 'true'
    or (p_payload->'metrics'->>'training_mode') is distinct from job.training_mode then
    raise exception 'Independent held-out evaluation and matching training evidence required' using errcode='22023'; end if;
  policy := p_payload->'metrics'->'routing_policy';
  if not public.valid_sentiment_independent_policy(policy) or policy->'builtin_hashes' is distinct from job.snapshot->'builtin_hashes' then
    raise exception 'Independent quality evidence or built-in fingerprint invalid' using errcode='22023'; end if;
  manifest := p_payload->'manifest';
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx','sentiment_english.joblib','sentiment_filipino.joblib','sentiment_cebuano.joblib'] loop
    file := case when filename like '%.joblib' then manifest->'training_files'->filename else manifest->'files'->filename end;
    if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
      or file->>'path' is distinct from job.id::text||'/'||job.lease_token::text||'/'||filename then
      raise exception 'Complete checked inference/training artifacts required' using errcode='22023'; end if;
  end loop;
  update public.sentiment_training_jobs set status='ready',metrics=p_payload->'metrics',artifact_manifest=manifest,finished_at=now(),lease_until=null where id=job.id;
  insert into public.sentiment_supporting_models(id,name,status,artifact_manifest,routing_policy,metrics,datasets)
    values(job.id,'Supporting model '||left(job.id::text,8),'disabled',manifest,policy,p_payload->'metrics',coalesce(job.snapshot->'datasets','[]'::jsonb));
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,action,details) values(job.id,'support_registered',jsonb_build_object('enabled',false,'manual_review_required',true,'built_in_unchanged',true));
  return jsonb_build_object('id',job.id,'support_enabled',false,'manual_review_required',true,'built_in_unchanged',true);
end $function$;

CREATE OR REPLACE FUNCTION public.set_credibility_level()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.score = 100 then
    new.level := 4;
    new.level_label := 'All good';
  elsif new.score >= 60 then
    new.level := 3;
    new.level_label := 'Limited';
  elsif new.score >= 40 then
    new.level := 2;
    new.level_label := 'Very Limited';
  elsif new.score >= 20 then
    new.level := 1;
    new.level_label := 'At risk';
  else
    new.level := 0;
    new.level_label := 'Suspended';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_fullname()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.fullname = nullif(btrim(concat_ws(' ', nullif(new.first_name, ''), nullif(new.middle_name, ''), nullif(new.last_name, ''))), '');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_sentiment_analysis_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_independent_metrics(m jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare label text; c jsonb;
begin
  if jsonb_typeof(m->'macro_f1') is distinct from 'number' or (m->>'macro_f1')::numeric not between 0.6 and 1 then return false; end if;
  foreach label in array array['negative','neutral','positive'] loop
    c := m->'per_class'->label;
    if jsonb_typeof(c->'support') is distinct from 'number' or (c->>'support')::numeric<10
      or trunc((c->>'support')::numeric)<>(c->>'support')::numeric
      or jsonb_typeof(c->'precision') is distinct from 'number' or (c->>'precision')::numeric not between 0.5 and 1
      or jsonb_typeof(c->'recall') is distinct from 'number' or (c->>'recall')::numeric not between 0.5 and 1 then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_independent_policy(policy jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare language text; expanded jsonb; rule jsonb; evidence jsonb; requested jsonb;
begin
  if not (policy ? 'scope_version') then return public.valid_sentiment_independent_policy_all_languages(policy); end if;
  if policy->'scope_version' is distinct from '1'::jsonb or jsonb_typeof(policy->'languages') is distinct from 'object'
    or jsonb_typeof(policy->'requested_languages') is distinct from 'array' then return false; end if;
  requested := policy->'requested_languages';
  if jsonb_array_length(requested) not between 1 and 3 or
    exists(select 1 from jsonb_array_elements_text(requested) l where l not in ('cebuano','english','filipino')) or
    (select count(distinct l) from jsonb_array_elements_text(requested) l) <> jsonb_array_length(requested) or
    (select count(*) from jsonb_object_keys(policy->'languages')) not between 1 and 3 then return false; end if;
  for language,rule in select * from jsonb_each(policy->'languages') loop
    if language not in ('cebuano','english','filipino') or not requested @> jsonb_build_array(language) then return false; end if;
    evidence := policy->'independent_test'->'languages'->language;
    -- Internally repeat this one language's measurements under the three keys
    -- expected by the original validator. This does not fabricate stored scores.
    expanded := policy || jsonb_build_object('languages',jsonb_build_object('cebuano',rule,'english',rule,'filipino',rule),
      'independent_test',jsonb_build_object('passed',true,'languages',jsonb_build_object('cebuano',evidence,'english',evidence,'filipino',evidence)));
    if not public.valid_sentiment_independent_policy_all_languages(expanded) then return false; end if;
  end loop;
  return coalesce((policy->>'passed')='true' and (policy->'independent_test'->>'passed')='true',false);
exception when invalid_parameter_value or invalid_text_representation then return false;
end $function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_independent_policy_all_languages(policy jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare language text; rule jsonb; check_result jsonb; filename text; field text;
begin
  if (policy->>'version') is distinct from '2' or (policy->>'admission') is distinct from 'independent-v1'
    or (policy->>'passed') is distinct from 'true' or (policy->'independent_test'->>'passed') is distinct from 'true'
    or jsonb_typeof(policy->'languages') is distinct from 'object'
    or policy->'evaluated_pool_ids' is distinct from '[]'::jsonb then return false; end if;
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
    if coalesce(policy->'builtin_hashes'->>filename,'') !~ '^[a-f0-9]{64}$' then return false; end if;
  end loop;
  if (select count(*) from jsonb_object_keys(policy->'languages')) <> 3 then return false; end if;
  foreach language in array array['cebuano','english','filipino'] loop
    rule := policy->'languages'->language;
    check_result := policy->'independent_test'->'languages'->language;
    if rule is null or (check_result->>'passed') is distinct from 'true'
      or not public.valid_sentiment_independent_metrics(check_result->'metrics')
      or not public.valid_sentiment_independent_metrics(check_result->'validation_metrics') then return false; end if;
    if (rule->'primary_confidence') is distinct from '0.85'::jsonb or (rule->'primary_margin') is distinct from '0.2'::jsonb then return false; end if;
    foreach field in array array['support_confidence','support_margin','validation_precision'] loop
      if jsonb_typeof(rule->field) is distinct from 'number' or (rule->>field)::numeric not between 0 and 1 then return false; end if;
    end loop;
    if (rule->>'support_confidence')::numeric<0.5 or (rule->>'support_margin')::numeric<0.05
      or (rule->>'validation_precision')::numeric<0.75
      or jsonb_typeof(rule->'validation_support') is distinct from 'number' or (rule->>'validation_support')::numeric<20
      or trunc((rule->>'validation_support')::numeric)<>(rule->>'validation_support')::numeric
      or jsonb_typeof(check_result->'precision') is distinct from 'number' or (check_result->>'precision')::numeric not between 0.75 and 1
      or jsonb_typeof(check_result->'support') is distinct from 'number' or (check_result->>'support')::numeric<10
      or trunc((check_result->>'support')::numeric)<>(check_result->>'support')::numeric then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_pool_policy(policy jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare language text; rule jsonb; key text;
begin
  if policy is null or (policy->>'version') is distinct from '1' or (policy->>'passed') is distinct from 'true'
    or (policy->'cascade_test'->>'passed') is distinct from 'true' or jsonb_typeof(policy->'languages') is distinct from 'object'
    or policy->'languages'='{}'::jsonb or jsonb_typeof(policy->'evaluated_pool_ids') is distinct from 'array' then return false; end if;
  foreach key in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
    if coalesce(policy->'builtin_hashes'->>key,'') !~ '^[a-f0-9]{64}$' then return false; end if;
  end loop;
  for language,rule in select * from jsonb_each(policy->'languages') loop
    if language not in ('cebuano','english','filipino') then return false; end if;
    foreach key in array array['primary_confidence','primary_margin','support_confidence','support_margin','validation_precision'] loop
      if jsonb_typeof(rule->key) is distinct from 'number' or (rule->>key)::numeric not between 0 and 1 then return false; end if;
    end loop;
    if (rule->>'validation_precision')::numeric < 0.75 or jsonb_typeof(rule->'validation_support') is distinct from 'number'
      or (rule->>'validation_support')::numeric<20 or trunc((rule->>'validation_support')::numeric)<>(rule->>'validation_support')::numeric then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $function$;

revoke all on function public."cleanup_sentiment_analysis"() from public, anon, authenticated, service_role;

revoke all on function public."current_user_role"() from public, anon, authenticated, service_role;

revoke all on function public."enqueue_sentiment_training"(p_mode text) from public, anon, authenticated, service_role;

revoke all on function public."handle_new_credibility"() from public, anon, authenticated, service_role;

revoke all on function public."handle_new_user"() from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_dataset"(p_actor uuid, p_action text, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_supporting_model"(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_supporting_model_independent_legacy"(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_training"(p_actor uuid, p_action text, p_job uuid, p_generation bigint, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."queue_approved_sentiment_training"() from public, anon, authenticated, service_role;

revoke all on function public."record_sentiment_support_usage"(p_ids uuid[]) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_capabilities"() from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_pool_summary"() from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker_independent_legacy"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker_pool_legacy"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker_scope_legacy"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."set_credibility_level"() from public, anon, authenticated, service_role;

revoke all on function public."set_fullname"() from public, anon, authenticated, service_role;

revoke all on function public."set_sentiment_analysis_updated_at"() from public, anon, authenticated, service_role;

revoke all on function public."set_updated_at"() from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_independent_metrics"(m jsonb) from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_independent_policy"(policy jsonb) from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_independent_policy_all_languages"(policy jsonb) from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_pool_policy"(policy jsonb) from public, anon, authenticated, service_role;

grant EXECUTE on function public."cleanup_sentiment_analysis"() to public;

grant EXECUTE on function public."current_user_role"() to public;

grant EXECUTE on function public."enqueue_sentiment_training"(p_mode text) to "service_role";

grant EXECUTE on function public."handle_new_credibility"() to public;

grant EXECUTE on function public."handle_new_user"() to public;

grant EXECUTE on function public."manage_sentiment_dataset"(p_actor uuid, p_action text, p_payload jsonb) to "service_role";

grant EXECUTE on function public."manage_sentiment_supporting_model"(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb) to "service_role";

grant EXECUTE on function public."manage_sentiment_training"(p_actor uuid, p_action text, p_job uuid, p_generation bigint, p_payload jsonb) to "service_role";

grant EXECUTE on function public."queue_approved_sentiment_training"() to "service_role";

grant EXECUTE on function public."record_sentiment_support_usage"(p_ids uuid[]) to "service_role";

grant EXECUTE on function public."sentiment_training_capabilities"() to "service_role";

grant EXECUTE on function public."sentiment_training_pool_summary"() to "service_role";

grant EXECUTE on function public."sentiment_training_worker"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) to "service_role";

grant EXECUTE on function public."set_credibility_level"() to public;

grant EXECUTE on function public."set_fullname"() to public;

grant EXECUTE on function public."set_sentiment_analysis_updated_at"() to public;

grant EXECUTE on function public."set_updated_at"() to public;

grant EXECUTE on function public."valid_sentiment_independent_metrics"(m jsonb) to "service_role";

grant EXECUTE on function public."valid_sentiment_independent_policy"(policy jsonb) to "service_role";

grant EXECUTE on function public."valid_sentiment_pool_policy"(policy jsonb) to "service_role";
