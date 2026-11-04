-- Apply to the existing database before deploying the profile-completion gate.
-- Existing typed addresses do NOT become location-confirmed automatically.
begin;
create table if not exists public.profile_location_verifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  address text not null check (length(trim(address)) > 0),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  confirmed_at timestamptz not null default now()
);
alter table public.profile_location_verifications enable row level security;
revoke all on public.profile_location_verifications from public,anon,authenticated;
grant select,insert,update,delete on public.profile_location_verifications to service_role;
notify pgrst,'reload schema';
commit;
