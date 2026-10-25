-- Apply after sentiment_supporting_pool.sql. Adds an opt-in fresh-training mode
-- for supporting candidates (train from scratch on all approved data) while the
-- permanent built-in primary and every evaluation gate stay unchanged.
begin;
alter table public.sentiment_training_jobs
  add column if not exists training_mode text not null default 'continue';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sentiment_training_jobs_training_mode_check') then
    alter table public.sentiment_training_jobs
      add constraint sentiment_training_jobs_training_mode_check check (training_mode in ('continue','fresh'));
  end if;
end $$;

-- Mode-aware enqueue. An explicit fresh request upgrades an unclaimed queued
-- job; background approvals (continue) never downgrade a pending fresh job, so
-- dataset-approval triggers keep working unconditionally.
drop function if exists public.enqueue_sentiment_training();
create function public.enqueue_sentiment_training(p_mode text default 'continue')
returns uuid language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on function public.enqueue_sentiment_training(text) from public, anon, authenticated;
grant execute on function public.enqueue_sentiment_training(text) to service_role;

-- The queue action forwards an optional mode payload. Non-queue actions stay
-- rejected: built-in models are permanent.
drop function if exists public.manage_sentiment_training(uuid,text,uuid,bigint);
create function public.manage_sentiment_training(p_actor uuid, p_action text, p_job uuid default null, p_generation bigint default null, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor public.profiles%rowtype; target uuid;
begin
  select * into actor from public.profiles where id = p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode = '42501'; end if;
  if p_action <> 'queue' then raise exception 'Built-in models are permanent. Manage supporting models instead.' using errcode = '22023'; end if;
  target := public.enqueue_sentiment_training(coalesce(p_payload->>'mode', 'continue'));
  return jsonb_build_object('job_id', target);
end $$;
revoke all on function public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb) to service_role;

-- Worker protocol v2: same gates, plus two fail-closed checks so an outdated
-- worker can never silently train or register a job under the wrong mode.
create or replace function public.sentiment_training_worker(p_action text,p_job uuid default null,p_lease uuid default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.sentiment_training_worker(text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.sentiment_training_worker(text,uuid,uuid,jsonb) to service_role;

create or replace function public.sentiment_training_capabilities()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('continued_training',true,'automatic_activation',false,'supporting_pool',
    position('protocol: supporting-pool-v1' in pg_get_functiondef('public.sentiment_training_worker(text,uuid,uuid,jsonb)'::regprocedure))>0,
    'fresh_candidates',
    to_regprocedure('public.enqueue_sentiment_training(text)') is not null
    and exists (select 1 from information_schema.columns where table_schema='public'
      and table_name='sentiment_training_jobs' and column_name='training_mode'));
$$;
revoke all on function public.sentiment_training_capabilities() from public, anon, authenticated;
grant execute on function public.sentiment_training_capabilities() to service_role;

NOTIFY pgrst,'reload schema';
commit;
