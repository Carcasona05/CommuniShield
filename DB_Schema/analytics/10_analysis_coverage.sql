-- CURRENT sentiment coverage of content CREATED in the last 30 Manila days.
-- Each retained subject appears exactly once; absent analysis is not a success.
with settings as (
  select 'Asia/Manila'::text as tz, 30 as days
), bounds as (
  select ((now() at time zone tz)::date - (days - 1))::timestamp at time zone tz as since,
    ((now() at time zone tz)::date + 1)::timestamp at time zone tz as until from settings
), subjects as (
  select 'report'::text as subject_type, r.id from public.reports r cross join bounds b
  where r.created_at >= b.since and r.created_at < b.until
  union all
  select 'comment', c.id from public.report_comments c cross join bounds b
  where c.created_at >= b.since and c.created_at < b.until
), types(subject_type, label) as (
  values ('report', 'Reports'), ('comment', 'Comments')
), states(state, label, position) as (
  values ('missing', 'Missing analysis', 1), ('succeeded', 'Succeeded', 2),
    ('pending', 'Pending', 3), ('failed', 'Failed', 4),
    ('unavailable', 'Unavailable', 5), ('skipped', 'Skipped', 6)
), counts as (
  select s.subject_type, coalesce(a.status, 'missing') as state, count(*) as n
  from subjects s
  left join public.sentiment_analysis a on a.subject_type = s.subject_type and a.subject_id = s.id
  group by 1, 2
)
select t.label || ' / ' || s.label as x, coalesce(c.n, 0) as y
from types t cross join states s
left join counts c on c.subject_type = t.subject_type and c.state = s.state
order by t.label, s.position;
