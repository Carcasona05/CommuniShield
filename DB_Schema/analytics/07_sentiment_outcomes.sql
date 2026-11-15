-- CURRENT outcomes of sentiment records CREATED in the last 30 Manila days.
-- Each retained report/comment record contributes to exactly one outcome.
-- Successful rows use their label; other rows use their status, not a default label.
with settings as (
  select 'Asia/Manila'::text as tz, 30 as days
), bounds as (
  select ((now() at time zone tz)::date - (days - 1))::timestamp at time zone tz as since,
    ((now() at time zone tz)::date + 1)::timestamp at time zone tz as until from settings
), outcomes(outcome, label, position) as (
  values ('positive', 'Positive', 1), ('neutral', 'Neutral', 2), ('negative', 'Negative', 3),
    ('mixed', 'Mixed', 4), ('unclear', 'Unclear', 5), ('pending', 'Pending', 6),
    ('failed', 'Failed', 7), ('unavailable', 'Unavailable', 8), ('skipped', 'Skipped', 9)
), counts as (
  select case when a.status = 'succeeded' then a.label else a.status end as outcome,
    count(*) as n
  from public.sentiment_analysis a cross join bounds b
  where a.created_at >= b.since and a.created_at < b.until
  group by 1
)
select o.label as x, coalesce(c.n, 0) as y
from outcomes o left join counts c using (outcome)
order by o.position;
