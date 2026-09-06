-- Add role column to reports table to track who submitted the report
-- Run this migration against your Supabase database

alter table public.reports
  add column if not exists role text not null default 'user'
  check (role in ('user', 'admin', 'super_admin'));
