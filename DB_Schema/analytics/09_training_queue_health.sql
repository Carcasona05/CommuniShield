-- CURRENT queue across ALL dates; old unfinished work must not disappear.
-- Four mutually exclusive categories per mode, including zero-count categories.
-- This query never claims/renews/fails jobs. Ready/failed jobs are not queue work.
with modes(training_mode, label) as (
  values ('fresh', 'Fresh'), ('continue', 'Continued')
), states(state, label, position) as (
  values ('waiting', 'Waiting for availability', 1), ('due', 'Due in queue', 2),
    ('live', 'Running with valid lease', 3), ('stale', 'Running with invalid/expired lease', 4)
), counts as (
  select training_mode,
    case when status = 'queued' then
      case when available_at <= now() then 'due' else 'waiting' end
    else
      case when lease_until is null or lease_until <= now() then 'stale' else 'live' end
    end as state,
    count(*) as n
  from public.sentiment_training_jobs
  where status in ('queued', 'training', 'evaluating')
  group by 1, 2
)
select m.label || ' / ' || s.label as x, coalesce(c.n, 0) as y
from modes m cross join states s
left join counts c on c.training_mode = m.training_mode and c.state = s.state
order by m.label, s.position;
