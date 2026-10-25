create table if not exists public.admin_blotters (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  blotter_no text not null unique,
  barangay text,
  location text not null,
  incident_type text not null,
  incident_datetime timestamptz,
  complainant_name text not null,
  complainant_age text,
  complainant_contact text,
  respondent text not null,
  incident_description text not null,
  action_taken text not null,
  status text not null default 'Pending Review',
  reported_by text not null,
  blotter_officer text not null,
  date_reported timestamptz,
  date_recorded timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_blotters_created_at_idx
  on public.admin_blotters (created_at desc);

revoke all on public.admin_blotters from anon, authenticated;
grant all on public.admin_blotters to service_role;
