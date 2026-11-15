-- Deploy before the analysis responsiveness release. No client table access.
begin;
create table if not exists public.admin_analysis_batches (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null,
  report_ids uuid[] not null, created_at timestamptz not null default now()
);
create table if not exists public.admin_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('credibility','report_sentiment','comment_sentiment','status_followup')),
  subject_id uuid not null, report_id uuid not null,
  payload jsonb not null default '{}',
  state text not null default 'queued' check (state in ('queued','running','succeeded','failed','skipped')),
  attempts integer not null default 0, available_at timestamptz not null default now(),
  lease_token uuid, lease_until timestamptz, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists admin_analysis_batch_actor_idx on public.admin_analysis_batches(actor_id,created_at desc);
create unique index if not exists admin_analysis_active_idx on public.admin_analysis_jobs(kind,subject_id)
  where state in ('queued','running') and kind <> 'status_followup';
create index if not exists admin_analysis_ready_idx on public.admin_analysis_jobs(available_at,created_at) where state in ('queued','running');
create index if not exists admin_analysis_report_idx on public.admin_analysis_jobs(report_id,created_at desc);
create table if not exists public.admin_analysis_batch_jobs (
  batch_id uuid not null references public.admin_analysis_batches(id) on delete cascade,
  job_id uuid not null references public.admin_analysis_jobs(id) on delete cascade,
  primary key(batch_id,job_id)
);
alter table public.admin_analysis_batches enable row level security;
alter table public.admin_analysis_jobs enable row level security;
alter table public.admin_analysis_batch_jobs enable row level security;
revoke all on public.admin_analysis_batches, public.admin_analysis_jobs, public.admin_analysis_batch_jobs from public, anon, authenticated;
grant all on public.admin_analysis_batches, public.admin_analysis_jobs, public.admin_analysis_batch_jobs to service_role;

create or replace function public.enqueue_admin_analysis(p_actor uuid,p_reports uuid[])
returns uuid language plpgsql security invoker set search_path = public as $$
declare batch uuid;
begin
  if cardinality(p_reports) is null or cardinality(p_reports) < 1 or cardinality(p_reports) > 50 then raise exception 'Select between 1 and 50 reports'; end if;
  if exists(select 1 from unnest(p_reports) x where x is null or not exists(select 1 from reports r where r.id=x)) then raise exception 'Report not found'; end if;
  -- One task per AI call, not a serverless request that must finish a whole thread.
  if (select count(*) from report_comments where report_id=any(p_reports)) > 50000 then raise exception 'Thread too large; select fewer reports'; end if;
  insert into admin_analysis_batches(actor_id,report_ids) values(p_actor,p_reports) returning id into batch;
  with tasks as (
    select distinct k.kind,r.id subject_id,r.id report_id from reports r
      cross join (values ('credibility'),('report_sentiment')) k(kind) where r.id=any(p_reports)
    union select 'comment_sentiment',c.id,c.report_id from report_comments c where c.report_id=any(p_reports)
  ), queued as (
    insert into admin_analysis_jobs(kind,subject_id,report_id,payload)
    select kind,subject_id,report_id,jsonb_build_object('actorId',p_actor) from tasks order by kind,subject_id
    on conflict (kind,subject_id) where state in ('queued','running') and kind <> 'status_followup'
      do update set subject_id=excluded.subject_id
    returning id
  ) insert into admin_analysis_batch_jobs(batch_id,job_id) select batch,id from queued;
  return batch;
end $$;

create or replace function public.claim_admin_analysis_job()
returns setof public.admin_analysis_jobs language plpgsql security invoker set search_path = public as $$
begin
  update admin_analysis_jobs set state='failed',last_error='Worker lease expired after three attempts',updated_at=now(),lease_token=null,lease_until=null
    where state='running' and lease_until < now() and attempts>=3;
  return query with candidate as (
    select id from admin_analysis_jobs where attempts<3 and available_at<=now()
      and (state='queued' or (state='running' and lease_until<now()))
    order by case when kind='status_followup' then 0 else 1 end,created_at,id for update skip locked limit 1
  ) update admin_analysis_jobs j set state='running',attempts=j.attempts+1,
    lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
    from candidate c where j.id=c.id returning j.*;
end $$;

create or replace function public.admin_analysis_progress(p_batch uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('id',b.id,'createdAt',b.created_at,'total',count(j.id),
    'done',count(*) filter(where j.state in ('succeeded','failed','skipped')),
    'failed',count(*) filter(where j.state='failed'),'skipped',count(*) filter(where j.state='skipped'),
    'state',case when bool_or(j.state='running') then 'running' when bool_or(j.state='queued') then 'queued'
      when bool_or(j.state='failed') then 'failed' when bool_or(j.state='skipped') then 'partial' else 'succeeded' end,
    'reports',coalesce((select jsonb_agg(x) from (select j2.report_id as id,count(*) as total,
      count(*) filter(where j2.state in ('succeeded','failed','skipped')) as done,
      count(*) filter(where j2.state='failed') as failed from admin_analysis_batch_jobs l2 join admin_analysis_jobs j2 on j2.id=l2.job_id
      where l2.batch_id=b.id group by j2.report_id) x),'[]'::jsonb))
  from admin_analysis_batches b join admin_analysis_batch_jobs l on l.batch_id=b.id
    join admin_analysis_jobs j on j.id=l.job_id where b.id=p_batch group by b.id
$$;

create or replace function public.active_admin_analysis(p_actor uuid)
returns jsonb language sql stable security invoker set search_path=public as $$
  select coalesce(jsonb_agg(public.admin_analysis_progress(b.id)),'[]'::jsonb) from (
    select b.id from admin_analysis_batches b where b.actor_id=p_actor and exists(
      select 1 from admin_analysis_batch_jobs l join admin_analysis_jobs j on j.id=l.job_id
      where l.batch_id=b.id and j.state in ('queued','running')) order by b.created_at desc
  ) b
$$;

create or replace function public.audit_admin_analysis_completion()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.kind <> 'status_followup' and new.state in ('succeeded','failed','skipped') and old.state not in ('succeeded','failed','skipped') then
    insert into audit_logs(actor_id,actor_name,action_type,title,details,report_id,new_value)
      values(case when exists(select 1 from profiles where id=nullif(new.payload->>'actorId','')::uuid) then nullif(new.payload->>'actorId','')::uuid else null end,
        coalesce(new.payload->>'actorName','Analysis worker'),
        case new.state when 'succeeded' then 'AI Analysis Completed' when 'failed' then 'AI Analysis Failed' else 'AI Analysis Skipped' end,
        new.kind||' analysis '||new.state,'Background analysis job '||new.id||'. '||coalesce(new.last_error,''),
        case when exists(select 1 from reports where id=new.report_id) then new.report_id else null end,new.state);
  end if;
  return new;
end $$;
drop trigger if exists admin_analysis_completion_audit on public.admin_analysis_jobs;
create trigger admin_analysis_completion_audit after update of state on public.admin_analysis_jobs for each row execute function public.audit_admin_analysis_completion();
revoke all on function public.audit_admin_analysis_completion() from public,anon,authenticated;
grant execute on function public.audit_admin_analysis_completion() to service_role;

-- The status, audit and follow-up outbox commit together. A lost HTTP response
-- cannot leave a saved status with missing background work.
create or replace function public.save_admin_report_status(p_report uuid,p_actor uuid,p_actor_name text,p_status text,p_verified boolean)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r reports%rowtype; next_status text; next_verified boolean; job uuid; incident text; action text;
begin
  select * into r from reports where id=p_report for update;
  if not found then raise exception 'Report not found'; end if;
  next_status:=coalesce(p_status,r.status); next_verified:=coalesce(p_verified,r.is_verified,false);
  if next_status not in ('Pending Review','Under Verification','Verified','Resolved','Rejected','Marked Fake','Archived') then raise exception 'Invalid report status'; end if;
  if p_status is null and p_verified and r.status in ('Archived','Rejected','Marked Fake') then raise exception 'Invalid verification: choose an active status first'; end if;
  if p_status is null and p_verified and next_status not in ('Verified','Resolved') then next_status:='Verified'; end if;
  if p_status is null and p_verified=false and next_status='Verified' then next_status:='Under Verification'; end if;
  next_verified:=next_status in ('Verified','Resolved');
  if next_status is not distinct from r.status and next_verified is not distinct from r.is_verified then
    return jsonb_build_object('id',r.id,'status',next_status,'is_verified',next_verified,'jobId',null);
  end if;
  select name into incident from incident_types where id=r.incident_type_id;
  update reports set status=next_status,is_verified=next_verified where id=r.id;
  action:=case when next_status='Archived' then 'Report Archived' when next_status in ('Rejected','Marked Fake') then 'Report Rejected'
     when next_status='Verified' then 'Report Verified' else 'Report Status Updated' end;
  insert into audit_logs(actor_id,actor_name,action_type,title,details,report_id,old_value,new_value)
    values(p_actor,p_actor_name,action,case when next_status='Archived' then 'Report archived: ' else 'Report status updated: ' end||coalesce(incident,'Incident'),
      'Status changed from "'||r.status||'" to "'||next_status||'".',r.id,r.status,next_status);
  insert into admin_analysis_jobs(kind,subject_id,report_id,payload)
    values('status_followup',r.id,r.id,jsonb_build_object('actorId',p_actor,'actorName',p_actor_name,'ownerId',r.user_id,
      'location',r.location,'status',next_status,'verified',next_verified)) returning id into job;
  if next_verified then
    insert into admin_analysis_jobs(kind,subject_id,report_id,payload)
      values('credibility',r.id,r.id,jsonb_build_object('actorId',p_actor,'actorName',p_actor_name)),
        ('report_sentiment',r.id,r.id,jsonb_build_object('actorId',p_actor,'actorName',p_actor_name))
      on conflict (kind,subject_id) where state in ('queued','running') and kind <> 'status_followup' do nothing;
  end if;
  return jsonb_build_object('id',r.id,'status',next_status,'is_verified',next_verified,'jobId',job);
end $$;
revoke all on function public.enqueue_admin_analysis(uuid,uuid[]),public.claim_admin_analysis_job(),public.admin_analysis_progress(uuid),public.active_admin_analysis(uuid),public.save_admin_report_status(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.enqueue_admin_analysis(uuid,uuid[]),public.claim_admin_analysis_job(),public.admin_analysis_progress(uuid),public.active_admin_analysis(uuid),public.save_admin_report_status(uuid,uuid,text,text,boolean) to service_role;
commit;
