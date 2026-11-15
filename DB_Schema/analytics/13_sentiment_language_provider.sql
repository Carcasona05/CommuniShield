-- Current retained records created in the last 30 Manila calendar days.
-- Combine grouping dimensions into one unique X category for a two-axis chart.
with settings as (
  select 'Asia/Manila'::text as tz, 30 as days
), bounds as (
  select ((now() at time zone tz)::date - (days - 1))::timestamp at time zone tz as since,
    ((now() at time zone tz)::date + 1)::timestamp at time zone tz as until from settings
)
select jsonb_build_array(a.subject_type, a.language, a.provider, a.model, a.status)::text as x,
  count(*) as y
from public.sentiment_analysis a cross join bounds b
where a.created_at >= b.since and a.created_at < b.until
group by a.subject_type, a.language, a.provider, a.model, a.status
order by y desc, x;
