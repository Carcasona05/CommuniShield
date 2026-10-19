-- Run in the Supabase SQL editor before deploying the updated server.
alter table public.profiles
  add column if not exists notifications_enabled boolean not null default true,
  add column if not exists crime_alerts_enabled boolean not null default true;
