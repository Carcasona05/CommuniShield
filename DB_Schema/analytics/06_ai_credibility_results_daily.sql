-- Retained latest credibility results by analyzed_at; NOT an API-call/billing ledger.
-- One row per report is upserted. Reanalysis replaces earlier results.
-- Stored fallback results may be included; no persisted status reliably separates them.
with settings as (
  select 'Asia/Manila'::text as tz, 30 as days
), bounds as (
  select tz, (now() at time zone tz)::date as today,
    (now() at time zone tz)::date - (days - 1) as first_day from settings
), calendar as (
  select first_day + n as day from bounds,
    lateral generate_series(0, today - first_day) as n
), daily as (
  select (a.analyzed_at at time zone b.tz)::date as day, count(*) as retained_credibility_results
  from public.report_credibility_analysis a cross join bounds b
  where a.analyzed_at >= (b.first_day::timestamp at time zone b.tz)
    and a.analyzed_at < ((b.today + 1)::timestamp at time zone b.tz)
  group by 1
)
select c.day::timestamp at time zone b.tz as x,
  coalesce(d.retained_credibility_results, 0) as y
from calendar c cross join bounds b left join daily d using (day)
order by x;
