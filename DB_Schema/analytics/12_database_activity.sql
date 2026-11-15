-- Current OTHER client connections in this database by state, not CPU or history.
-- Excludes this monitoring query and non-client background workers.
-- Full visibility requires a trusted dashboard role with statistics access.
with states(state, position) as (
  values ('active', 1), ('idle', 2), ('idle in transaction', 3),
    ('idle in transaction (aborted)', 4), ('fastpath function call', 5),
    ('disabled', 6), ('unknown', 7)
), counts as (
  select coalesce(state, 'unknown') as state, count(*) as n
  from pg_stat_activity
  where datname = current_database() and pid <> pg_backend_pid()
    and backend_type = 'client backend'
  group by 1
)
select s.state as x, coalesce(c.n, 0) as y
from states s left join counts c using (state)
order by s.position;
