-- Apply after sentiment_continued_training.sql. Never enables legacy models.
begin;
create table if not exists public.sentiment_supporting_models (
  id uuid primary key references public.sentiment_training_jobs(id),
  name text not null,
  status text not null default 'disabled' check (status in ('disabled','enabled','archived','deleted')),
  artifact_manifest jsonb not null,
  routing_policy jsonb not null default '{}'::jsonb,
  metrics jsonb not null,
  datasets jsonb not null default '[]'::jsonb,
  use_count bigint not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.sentiment_supporting_settings (
  id integer primary key check (id=1),
  max_enabled integer not null default 3 check (max_enabled between 1 and 3)
);
insert into public.sentiment_supporting_settings(id) values (1) on conflict do nothing;
alter table public.sentiment_supporting_models enable row level security;
alter table public.sentiment_supporting_settings enable row level security;
revoke all on public.sentiment_supporting_models,public.sentiment_supporting_settings from public,anon,authenticated;
grant all on public.sentiment_supporting_models,public.sentiment_supporting_settings to service_role;

-- Preserve legacy candidates for audit, DISABLED with no assumed routing policy.
insert into public.sentiment_supporting_models(id,name,artifact_manifest,metrics,datasets,created_at)
select id,'Legacy candidate ' || left(id::text,8),artifact_manifest,metrics,coalesce(snapshot->'datasets','[]'::jsonb),created_at
from public.sentiment_training_jobs where status='ready' and artifact_manifest is not null
on conflict do nothing;
update public.sentiment_model_state set active_job_id=null,previous_job_id=null,generation=generation+1,updated_at=now()
where id=1 and (active_job_id is not null or previous_job_id is not null);

do $$ begin
  if to_regprocedure('public.sentiment_training_worker_pool_legacy(text,uuid,uuid,jsonb)') is null then
    alter function public.sentiment_training_worker(text,uuid,uuid,jsonb) rename to sentiment_training_worker_pool_legacy;
  end if;
end $$;
revoke all on function public.sentiment_training_worker_pool_legacy(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.valid_sentiment_pool_policy(policy jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
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
end $$;
revoke all on function public.valid_sentiment_pool_policy(jsonb) from public,anon,authenticated;
grant execute on function public.valid_sentiment_pool_policy(jsonb) to service_role;

create or replace function public.manage_sentiment_supporting_model(p_actor uuid,p_action text,p_model uuid,p_generation bigint,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.manage_sentiment_supporting_model(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.manage_sentiment_supporting_model(uuid,text,uuid,bigint,jsonb) to service_role;

create or replace function public.sentiment_training_worker(p_action text,p_job uuid default null,p_lease uuid default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare job public.sentiment_training_jobs%rowtype; state public.sentiment_model_state%rowtype;
  result jsonb; manifest jsonb; policy jsonb; filename text; file jsonb; cap integer; enabled integer; auto_enable boolean;
begin
  -- protocol: supporting-pool-v1
  if p_action='capabilities' then return public.sentiment_training_capabilities(); end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action='claim' then
    if (p_payload->>'pool_protocol') is distinct from '1' then raise exception 'Updated supporting-pool worker required' using errcode='22023'; end if;
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
    raise exception 'Pool or approved data changed during evaluation' using errcode='40001'; end if;
  if (p_payload->'metrics'->>'passed') is distinct from 'true' or
     (p_payload->'metrics'->>'pool_protocol') is distinct from '1' or
     (job.snapshot->>'pool_protocol') is distinct from '1' then
    raise exception 'A passing supporting-pool evaluation is required' using errcode='22023'; end if;
  manifest := p_payload->'manifest';
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx','sentiment_english.joblib','sentiment_filipino.joblib','sentiment_cebuano.joblib'] loop
    file := case when filename like '%.joblib' then manifest->'training_files'->filename else manifest->'files'->filename end;
    if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
      or (file->>'path') is distinct from (job.id::text||'/'||job.lease_token::text||'/'||filename) then
      raise exception 'Complete checked inference/training artifacts required' using errcode='22023'; end if;
  end loop;
  policy := coalesce(p_payload->'metrics'->'routing_policy','{}'::jsonb);
  if policy->'builtin_hashes' is distinct from job.snapshot->'builtin_hashes' then raise exception 'Built-in fingerprint differs' using errcode='22023'; end if;
  select max_enabled into cap from public.sentiment_supporting_settings where id=1;
  select count(*) into enabled from public.sentiment_supporting_models where status='enabled';
  auto_enable := public.valid_sentiment_pool_policy(policy) and enabled<cap;
  if auto_enable and coalesce(policy->'evaluated_pool_ids','[]'::jsonb) is distinct from
     coalesce((select jsonb_agg(id::text order by id::text) from public.sentiment_supporting_models where status='enabled'),'[]'::jsonb) then
    raise exception 'Evaluated pool does not match enabled models' using errcode='40001'; end if;
  update public.sentiment_training_jobs set status='ready',metrics=p_payload->'metrics',artifact_manifest=manifest,finished_at=now(),lease_until=null where id=job.id;
  insert into public.sentiment_supporting_models(id,name,status,artifact_manifest,routing_policy,metrics,datasets)
    values(job.id,'Supporting model '||left(job.id::text,8),case when coalesce(auto_enable,false) then 'enabled' else 'disabled' end,
      manifest,policy,p_payload->'metrics',coalesce(job.snapshot->'datasets','[]'::jsonb));
  update public.sentiment_model_state set generation=generation+1,active_job_id=null,previous_job_id=null,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,action,details) values(job.id,'support_registered',jsonb_build_object('enabled',coalesce(auto_enable,false),'built_in_unchanged',true));
  return jsonb_build_object('id',job.id,'support_enabled',coalesce(auto_enable,false),'built_in_unchanged',true);
end $$;
revoke all on function public.sentiment_training_worker(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sentiment_training_worker(text,uuid,uuid,jsonb) to service_role;

-- Old clients cannot switch the permanent primary through legacy actions.
create or replace function public.manage_sentiment_training(p_actor uuid,p_action text,p_job uuid default null,p_generation bigint default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; target uuid;
begin
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode='42501'; end if;
  if p_action <> 'queue' then raise exception 'Built-in models are permanent. Manage supporting models instead.' using errcode='22023'; end if;
  target := public.enqueue_sentiment_training(); return jsonb_build_object('job_id',target);
end $$;
revoke all on function public.manage_sentiment_training(uuid,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.manage_sentiment_training(uuid,text,uuid,bigint) to service_role;

create or replace function public.sentiment_training_capabilities()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('continued_training',true,'automatic_activation',false,'supporting_pool',
    position('protocol: supporting-pool-v1' in pg_get_functiondef('public.sentiment_training_worker(text,uuid,uuid,jsonb)'::regprocedure))>0);
$$;
revoke all on function public.sentiment_training_capabilities() from public,anon,authenticated;
grant execute on function public.sentiment_training_capabilities() to service_role;

create or replace function public.record_sentiment_support_usage(p_ids uuid[])
returns void language sql security definer set search_path=public as $$
  update public.sentiment_supporting_models set use_count=use_count+1,last_used_at=now()
  where id=any(p_ids) and status <> 'deleted';
$$;
revoke all on function public.record_sentiment_support_usage(uuid[]) from public,anon,authenticated;
grant execute on function public.record_sentiment_support_usage(uuid[]) to service_role;
NOTIFY pgrst,'reload schema';
commit;
