-- MANUAL, DESTRUCTIVE OPERATION. Never include in automatic migrations.
-- Permanently deletes ALL uploaded sentiment datasets, reviewed samples,
-- supporting-model records, training jobs, and their events.
-- Export a backup first. Stop workers and the API before executing.
-- Keeps built-in files, reports/comments and their sentiment results, accounts,
-- settings, schema, RLS, function grants, and lease checks unchanged.
-- Separately empty ONLY the sentiment-models bucket via the Storage UI/API.
-- Never delete storage.objects/storage.buckets rows directly with SQL.

begin;
set local lock_timeout = '10s';
select pg_advisory_xact_lock(72846102);

-- Detach model pointers before deleting jobs. Keep generations monotonic to
-- prevent pre-reset requests/caches from matching a reused generation/revision.
update public.sentiment_model_state
set active_job_id=null,
    previous_job_id=null,
    generation=generation+1,
    data_revision=data_revision+1,
    updated_at=now()
where id=1;

delete from public.sentiment_supporting_models;
delete from public.sentiment_training_events;
delete from public.sentiment_training_jobs;
delete from public.sentiment_dataset_events;
delete from public.sentiment_training_samples;
delete from public.sentiment_datasets;

-- No CASCADE, schema changes, or trigger/RLS disabling. Unexpected references
-- must fail and roll back rather than erase unrelated records.
commit;

select 'datasets' as item,count(*) as remaining from public.sentiment_datasets
union all select 'samples',count(*) from public.sentiment_training_samples
union all select 'training_jobs',count(*) from public.sentiment_training_jobs
union all select 'supporting_models',count(*) from public.sentiment_supporting_models;
