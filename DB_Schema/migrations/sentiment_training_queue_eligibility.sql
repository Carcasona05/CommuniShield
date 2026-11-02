-- Apply after sentiment_language_scoped_training.sql (and progress, if used).
begin;
select pg_advisory_xact_lock(72846102);
do $$ begin
  if to_regprocedure('public.manage_sentiment_training_eligibility_legacy(uuid,text,uuid,bigint,jsonb)') is null then
    alter function public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb)
      rename to manage_sentiment_training_eligibility_legacy;
  end if;
end $$;
revoke all on function public.manage_sentiment_training_eligibility_legacy(uuid,text,uuid,bigint,jsonb)
  from public,anon,authenticated,service_role;

create or replace function public.manage_sentiment_training(p_actor uuid,p_action text,p_job uuid default null,p_generation bigint default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; eligible uuid[]; selected uuid[]; retry public.sentiment_training_jobs%rowtype;
  request jsonb := p_payload; result jsonb;
begin
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then
    raise exception 'Super admin access required' using errcode='42501'; end if;
  if p_action <> 'queue' then raise exception 'Built-in models are permanent.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(72846102);
  if exists(select 1 from public.sentiment_training_jobs where status='queued' or
    (status in ('training','evaluating') and lease_until>now())) then
    raise exception 'A training run is already queued or running.' using errcode='40001'; end if;

  if p_payload ? 'retry_job_id' then
    select * into retry from public.sentiment_training_jobs where id=(p_payload->>'retry_job_id')::uuid;
    if retry.id is null or not (retry.status='failed' or
      (retry.status in ('training','evaluating') and retry.lease_until<=now()))
      or retry.snapshot is null or retry.data_revision is distinct from (select data_revision from public.sentiment_model_state where id=1)
      or retry.id is distinct from (select id from public.sentiment_training_jobs order by created_at desc,id desc limit 1) then
      raise exception 'This run cannot be retried. Refresh and queue newly approved data instead.' using errcode='22023'; end if;
    select array_agg((d->>'id')::uuid) into selected from jsonb_array_elements(retry.snapshot->'datasets') d
      where exists(select 1 from public.sentiment_datasets current where current.id=(d->>'id')::uuid
        and current.status='approved' and current.version=(d->>'version')::integer);
    if selected is null or cardinality(selected) <> jsonb_array_length(retry.snapshot->'datasets') then
      raise exception 'Retry requires the original approved dataset versions.' using errcode='22023'; end if;
    request := jsonb_build_object('mode',retry.training_mode,'dataset_ids',to_jsonb(selected));
  else
    select array_agg(distinct d.id) into eligible from public.sentiment_datasets d
      join public.sentiment_training_samples s on s.dataset_id=d.id and s.active
      where d.status='approved' and not exists(select 1 from public.sentiment_training_jobs j
        where (j.status='ready' or (j.status in ('training','evaluating') and j.lease_until>now())
          or (j.status='failed' and jsonb_typeof(j.metrics->'training')='object'))
        and j.snapshot->'datasets' @> jsonb_build_array(jsonb_build_object('id',d.id,'version',d.version)));
    if eligible is null then
      raise exception 'No approved, untrained datasets are ready to queue.' using errcode='22023'; end if;
    if p_payload ? 'dataset_ids' then
      if jsonb_typeof(p_payload->'dataset_ids') is distinct from 'array' or jsonb_array_length(p_payload->'dataset_ids')=0 then
        raise exception 'Select approved datasets ready to train.' using errcode='22023'; end if;
      select array_agg(value::uuid) into selected from jsonb_array_elements_text(p_payload->'dataset_ids');
      if not selected <@ eligible then raise exception 'Selected datasets are not approved and ready to train.' using errcode='22023'; end if;
      request := p_payload || jsonb_build_object('dataset_ids',to_jsonb(selected));
    end if;
    -- With no explicit selection, preserve the language-scope protocol's choice
    -- of newly approved datasets rather than broadening to older failed uploads.
  end if;
  result := public.manage_sentiment_training_eligibility_legacy(p_actor,p_action,p_job,p_generation,request);
  if p_payload ? 'retry_job_id' then
    update public.sentiment_training_jobs set training_languages=retry.training_languages where id=(result->>'job_id')::uuid;
    result := result || jsonb_build_object('requested_languages',retry.training_languages);
  end if;
  return result;
end $$;
revoke all on function public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
