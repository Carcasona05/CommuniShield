-- Apply AFTER sentiment_datasets.sql. No existing model is activated by this migration.
create table if not exists public.sentiment_training_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued' check (status in ('queued','training','evaluating','ready','failed')),
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now() + interval '30 seconds',
  started_at timestamptz,
  finished_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  data_revision bigint,
  base_generation bigint,
  base_job_id uuid references public.sentiment_training_jobs(id),
  snapshot jsonb,
  metrics jsonb,
  artifact_manifest jsonb,
  error text
);
create unique index if not exists sentiment_one_queued_job on public.sentiment_training_jobs ((true)) where status = 'queued';
create unique index if not exists sentiment_one_running_job on public.sentiment_training_jobs ((true)) where status in ('training','evaluating');
create table if not exists public.sentiment_model_state (
  id integer primary key check (id = 1),
  generation bigint not null default 0,
  data_revision bigint not null default 0,
  active_job_id uuid references public.sentiment_training_jobs(id),
  previous_job_id uuid references public.sentiment_training_jobs(id),
  updated_at timestamptz not null default now()
);
insert into public.sentiment_model_state(id) values (1) on conflict do nothing;
create table if not exists public.sentiment_training_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.sentiment_training_jobs(id),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.sentiment_training_jobs enable row level security;
alter table public.sentiment_model_state enable row level security;
alter table public.sentiment_training_events enable row level security;
revoke all on public.sentiment_training_jobs, public.sentiment_model_state, public.sentiment_training_events from public, anon, authenticated;
grant all on public.sentiment_training_jobs, public.sentiment_model_state, public.sentiment_training_events to service_role;

create or replace function public.enqueue_sentiment_training()
returns uuid language plpgsql security definer set search_path = public as $$
declare result uuid;
begin
  perform pg_advisory_xact_lock(72846102);
  select id into result from public.sentiment_training_jobs where status = 'queued' for update;
  if result is null then
    insert into public.sentiment_training_jobs default values returning id into result;
    insert into public.sentiment_training_events(job_id, action) values (result, 'queued');
  else
    -- Coalesce approvals during a short debounce window. The snapshot is taken
    -- when a worker claims the job, not while an approval request is running.
    update public.sentiment_training_jobs set available_at = least(created_at + interval '2 minutes', now() + interval '30 seconds') where id = result;
  end if;
  return result;
end $$;
revoke all on function public.enqueue_sentiment_training() from public, anon, authenticated;
grant execute on function public.enqueue_sentiment_training() to service_role;

create or replace function public.queue_approved_sentiment_training()
returns trigger language plpgsql security definer set search_path = public as $$
declare job uuid;
begin
  perform pg_advisory_xact_lock(72846102);
  update public.sentiment_model_state set data_revision = data_revision + 1 where id = 1;
  job := public.enqueue_sentiment_training();
  insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
    values (new.id, new.reviewed_by, 'Training queue', 'training_queued', jsonb_build_object('job_id', job, 'reason', new.status));
  return new;
end $$;
drop trigger if exists sentiment_dataset_approval_training on public.sentiment_datasets;
create trigger sentiment_dataset_approval_training after update of status on public.sentiment_datasets
  for each row when (old.status is distinct from new.status and (new.status = 'approved' or old.status = 'approved'))
  execute function public.queue_approved_sentiment_training();
revoke all on function public.queue_approved_sentiment_training() from public, anon, authenticated;
grant execute on function public.queue_approved_sentiment_training() to service_role;

-- Service-role-only worker protocol. Lease tokens fence off stale/crashed workers.
create or replace function public.sentiment_training_worker(p_action text, p_job uuid default null, p_lease uuid default null, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  job public.sentiment_training_jobs%rowtype;
  state public.sentiment_model_state%rowtype;
  inputs jsonb;
  filename text;
  file jsonb;
begin
  perform pg_advisory_xact_lock(72846102);
  if p_action = 'claim' then
    update public.sentiment_training_jobs set status = 'failed', error = 'Worker lease expired. Queue a retry.', finished_at = now()
      where status in ('training','evaluating') and lease_until < now();
    if exists (select 1 from public.sentiment_training_jobs where status in ('training','evaluating')) then return null; end if;
    select * into job from public.sentiment_training_jobs where status = 'queued' and available_at <= now() order by created_at limit 1 for update;
    if job.id is null then return null; end if;
    select * into state from public.sentiment_model_state where id = 1;
    if (select count(*) from (select 1 from public.sentiment_training_samples s join public.sentiment_datasets d on d.id = s.dataset_id where d.status = 'approved' and s.active limit 50001) pool) > 50000 then
      update public.sentiment_training_jobs set status='failed', finished_at=now(), error='Approved pool exceeds the 50,000-example worker limit.' where id=job.id;
      insert into public.sentiment_training_events(job_id, action) values (job.id, 'failed');
      return null;
    end if;
    select jsonb_build_object(
      'datasets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'version', version) order by id) from public.sentiment_datasets where status = 'approved'), '[]'::jsonb),
      'samples', coalesce((select jsonb_agg(jsonb_build_object('text', s.text, 'language', s.language, 'label', s.label) order by s.id)
        from public.sentiment_training_samples s join public.sentiment_datasets d on d.id = s.dataset_id where d.status = 'approved' and s.active), '[]'::jsonb)
    ) into inputs;
    update public.sentiment_training_jobs set status = 'training', started_at = now(), lease_token = gen_random_uuid(), lease_until = now() + interval '5 minutes',
      snapshot = inputs, data_revision = state.data_revision, base_generation = state.generation, base_job_id = state.active_job_id
      where id = job.id returning * into job;
    insert into public.sentiment_training_events(job_id, action) values (job.id, 'training');
    return to_jsonb(job);
  end if;
  select * into job from public.sentiment_training_jobs where id = p_job for update;
  if job.id is null or job.status not in ('training','evaluating') or job.lease_token is distinct from p_lease or job.lease_until < now() then
    raise exception 'Training lease is stale or invalid' using errcode = '40001';
  end if;
  if p_action = 'heartbeat' then
    update public.sentiment_training_jobs set lease_until = now() + interval '5 minutes' where id = job.id;
  elsif p_action = 'evaluating' then
    update public.sentiment_training_jobs set status = 'evaluating', lease_until = now() + interval '5 minutes' where id = job.id;
  elsif p_action = 'fail' then
    update public.sentiment_training_jobs set status = 'failed', error = left(coalesce(p_payload->>'error','Training failed'), 1000), metrics = p_payload->'metrics', finished_at = now(), lease_until = null where id = job.id;
  elsif p_action = 'complete' then
    if job.status <> 'evaluating' or (p_payload->'metrics'->>'passed') is distinct from 'true' then raise exception 'A passing evaluation is required' using errcode = '22023'; end if;
    foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
      file := p_payload->'manifest'->'files'->filename;
      if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
        or (file->>'path') is distinct from (job.id::text || '/' || job.lease_token::text || '/' || filename) then
        raise exception 'Incomplete or invalid model manifest' using errcode = '22023';
      end if;
    end loop;
    update public.sentiment_training_jobs set status = 'ready', metrics = p_payload->'metrics', artifact_manifest = p_payload->'manifest', finished_at = now(), lease_until = null where id = job.id;
  else raise exception 'Unsupported worker action' using errcode = '22023';
  end if;
  if p_action <> 'heartbeat' then insert into public.sentiment_training_events(job_id, action) values (job.id, p_action); end if;
  return jsonb_build_object('id', job.id);
end $$;
revoke all on function public.sentiment_training_worker(text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sentiment_training_worker(text, uuid, uuid, jsonb) to service_role;

create or replace function public.manage_sentiment_training(p_actor uuid, p_action text, p_job uuid default null, p_generation bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles%rowtype;
  state public.sentiment_model_state%rowtype;
  job public.sentiment_training_jobs%rowtype;
  target uuid;
begin
  select * into actor from public.profiles where id = p_actor;
  if actor.id is null or actor.role <> 'super_admin' or actor.status = 'Disabled' then raise exception 'Super admin access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(72846102);
  select * into state from public.sentiment_model_state where id = 1 for update;
  if p_action = 'queue' then
    target := public.enqueue_sentiment_training();
  elsif p_action in ('activate','rollback') then
    if p_generation is distinct from state.generation then raise exception 'Active model changed. Refresh first.' using errcode = '40001'; end if;
    if exists (select 1 from public.sentiment_training_jobs where status in ('training','evaluating') and lease_until > now()) then
      raise exception 'Wait for the running evaluation before changing the active model' using errcode = '22023';
    end if;
    if p_action = 'activate' then
      select * into job from public.sentiment_training_jobs where id = p_job;
      if job.id is null or job.status <> 'ready' or (job.metrics->>'passed') is distinct from 'true' or job.artifact_manifest is null then raise exception 'Only a passing candidate can be activated' using errcode = '22023'; end if;
      if job.base_generation <> state.generation or job.data_revision <> state.data_revision then raise exception 'Candidate is stale. Queue fresh training.' using errcode = '40001'; end if;
      target := job.id;
    else
      if state.active_job_id is null then raise exception 'No active candidate to roll back' using errcode = '22023'; end if;
      target := state.previous_job_id; -- NULL restores the bundled baseline.
    end if;
    update public.sentiment_model_state set active_job_id = target, previous_job_id = state.active_job_id, generation = generation + 1, updated_at = now() where id = 1;
  else raise exception 'Unsupported training action' using errcode = '22023';
  end if;
  insert into public.sentiment_training_events(job_id, actor_id, action, details)
    values (target, p_actor, p_action, jsonb_build_object('previous_job_id', state.active_job_id, 'previous_generation', state.generation));
  return jsonb_build_object('job_id', target);
end $$;
revoke all on function public.manage_sentiment_training(uuid, text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.manage_sentiment_training(uuid, text, uuid, bigint) to service_role;

-- Supabase Storage remains private; no browser bucket policies are added.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('sentiment-models','sentiment-models',false,104857600,array['application/octet-stream','application/json'])
  on conflict (id) do update set public = false, file_size_limit = 104857600, allowed_mime_types = excluded.allowed_mime_types;

-- Existing approved data is not forgotten when upgrading from manual exports.
do $$ begin
  if exists (select 1 from public.sentiment_datasets where status = 'approved') and not exists (select 1 from public.sentiment_training_jobs) then
    perform public.enqueue_sentiment_training();
  end if;
end $$;
