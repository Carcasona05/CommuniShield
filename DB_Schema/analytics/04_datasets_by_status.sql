-- CURRENT review status of datasets CREATED in the last 30 Manila calendar days.
-- Not approval-event counts; no sample join that could multiply dataset counts.
with settings as (
  select 'Asia/Manila'::text as tz, 30 as days
), bounds as (
  select ((now() at time zone tz)::date - (days - 1))::timestamp at time zone tz as since,
    ((now() at time zone tz)::date + 1)::timestamp at time zone tz as until from settings
), statuses(status, label, position) as (
  values ('pending', 'Pending', 1), ('approved', 'Approved', 2),
    ('rejected', 'Rejected', 3), ('archived', 'Archived', 4)
), counts as (
  select d.status, count(*) as n from public.sentiment_datasets d cross join bounds b
  where d.created_at >= b.since and d.created_at < b.until
  group by d.status
)
select s.label as x, coalesce(c.n, 0) as y
from statuses s left join counts c using (status)
order by s.position;
