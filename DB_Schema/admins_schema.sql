create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  action_type text not null
    check (action_type in (
      'Report Verified',
      'Report Mapped',
      'Report Rejected',
      'Report Deleted',
      'AI Analysis Completed',
      'Admin Added',
      'Admin Updated',
      'Admin Disabled',
      'Admin Deleted',
      'System Settings Updated',
      'Announcement Created',
      'Notification Sent'
    )),
  title text not null default '',
  details text not null default '',
  report_id uuid references public.reports(id) on delete set null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor on public.audit_logs(actor_id);
create index if not exists audit_logs_action on public.audit_logs(action_type);

create table if not exists public.report_validations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null
    check (action in ('Under Verification', 'Resolved', 'Rejected', 'Archived', 'Marked Fake')),
  previous_status text,
  new_status text not null,
  remarks text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists report_validations_report on public.report_validations(report_id);
create index if not exists report_validations_created on public.report_validations(created_at desc);
create index if not exists report_validations_admin on public.report_validations(admin_id);

create table if not exists public.admin_announcement (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  type text not null default 'Announcement'
    check (type in (
      'Seminar',
      'Safety/Tips',
      'Curfew',
      'Announcement',
      'Road Closure',
      'Emergency',
      'Power Interruption',
      'Water Interruption',
      'Weather Advisory',
      'Public Advisory',
      'Medical Advisory',
      'Flood Advisory',
      'Fire Incident',
      'Earthquake',
      'Typhoon',
      'Others'
    )),
  title text not null default '',
  location text,
  details text not null,
  pic_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.system_settings (key, value) values
  ('map_auto_map_verified', 'true'),
  ('map_cluster_overlay', 'true'),
  ('map_heatmap_overlay', 'true'),
  ('map_default_zoom', '13'),
  ('map_center', 'Argao, Cebu'),
  ('notification_email', 'true'),
  ('notification_push', 'false'),
  ('ai_model_version', 'CommuniShield-AI v1.0'),
  ('ai_api_endpoint', ''),
  ('ai_ollama_url', 'http://localhost:11434'),
  ('ai_model_name', 'tinyllama:1.1b'),
  ('ai_temperature', '0.1'),
  ('ai_timeout', '30000')
on conflict (key) do nothing;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  drop trigger if exists set_system_settings_updated_at on public.system_settings;
  create trigger set_system_settings_updated_at
    before update on public.system_settings
    for each row execute function public.set_updated_at();
end $$;

do $$
begin
  drop trigger if exists set_admin_announcement_updated_at on public.admin_announcement;
  create trigger set_admin_announcement_updated_at
    before update on public.admin_announcement
    for each row execute function public.set_updated_at();
end $$;

alter table public.audit_logs enable row level security;
alter table public.report_validations enable row level security;
alter table public.system_settings enable row level security;
alter table public.admin_announcement enable row level security;

create policy "admin_read_audit_logs"
  on public.audit_logs for select
  to authenticated
  using (public.current_user_role() in ('admin', 'super_admin'));

create policy "admin_write_audit_logs"
  on public.audit_logs for insert
  to authenticated
  with check (public.current_user_role() in ('admin', 'super_admin'));

create policy "admin_read_report_validations"
  on public.report_validations for select
  to authenticated
  using (public.current_user_role() in ('admin', 'super_admin'));

create policy "admin_write_report_validations"
  on public.report_validations for insert
  to authenticated
  with check (public.current_user_role() in ('admin', 'super_admin'));

create policy "read_system_settings"
  on public.system_settings for select
  to authenticated
  using (true);

create policy "super_admin_write_system_settings"
  on public.system_settings for update
  to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

create policy "read_all_admin_announcements"
  on public.admin_announcement for select
  to authenticated
  using (true);

create policy "admin_write_announcements"
  on public.admin_announcement for insert
  to authenticated
  with check (public.current_user_role() in ('admin', 'super_admin'));

create policy "admin_update_announcements"
  on public.admin_announcement for update
  to authenticated
  using (public.current_user_role() in ('admin', 'super_admin'))
  with check (public.current_user_role() in ('admin', 'super_admin'));

create policy "admin_delete_announcements"
  on public.admin_announcement for delete
  to authenticated
  using (public.current_user_role() in ('admin', 'super_admin'));
