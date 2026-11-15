-- Last 30 Manila calendar days, including today. One category per feed source.
-- Includes retained reports in all current statuses, including archived/rejected.
with settings as (
  select 'Asia/Manila'::text as tz, 30 as days
), bounds as (
  select ((now() at time zone tz)::date - (days - 1))::timestamp at time zone tz as since,
    ((now() at time zone tz)::date + 1)::timestamp at time zone tz as until from settings
)
select 'Reports'::text as x, count(*) as y
from public.reports r cross join bounds b
where r.created_at >= b.since and r.created_at < b.until
union all
select 'Announcements' as x, count(*) as y
from public.admin_announcement a cross join bounds b
where a.created_at >= b.since and a.created_at < b.until
order by x;
