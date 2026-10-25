-- Archived reports (reports.status = 'Archived') are hidden from every feed and
-- are only listed in Logs > Archived reports. Run once in Supabase SQL editor.
--
-- 1) Allow the audit action written when an admin archives a report.
do $$
declare
  existing text;
begin
  select con.conname into existing
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
   where cls.relname = 'audit_logs'
     and nsp.nspname = 'public'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%action_type%'
   limit 1;

  if existing is not null then
    execute format('alter table public.audit_logs drop constraint %I', existing);
  end if;

  execute $sql$
    alter table public.audit_logs add constraint audit_logs_action_type_check
      check (action_type in (
        'Report Verified',
        'Report Mapped',
        'Report Rejected',
        'Report Archived',
        'Report Deleted',
        'AI Analysis Completed',
        'Admin Added',
        'Admin Updated',
        'Admin Disabled',
        'Admin Deleted',
        'System Settings Updated',
        'Announcement Created',
        'Notification Sent'
      ))
  $sql$;
end $$;

-- 2) Speed up the archived list lookup.
create index if not exists reports_archived_status
  on public.reports (created_at desc)
  where status = 'Archived';
