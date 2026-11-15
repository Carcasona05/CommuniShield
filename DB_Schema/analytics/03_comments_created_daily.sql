-- Current retained comments, grouped by creation date, not analysis date.
with settings as (
  select 'Asia/Manila'::text as tz, 30 as days
), bounds as (
  select tz, (now() at time zone tz)::date as today,
    (now() at time zone tz)::date - (days - 1) as first_day from settings
), calendar as (
  select first_day + n as day from bounds,
    lateral generate_series(0, today - first_day) as n
), daily as (
  select (c.created_at at time zone b.tz)::date as day, count(*) as comments_created
  from public.report_comments c cross join bounds b
  where c.created_at >= (b.first_day::timestamp at time zone b.tz)
    and c.created_at < ((b.today + 1)::timestamp at time zone b.tz)
  group by 1
)
select c.day::timestamp at time zone b.tz as x,
  coalesce(d.comments_created, 0) as y
from calendar c cross join bounds b left join daily d using (day)
order by x;
