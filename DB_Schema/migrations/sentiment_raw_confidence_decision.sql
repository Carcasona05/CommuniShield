-- Apply before deploying the raw-confidence winner backend.
-- Additive/rerunnable; no historical reanalysis, policy/grant changes or deletes.
begin;
alter table public.sentiment_analysis add column if not exists decision jsonb;
comment on column public.sentiment_analysis.decision is
  'Raw-confidence routing audit: source labels/scores, eligibility bands, policy and winner. Scores are not calibrated certainty. NULL for historical results.';
notify pgrst,'reload schema';
commit;
