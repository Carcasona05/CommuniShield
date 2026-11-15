-- CURRENT status of jobs CREATED in the last 30 Manila calendar days.
-- Both fresh/continued jobs included. Ready means passed evaluation, not enabled.
with settings as (
  select 'Asia/Manila'::text as tz, 30 as days
), bounds as (
  select ((now() at time zone tz)::date - (days - 1))::timestamp at time zone tz as since,
    ((now() at time zone tz)::date + 1)::timestamp at time zone tz as until from settings
), statuses(status, label, position) as (
  values ('queued', 'Queued', 1), ('training', 'Training', 2),
    ('evaluating', 'Evaluating', 3), ('ready', 'Ready', 4), ('failed', 'Failed', 5)
), counts as (
  select j.status, count(*) as n from public.sentiment_training_jobs j cross join bounds b
  where j.created_at >= b.since and j.created_at < b.until
  group by j.status
)
select s.label as x, coalesce(c.n, 0) as y
from statuses s left join counts c using (status)
order by s.position;
