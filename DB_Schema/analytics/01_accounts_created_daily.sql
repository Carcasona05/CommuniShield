-- Retained Supabase Auth accounts created per Manila calendar day.
-- Deleted accounts cannot be reconstructed. Includes all account roles.
with settings as (
  select 'Asia/Manila'::text as tz, 30 as days
), bounds as (
  select tz, (now() at time zone tz)::date as today,
    (now() at time zone tz)::date - (days - 1) as first_day
  from settings
), calendar as (
  select first_day + n as day from bounds,
    lateral generate_series(0, today - first_day) as n
), daily as (
  select (u.created_at at time zone b.tz)::date as day,
    count(*) as accounts_created
  from auth.users u cross join bounds b
  where u.created_at >= (b.first_day::timestamp at time zone b.tz)
    and u.created_at < ((b.today + 1)::timestamp at time zone b.tz)
  group by 1
)
select c.day::timestamp at time zone b.tz as x,
  coalesce(d.accounts_created, 0) as y
from calendar c cross join bounds b left join daily d using (day)
order by x;
