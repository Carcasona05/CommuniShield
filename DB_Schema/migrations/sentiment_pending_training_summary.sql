-- Apply after sentiment_independent_admission.sql.
-- Read-only summary change: no data is removed and training inputs are unchanged.
begin;
create or replace function public.sentiment_training_pool_summary()
returns jsonb language sql stable security definer set search_path=public as $$
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
$$;
revoke all on function public.sentiment_training_pool_summary() from public,anon,authenticated;
grant execute on function public.sentiment_training_pool_summary() to service_role;
NOTIFY pgrst,'reload schema';
commit;
