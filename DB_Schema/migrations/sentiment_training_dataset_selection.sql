-- Run after sentiment_training_queue_eligibility.sql / the finalized schema.
-- Keep the full immutable training pool, but track queue selection separately.
-- Historical pool snapshots do not prove which datasets were selected. Leave
-- those receipts NULL: ambiguous legacy datasets may reappear as ready to queue.
begin;
select pg_advisory_xact_lock(72846102);

do $$ begin
  if to_regprocedure('public.manage_sentiment_training_eligibility_legacy(uuid,text,uuid,bigint,jsonb)') is null then
    raise exception 'Install sentiment training queue eligibility before dataset selection tracking.';
  end if;
end $$;

alter table public.sentiment_training_jobs
  add column if not exists selected_dataset_versions jsonb;
comment on column public.sentiment_training_jobs.selected_dataset_versions is
  'Exact approved dataset id/version selection at queue time; NULL means unknown legacy provenance, not the full approved snapshot.';

create or replace function public.sentiment_dataset_ready_to_queue(p_dataset uuid,p_version integer)
returns boolean language sql stable security definer set search_path=public as $$
  select not exists (
    select 1 from public.sentiment_training_jobs j
    where (j.status in ('queued','ready')
      or (j.status in ('training','evaluating') and j.lease_until>now())
      or (j.status='failed' and jsonb_typeof(j.metrics->'training')='object'))
    and j.selected_dataset_versions @>
      jsonb_build_array(jsonb_build_object('id',p_dataset,'version',p_version))
  );
$$;
revoke all on function public.sentiment_dataset_ready_to_queue(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.sentiment_dataset_ready_to_queue(uuid,integer) to service_role;

create or replace function public.manage_sentiment_training(p_actor uuid,p_action text,p_job uuid default null,p_generation bigint default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; eligible uuid[]; selected uuid[];
  retry public.sentiment_training_jobs%rowtype; versions jsonb;
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
    if retry.selected_dataset_versions is null then
      raise exception 'This older run has no exact dataset selection. Select the intended datasets and queue a new run.' using errcode='22023'; end if;
    select array_agg((d->>'id')::uuid order by d->>'id') into selected
      from jsonb_array_elements(retry.selected_dataset_versions) d
      where exists(select 1 from public.sentiment_datasets current where current.id=(d->>'id')::uuid
        and current.status='approved' and current.version=(d->>'version')::integer);
    if selected is null or cardinality(selected) <> jsonb_array_length(retry.selected_dataset_versions) then
      raise exception 'Retry requires the original approved dataset versions.' using errcode='22023'; end if;
    versions := retry.selected_dataset_versions;
    request := jsonb_build_object('mode',retry.training_mode,'dataset_ids',to_jsonb(selected));
  else
    select array_agg(distinct d.id order by d.id) into eligible from public.sentiment_datasets d
      join public.sentiment_training_samples s on s.dataset_id=d.id and s.active
      where d.status='approved' and public.sentiment_dataset_ready_to_queue(d.id,d.version);
    if eligible is null then
      raise exception 'No approved, untrained datasets are ready to queue.' using errcode='22023'; end if;
    if p_payload ? 'dataset_ids' then
      if jsonb_typeof(p_payload->'dataset_ids') is distinct from 'array' then
        raise exception 'Select approved datasets ready to train.' using errcode='22023'; end if;
      if jsonb_array_length(p_payload->'dataset_ids')=0 then
        raise exception 'Select approved datasets ready to train.' using errcode='22023'; end if;
      select array_agg(distinct value::uuid order by value::uuid) into selected
        from jsonb_array_elements_text(p_payload->'dataset_ids');
      if selected is null or array_position(selected,null) is not null or not selected <@ eligible then
        raise exception 'Selected datasets are not approved and ready to train.' using errcode='22023'; end if;
    else
      selected := eligible;
    end if;
    select jsonb_agg(jsonb_build_object('id',d.id,'version',d.version) order by d.id)
      into versions from public.sentiment_datasets d where d.id=any(selected);
    -- Always pass the resolved selection, including the default "all ready" case.
    request := p_payload || jsonb_build_object('dataset_ids',to_jsonb(selected));
  end if;
  result := public.manage_sentiment_training_eligibility_legacy(p_actor,p_action,p_job,p_generation,request);
  update public.sentiment_training_jobs set selected_dataset_versions=versions
    where id=(result->>'job_id')::uuid;
  if p_payload ? 'retry_job_id' then
    update public.sentiment_training_jobs set training_languages=retry.training_languages where id=(result->>'job_id')::uuid;
    result := result || jsonb_build_object('requested_languages',retry.training_languages);
  end if;
  insert into public.sentiment_training_events(job_id,actor_id,action,details)
    values((result->>'job_id')::uuid,p_actor,'dataset_selection',jsonb_build_object('datasets',versions));
  return result || jsonb_build_object('selected_datasets',versions);
end $$;
revoke all on function public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb) to service_role;
-- Keep the private queue path inaccessible to API roles.
revoke all on function public.manage_sentiment_training_eligibility_legacy(uuid,text,uuid,bigint,jsonb)
  from public,anon,authenticated,service_role;

create or replace function public.sentiment_training_pool_summary()
returns jsonb language sql stable security definer set search_path=public as $$
  with approved as (
    select s.*,d.version from public.sentiment_training_samples s
    join public.sentiment_datasets d on d.id=s.dataset_id where d.status='approved' and s.active
  ), pending as (
    select a.* from approved a where public.sentiment_dataset_ready_to_queue(a.dataset_id,a.version)
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
  select jsonb_build_object('queueSummaryVersion',1,'datasetSelectionVersion',1,
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
$$;
revoke all on function public.sentiment_training_pool_summary() from public,anon,authenticated;
grant execute on function public.sentiment_training_pool_summary() to service_role;
notify pgrst,'reload schema';
commit;
