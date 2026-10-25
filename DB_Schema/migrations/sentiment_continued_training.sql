-- Apply AFTER sentiment_training_jobs.sql. Service-role-only automatic updates.
-- Existing active models are not changed by applying this migration.
begin;
create or replace function public.sentiment_training_worker(p_action text, p_job uuid default null, p_lease uuid default null, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on function public.sentiment_training_worker(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sentiment_training_worker(text,uuid,uuid,jsonb) to service_role;

-- Read-only capability probe, independent of jobs, leases and advisory locks.
-- Inspect the installed definition so reapplying the OLD worker migration is
-- detected instead of falsely advertising support for automatic updates.
create or replace function public.sentiment_training_capabilities()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'continued_training', position('protocol: continued-training-v1' in pg_get_functiondef('public.sentiment_training_worker(text,uuid,uuid,jsonb)'::regprocedure)) > 0,
    'automatic_activation', position('protocol: continued-training-v1' in pg_get_functiondef('public.sentiment_training_worker(text,uuid,uuid,jsonb)'::regprocedure)) > 0
  );
$$;
revoke all on function public.sentiment_training_capabilities() from public,anon,authenticated;
grant execute on function public.sentiment_training_capabilities() to service_role;
NOTIFY pgrst, 'reload schema';
commit;
