-- Apply before deploying the paginated feed/comment release.
begin;

create index if not exists reports_feed_cursor_idx on public.reports(created_at desc, id desc) where status <> 'Archived';
create index if not exists reports_owner_feed_idx on public.reports(user_id, created_at desc, id desc) where status <> 'Archived';
create index if not exists reports_owner_status_feed_idx on public.reports(user_id, status, created_at desc, id desc);
create index if not exists comments_thread_cursor_idx on public.report_comments(report_id, created_at desc, id desc);
create index if not exists announcements_feed_cursor_idx on public.admin_announcement(created_at desc, id desc);
create index if not exists report_likes_report_user_idx on public.report_likes(report_id, user_id);

-- Only service_role may call these functions. The API derives p_owner from auth,
-- never from a user-supplied account ID. UNION ordering paginates the mixed feed.
create or replace function public.feed_page(
  p_owner uuid default null, p_from timestamptz default null, p_to timestamptz default null,
  p_status text default null, p_source text default 'All',
  p_before_time timestamptz default null, p_before_id uuid default null, p_before_source text default 'User'
) returns jsonb language sql stable security invoker set search_path = public as $$
  with eligible as (
    select r.id, r.created_at, 'User'::text as source
    from reports r where r.status <> 'Archived'
      and (p_owner is null or r.user_id = p_owner)
      and (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at <= p_to)
      and (p_status is null or r.status = p_status) and p_source in ('All', 'User')
    union all
    select a.id, a.created_at, 'Admin'::text from admin_announcement a
    where p_owner is null and p_status is null and p_source in ('All', 'Admin')
      and (p_from is null or a.created_at >= p_from) and (p_to is null or a.created_at <= p_to)
  ), page as (
    select * from eligible where p_before_time is null
      or (created_at, id, source) < (p_before_time, p_before_id, p_before_source)
    order by created_at desc, id desc, source desc limit 11
  ), status_totals as (
    select status, count(*) as n from reports
    where p_owner is not null and user_id = p_owner and status <> 'Archived' group by status
  ) select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, id desc, source desc) from page), '[]'::jsonb),
    'total', (select count(*) from eligible),
    'statusCounts', coalesce((select jsonb_object_agg(status, n) from status_totals), '{}'::jsonb)
      || jsonb_build_object('All Status', coalesce((select sum(n) from status_totals), 0))
  );
$$;
revoke all on function public.feed_page(uuid,timestamptz,timestamptz,text,text,timestamptz,uuid,text) from public, anon, authenticated;
grant execute on function public.feed_page(uuid,timestamptz,timestamptz,text,text,timestamptz,uuid,text) to service_role;

-- Counts only: do not download the comment or like rows to count them in Node.
create or replace function public.report_engagement_counts(p_ids uuid[], p_viewer uuid)
returns table(id uuid, comments bigint, likes bigint, is_liked boolean)
language sql stable security invoker set search_path = public as $$
  select r.id, (select count(*) from report_comments c where c.report_id=r.id),
    (select count(*) from report_likes l where l.report_id=r.id),
    exists(select 1 from report_likes l where l.report_id=r.id and l.user_id=p_viewer)
  from reports r where r.id=any(p_ids);
$$;
revoke all on function public.report_engagement_counts(uuid[],uuid) from public, anon, authenticated;
grant execute on function public.report_engagement_counts(uuid[],uuid) to service_role;

-- Lightweight safety metadata remains independent of the ten rendered posts.
create or replace function public.feed_safety_reports(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'latitude',r.latitude,'longitude',r.longitude,
    'status',r.status,'verified',r.is_verified,'created_at',r.created_at,
    'incident_type',t.name,'severity',coalesce(a.severity,'Unknown'))), '[]'::jsonb)
  from reports r left join incident_types t on t.id=r.incident_type_id
    left join report_credibility_analysis a on a.report_id=r.id
  where r.created_at between p_from and p_to and r.status in ('Pending Review','Under Verification')
    and r.latitude is not null and r.longitude is not null;
$$;
revoke all on function public.feed_safety_reports(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.feed_safety_reports(timestamptz,timestamptz) to service_role;

create table if not exists public.comment_sentiment_jobs (
  comment_id uuid primary key references public.report_comments(id) on delete cascade,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  completed_at timestamptz,
  last_error text
);
alter table public.comment_sentiment_jobs enable row level security;
revoke all on public.comment_sentiment_jobs from anon, authenticated;
grant all on public.comment_sentiment_jobs to service_role;
create index if not exists comment_jobs_due_idx on public.comment_sentiment_jobs(available_at) where completed_at is null;

create or replace function public.enqueue_comment_sentiment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into comment_sentiment_jobs(comment_id) values(new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function public.enqueue_comment_sentiment() from public, anon, authenticated;
drop trigger if exists enqueue_comment_sentiment on public.report_comments;
create trigger enqueue_comment_sentiment after insert on public.report_comments
for each row execute function public.enqueue_comment_sentiment();

create or replace function public.claim_comment_sentiment_job()
returns setof public.comment_sentiment_jobs language sql volatile security invoker set search_path = public as $$
  update comment_sentiment_jobs set attempts=attempts+1, lease_token=gen_random_uuid(), lease_until=now()+interval '10 minutes'
  where comment_id=(select comment_id from comment_sentiment_jobs
    where completed_at is null and available_at<=now() and (lease_until is null or lease_until<now())
    order by available_at for update skip locked limit 1)
  returning *;
$$;
revoke all on function public.claim_comment_sentiment_job() from public, anon, authenticated;
grant execute on function public.claim_comment_sentiment_job() to service_role;
notify pgrst, 'reload schema';
commit;
