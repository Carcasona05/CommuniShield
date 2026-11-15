-- Current approved, active uploaded examples only; NOT the frozen baseline corpus.
-- A balance problem is a curation signal, not a reason to lower evaluation gates.
with languages(language) as (
  values ('english'), ('filipino'), ('cebuano')
), labels(label) as (
  values ('positive'), ('neutral'), ('negative')
), counts as (
  select s.language, s.label, count(*) as active_approved_samples
  from public.sentiment_training_samples s
  join public.sentiment_datasets d on d.id = s.dataset_id
  where s.active and d.status = 'approved'
  group by s.language, s.label
)
select initcap(l.language) || ' / ' || initcap(c.label) as x,
  coalesce(n.active_approved_samples, 0) as y
from languages l cross join labels c
left join counts n on n.language = l.language and n.label = c.label
order by l.language, c.label;
