-- Apply after sentiment_language_scoped_training.sql. Telemetry only: never
-- changes admission, worker leases, model activation or approved examples.
begin;
alter table public.sentiment_training_jobs add column if not exists progress jsonb;
alter table public.sentiment_training_jobs add column if not exists progress_lease_token uuid;

create or replace function public.report_sentiment_training_progress(
  p_job uuid, p_lease uuid, p_sequence bigint, p_completed numeric,
  p_total integer, p_stage text, p_language text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare job public.sentiment_training_jobs%rowtype; result jsonb;
begin
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status not in ('training','evaluating') or p_lease is null
    or job.lease_token is distinct from p_lease or job.lease_until is null or job.lease_until <= now() then
    raise exception 'Training lease is stale or invalid' using errcode='40001';
  end if;
  if p_sequence is null or p_sequence < 1 or p_total is null or p_total not between 1 and 100
    or p_completed is null or p_completed::text in ('NaN','Infinity','-Infinity')
    or p_completed < 0 or p_completed >= p_total
    or p_stage is null or p_stage not in ('preparing','fitting','checking','uploading','registering')
    or (p_language is not null and p_language not in ('english','filipino','cebuano')) then
    raise exception 'Invalid training progress' using errcode='22023';
  end if;
  if job.progress_lease_token = p_lease and job.progress is not null and
    (p_sequence <= (job.progress->>'sequence')::bigint or p_total <> (job.progress->>'total')::integer
      or p_completed < (job.progress->>'completed')::numeric) then
    raise exception 'Training progress cannot move backwards' using errcode='22023';
  end if;
  result := jsonb_build_object('version',1,'sequence',p_sequence,'completed',p_completed,
    'total',p_total,'stage',p_stage,'language',p_language,'updatedAt',now());
  update public.sentiment_training_jobs set progress=result, progress_lease_token=p_lease where id=p_job;
  return result;
end $$;

create or replace function public.get_sentiment_training_progress(p_jobs uuid[])
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if p_jobs is null or cardinality(p_jobs) > 10 then
    raise exception 'At most ten training jobs may be read' using errcode='22023';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'progress',
    case when progress_lease_token = lease_token then progress else null end))
    from public.sentiment_training_jobs where id=any(p_jobs)), '[]'::jsonb);
end $$;

revoke all on function public.report_sentiment_training_progress(uuid,uuid,bigint,numeric,integer,text,text),
  public.get_sentiment_training_progress(uuid[]) from public,anon,authenticated;
grant execute on function public.report_sentiment_training_progress(uuid,uuid,bigint,numeric,integer,text,text),
  public.get_sentiment_training_progress(uuid[]) to service_role;
commit;
