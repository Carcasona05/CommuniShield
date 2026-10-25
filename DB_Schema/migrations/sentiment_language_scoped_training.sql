-- Apply after sentiment_pending_training_summary.sql. No model is auto-enabled.
begin;
select pg_advisory_xact_lock(72846102);
alter table public.sentiment_training_jobs add column if not exists training_languages text[];

-- Reuse the strict existing validator per language; no quality floor is removed.
do $$ begin
  if to_regprocedure('public.valid_sentiment_independent_policy_all_languages(jsonb)') is null then
    alter function public.valid_sentiment_independent_policy(jsonb) rename to valid_sentiment_independent_policy_all_languages;
  end if;
  if to_regprocedure('public.sentiment_training_worker_scope_legacy(text,uuid,uuid,jsonb)') is null then
    alter function public.sentiment_training_worker(text,uuid,uuid,jsonb) rename to sentiment_training_worker_scope_legacy;
  end if;
end $$;
revoke all on function public.valid_sentiment_independent_policy_all_languages(jsonb),public.sentiment_training_worker_scope_legacy(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.valid_sentiment_independent_policy(policy jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
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
end $$;
revoke all on function public.valid_sentiment_independent_policy(jsonb) from public,anon,authenticated;
grant execute on function public.valid_sentiment_independent_policy(jsonb) to service_role;

create or replace function public.manage_sentiment_training(p_actor uuid,p_action text,p_job uuid default null,p_generation bigint default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb) to service_role;

create or replace function public.sentiment_training_worker(p_action text,p_job uuid default null,p_lease uuid default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.sentiment_training_worker(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sentiment_training_worker(text,uuid,uuid,jsonb) to service_role;

create or replace function public.sentiment_training_capabilities()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('continued_training',true,'automatic_activation',false,'supporting_pool',true,'fresh_candidates',true,
    'independent_admission',true,'manual_training',true,'manual_enable',true,'language_scoped_training',true);
$$;
revoke all on function public.sentiment_training_capabilities() from public,anon,authenticated;
grant execute on function public.sentiment_training_capabilities() to service_role;
NOTIFY pgrst,'reload schema';
commit;
