-- Apply AFTER sentiment_fresh_candidates.sql. Built-in files/pointers never change.
-- Independent held-out quality + explicit super-admin enabling, not auto-activation.
begin;
select pg_advisory_xact_lock(72846102);

create or replace function public.valid_sentiment_independent_metrics(m jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
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
end $$;

create or replace function public.valid_sentiment_independent_policy(policy jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
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
end $$;
revoke all on function public.valid_sentiment_independent_metrics(jsonb), public.valid_sentiment_independent_policy(jsonb) from public,anon,authenticated;
grant execute on function public.valid_sentiment_independent_metrics(jsonb), public.valid_sentiment_independent_policy(jsonb) to service_role;

-- Wrap the deployed protocol so migration ordering is explicit and reruns are safe.
do $$ begin
  if to_regprocedure('public.sentiment_training_worker_independent_legacy(text,uuid,uuid,jsonb)') is null then
    alter function public.sentiment_training_worker(text,uuid,uuid,jsonb) rename to sentiment_training_worker_independent_legacy;
  end if;
  if to_regprocedure('public.manage_sentiment_supporting_model_independent_legacy(uuid,text,uuid,bigint,jsonb)') is null then
    alter function public.manage_sentiment_supporting_model(uuid,text,uuid,bigint,jsonb) rename to manage_sentiment_supporting_model_independent_legacy;
  end if;
end $$;
revoke all on function public.sentiment_training_worker_independent_legacy(text,uuid,uuid,jsonb),
  public.manage_sentiment_supporting_model_independent_legacy(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated,service_role;

create or replace function public.sentiment_training_worker(p_action text,p_job uuid default null,p_lease uuid default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.sentiment_training_worker(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sentiment_training_worker(text,uuid,uuid,jsonb) to service_role;

create or replace function public.manage_sentiment_supporting_model(p_actor uuid,p_action text,p_model uuid,p_generation bigint,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.manage_sentiment_supporting_model(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.manage_sentiment_supporting_model(uuid,text,uuid,bigint,jsonb) to service_role;

-- Approval collects reviewed data. One row must not trigger an expensive job.
create or replace function public.manage_sentiment_training(p_actor uuid,p_action text,p_job uuid default null,p_generation bigint default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; target uuid;
begin
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode='42501'; end if;
  if p_action <> 'queue' then raise exception 'Built-in models are permanent. Manage supporting models instead.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(72846102);
  if not exists(select 1 from public.sentiment_training_samples s join public.sentiment_datasets d on d.id=s.dataset_id where d.status='approved' and s.active) then
    raise exception 'Approve at least one training example before queueing a candidate.' using errcode='22023'; end if;
  target := public.enqueue_sentiment_training(coalesce(p_payload->>'mode','continue'));
  return jsonb_build_object('job_id',target);
end $$;
revoke all on function public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb) to service_role;

create or replace function public.queue_approved_sentiment_training()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(72846102);
  update public.sentiment_model_state set data_revision=data_revision+1 where id=1;
  insert into public.sentiment_dataset_events(dataset_id,actor_id,actor_name,action,details)
    values(new.id,new.reviewed_by,'Reviewed training pool','training_pool_updated',jsonb_build_object('reason',new.status,'automatic_training',false));
  return new;
end $$;
revoke all on function public.queue_approved_sentiment_training() from public,anon,authenticated;
grant execute on function public.queue_approved_sentiment_training() to service_role;

create or replace function public.sentiment_training_pool_summary()
returns jsonb language sql stable security definer set search_path=public as $$
  with approved as (
    select s.*,d.version from public.sentiment_training_samples s join public.sentiment_datasets d on d.id=s.dataset_id
    where d.status='approved' and s.active
  ), latest as (
    select coalesce(snapshot->'datasets','[]'::jsonb) datasets from public.sentiment_training_jobs
    where status='ready' order by finished_at desc nulls last limit 1
  ), distribution as (
    select language,jsonb_build_object('total',count(*),'negative',count(*) filter(where label='negative'),
      'neutral',count(*) filter(where label='neutral'),'positive',count(*) filter(where label='positive')) counts
    from approved group by language
  )
  select jsonb_build_object('approvedExamples',(select count(*) from approved),
    'approvedDatasets',(select count(*) from public.sentiment_datasets where status='approved'),
    'pendingDatasets',(select count(*) from public.sentiment_datasets where status='pending'),
    'newExamples',(select count(*) from approved a where not coalesce((select datasets from latest),'[]'::jsonb)
       @> jsonb_build_array(jsonb_build_object('id',a.dataset_id,'version',a.version))),
    'languages',coalesce((select jsonb_object_agg(language,counts) from distribution),'{}'::jsonb));
$$;
revoke all on function public.sentiment_training_pool_summary() from public,anon,authenticated;
grant execute on function public.sentiment_training_pool_summary() to service_role;

-- Old candidates are not grandfathered into the new independent admission path.
with changed as (
  update public.sentiment_supporting_models set status='disabled',updated_at=now()
  where status='enabled' and not public.valid_sentiment_independent_policy(routing_policy)
  returning id
), audit as (
  insert into public.sentiment_training_events(job_id,action,details)
  select id,'support_independent_review_required',jsonb_build_object('reason','Retrain under independent admission before enabling') from changed
  returning job_id
)
update public.sentiment_model_state set generation=generation+1,updated_at=now()
where id=1 and exists(select 1 from audit);

create or replace function public.sentiment_training_capabilities()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('continued_training',true,'automatic_activation',false,'supporting_pool',true,'fresh_candidates',true,
    'independent_admission',position('admission: independent-v1' in pg_get_functiondef('public.sentiment_training_worker(text,uuid,uuid,jsonb)'::regprocedure))>0,
    'manual_training',true,'manual_enable',true);
$$;
revoke all on function public.sentiment_training_capabilities() from public,anon,authenticated;
grant execute on function public.sentiment_training_capabilities() to service_role;
NOTIFY pgrst,'reload schema';
commit;
