-- Apply after admin_blotters.sql. Keep existing incident and people data intact.
alter table public.admin_blotters
  alter column complainant_name drop not null,
  alter column respondent drop not null,
  alter column reported_by drop not null,
  add column if not exists police_provincial_office text,
  add column if not exists police_station text,
  add column if not exists station_address text,
  add column if not exists pnp_logo_uri text,
  add column if not exists page_number text,
  add column if not exists requested_by text,
  add column if not exists certification_purpose text,
  add column if not exists issuance_date date,
  add column if not exists issuance_city text,
  add column if not exists issuance_province text,
  add column if not exists commander_name text,
  add column if not exists commander_rank text,
  add column if not exists commander_position text;
