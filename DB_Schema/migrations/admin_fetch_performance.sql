-- Additive only. Apply in Supabase before deploying the fetching update.
-- On a large live database schedule index creation during a quiet period;
-- regular CREATE INDEX takes a write lock while each index is built.
begin;
create index if not exists reports_feed_cursor_idx
  on public.reports(created_at desc, id desc) where status <> 'Archived';
create index if not exists reports_status_created_idx
  on public.reports(status, created_at desc, id desc);
create index if not exists profiles_role_status_idx
  on public.profiles(role, status);
create index if not exists comments_thread_cursor_idx
  on public.report_comments(report_id, created_at desc, id desc);
commit;
