-- Apply before deploying the View more release. Additive: no record data,
-- table permissions, authentication rules or local blotters are changed.
-- Updated ordering: records use status -> incident severity -> oldest first.
-- Logs/archives retain newest-first ordering; cursors preserve all sort keys.
-- Records include user incidents and exclude Rejected/Marked Fake/Archived.
begin;
create index if not exists reports_admin_browse_idx on public.reports(role, created_at desc, id desc) where status <> 'Archived';
create index if not exists audit_logs_browse_idx on public.audit_logs(created_at desc, id desc);
create index if not exists audit_logs_report_browse_idx on public.audit_logs(report_id, created_at desc, id desc);
create index if not exists announcements_feed_cursor_idx on public.admin_announcement(created_at desc, id desc);

drop function if exists public.admin_browse_page(text,timestamptz,timestamptz,text,text,text,integer,integer,uuid,boolean,timestamptz,text,uuid);
create or replace function public.admin_browse_page(
  p_view text, p_from timestamptz default null, p_to timestamptz default null,
  p_status text default null, p_kind text default null, p_actor_role text default null,
  p_page integer default 1, p_page_size integer default 10,
  p_focus_report uuid default null, p_export boolean default false,
  p_before_time timestamptz default null, p_before_kind text default null, p_before_id uuid default null,
  p_before_sort jsonb default null
) returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare result jsonb;
begin
  if p_view not in ('records', 'logs', 'archived') or p_page < 1 or p_page_size < 1 or p_page_size > 50 then
    raise exception 'Invalid browsing request';
  end if;
  if p_view='records' and p_before_time is not null and
    (p_before_sort is null or (p_before_sort->>'version')::integer is distinct from 1) then
    raise exception 'Record order changed. Refresh the list before loading more.';
  end if;
  with eligible as materialized (
    select r.id as raw_id, 'Incident'::text as kind, r.created_at, r.status, coalesce(r.role, 'user') as actor_role
    from public.reports r
    where (p_view = 'records' and coalesce(r.role,'user') in ('user','admin','super_admin')
      and r.status not in ('Archived','Rejected','Marked Fake'))
       or (p_view = 'archived' and r.status = 'Archived')
    union all
    select a.id, 'Announcement', a.created_at, 'Published', coalesce(p.role, 'admin')
    from public.admin_announcement a left join public.profiles p on p.id = a.admin_id
    where p_view = 'records' and p_status is null and p_actor_role is distinct from 'user'
    union all
    select l.id, 'Activity', l.created_at, l.action_type, coalesce(p.role, 'system')
    from public.audit_logs l left join public.profiles p on p.id = l.actor_id
    where p_view = 'logs' or (p_view = 'records' and p_status is null and p_actor_role is distinct from 'user'
      and coalesce(l.action_type, '') !~* '^report (archived|rejected|marked fake)(\s*:|\s*$)'
      and coalesce(l.title, '') !~* '^report (archived|rejected|marked fake)(\s*:|\s*$)'
      and not exists (select 1 from public.reports excluded where excluded.id=l.report_id and excluded.status in ('Archived','Rejected','Marked Fake')))
  ), filtered as materialized (
    select * from eligible e where (p_from is null or e.created_at >= p_from) and (p_to is null or e.created_at <= p_to)
      and (p_status is null or e.status = p_status)
      and (case when p_view='records' and p_actor_role='user' then e.kind='Incident' else p_kind is null or e.kind = p_kind end)
      and (p_actor_role is null or e.actor_role = p_actor_role)
   ), ranked as materialized (
    select e.*,
      case when p_view<>'records' then 0 when e.kind<>'Incident' then 7 else
        case e.status when 'Pending Review' then 0 when 'Under Verification' then 1 when 'Verified' then 2
          when 'Resolved' then 3 when 'Rejected' then 4 when 'Marked Fake' then 5 else 6 end end as status_rank,
      case when p_view<>'records' or e.kind<>'Incident' then 4 else
        case a.severity when 'Critical' then 0 when 'High' then 1 when 'Medium' then 2 when 'Low' then 3 else 4 end end as severity_rank,
      case when p_view='records' and e.kind='Incident' then extract(epoch from e.created_at)
        else -extract(epoch from e.created_at) end as sort_time
    from filtered e left join public.report_credibility_analysis a on e.kind='Incident' and a.report_id=e.raw_id
   ), remaining as materialized (
    select * from ranked e where p_export or p_before_time is null or
      (e.status_rank,e.severity_rank,e.sort_time,e.kind) >
        (case when p_view='records' then (p_before_sort->>'status_rank')::integer else 0 end,
         case when p_view='records' then (p_before_sort->>'severity_rank')::integer else 4 end,
         case when p_view='records' then (p_before_sort->>'sort_time')::numeric else -extract(epoch from p_before_time) end,p_before_kind)
      or ((e.status_rank,e.severity_rank,e.sort_time,e.kind) =
        (case when p_view='records' then (p_before_sort->>'status_rank')::integer else 0 end,
         case when p_view='records' then (p_before_sort->>'severity_rank')::integer else 4 end,
         case when p_view='records' then (p_before_sort->>'sort_time')::numeric else -extract(epoch from p_before_time) end,p_before_kind)
         and e.raw_id < p_before_id)
   ), selected as (
    select * from remaining order by status_rank, severity_rank, sort_time, kind, raw_id desc
    limit (case when p_export then 50001 else p_page_size end)
    offset (case when p_export or p_before_time is not null then 0 else (p_page::bigint - 1) * p_page_size end)
  ), focused as (
    select e.* from ranked e join public.audit_logs l on l.id = e.raw_id
    where p_view = 'logs' and e.kind = 'Activity' and l.report_id = p_focus_report
    order by e.created_at desc, e.raw_id desc limit 1
  ), wanted as (
    select *, false as focus_only from selected
    union all select *, true from focused
  ), payloads as (
    select e.created_at, e.kind, e.raw_id, e.focus_only, e.status_rank, e.severity_rank, e.sort_time,
      case when e.kind = 'Incident' then jsonb_build_object(
        'id', r.id, 'kind', 'Incident', 'reportType', 'Incident', 'status', r.status,
        'title', coalesce(t.name, 'Incident') || case when coalesce(r.location, '') <> '' then ' in ' || r.location else '' end,
        'incident_type', coalesce(t.name, 'Incident'), 'incident_category', coalesce(c.name, ''),
        'location', coalesce(r.location, ''), 'latitude', r.latitude, 'longitude', r.longitude,
        'details', case when p_export or p_view = 'archived' then coalesce(r.details, '') else left(coalesce(r.details, ''), 240) end,
        'previewOnly', not p_export and p_view = 'records', 'created_at', r.created_at, 'is_verified', r.is_verified,
        'poster_name', r.poster_name, 'reporter_name', coalesce(nullif(rp.fullname, ''), nullif(r.poster_name, ''), 'Anonymous User'),
        'actor', coalesce(nullif(rp.fullname, ''), nullif(r.poster_name, ''), 'Admin'), 'actorRole', e.actor_role,
        'severity', coalesce(analysis.severity, 'Unknown'), 'ai_score', analysis.ai_score)
      when e.kind = 'Announcement' then jsonb_build_object(
        'id', 'announcement-' || a.id, 'kind', 'Announcement', 'type', a.type, 'title', coalesce(nullif(a.title, ''), a.type),
        'location', coalesce(a.location, ''), 'details', a.details, 'pic_url', a.pic_url, 'status', 'Published', 'severity', '',
        'created_at', a.created_at, 'actor', coalesce(nullif(ap.fullname, ''), 'Admin'), 'actorRole', e.actor_role)
      else jsonb_build_object(
        'id', case when p_view = 'records' then 'activity-' || l.id else l.id::text end,
        'kind', 'Activity', 'title', coalesce(nullif(l.title, ''), l.action_type, 'Admin activity'),
        'location', '', 'details', coalesce(l.details, ''), 'status', coalesce(l.action_type, 'Recorded'), 'severity', '',
        'created_at', l.created_at, 'dateTime', l.created_at, 'actionType', l.action_type,
        'actor', coalesce(l.actor_name, 'System'), 'actorRole', e.actor_role, 'reportId', coalesce(l.report_id::text, ''),
        'oldStatus', coalesce(l.old_value, ''), 'newStatus', coalesce(l.new_value, '')) end as item
    from wanted e
    left join public.reports r on e.kind = 'Incident' and r.id = e.raw_id
    left join public.incident_types t on t.id = r.incident_type_id
    left join public.incident_categories c on c.id = t.category_id
    left join public.profiles rp on rp.id = r.user_id
    left join public.report_credibility_analysis analysis on analysis.report_id = r.id
    left join public.admin_announcement a on e.kind = 'Announcement' and a.id = e.raw_id
    left join public.profiles ap on ap.id = a.admin_id
    left join public.audit_logs l on e.kind = 'Activity' and l.id = e.raw_id
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(item order by status_rank, severity_rank, sort_time, kind, raw_id desc) from payloads where not focus_only), '[]'::jsonb),
    'total', (select count(*) from filtered), 'page', p_page, 'pageSize', p_page_size,
    'hasMore', not p_export and (select count(*) from remaining) > (case when p_before_time is not null then p_page_size else p_page::bigint * p_page_size end),
    'cursor', (select jsonb_build_object('created_at', created_at, 'kind', kind, 'id', raw_id) ||
      case when p_view='records' then jsonb_build_object('priority',jsonb_build_object('version',1,
        'status_rank',status_rank,'severity_rank',severity_rank,'sort_time',sort_time::text)) else '{}'::jsonb end
      from selected order by status_rank desc, severity_rank desc, sort_time desc, kind desc, raw_id limit 1),
    'focusedItem', (select item from payloads where focus_only limit 1),
    'stats', (select jsonb_build_object('reports', count(*) filter (where kind = 'Incident'),
      'announcements', count(*) filter (where kind = 'Announcement'), 'activities', count(*) filter (where kind = 'Activity'),
      'verified', count(*) filter (where status in ('Report Verified', 'Report Mapped')),
      'rejected', count(*) filter (where status in ('Report Rejected', 'Report Deleted')),
      'ai', count(*) filter (where status = 'AI Analysis Completed')) from filtered)
  ) into result;
  if p_export and (result->>'total')::bigint > 50000 then raise exception 'Export exceeds 50000 records. Select a smaller date range.'; end if;
  return result;
end;
$$;
revoke all on function public.admin_browse_page(text,timestamptz,timestamptz,text,text,text,integer,integer,uuid,boolean,timestamptz,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.admin_browse_page(text,timestamptz,timestamptz,text,text,text,integer,integer,uuid,boolean,timestamptz,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
