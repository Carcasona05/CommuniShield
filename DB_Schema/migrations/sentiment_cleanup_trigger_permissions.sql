-- Existing deployments: run after add_unified_sentiment_analysis.sql.
-- Editing/deleting an owned report/comment must invalidate only its own cached
-- analysis without giving clients direct DELETE access to sentiment_analysis.
-- No table rows are changed by this migration.
begin;
alter function public.cleanup_sentiment_analysis() security definer;
alter function public.cleanup_sentiment_analysis() set search_path = public, pg_temp;
revoke all on function public.cleanup_sentiment_analysis() from public, anon, authenticated;
grant execute on function public.cleanup_sentiment_analysis() to service_role;
commit;
