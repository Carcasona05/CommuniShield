create table if not exists public.emergency_facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('police', 'fire')),
  latitude double precision not null,
  longitude double precision not null,
  address text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);

insert into public.emergency_facilities (name, type, latitude, longitude, address, phone) values
  ('Argao Police Station', 'police', 9.8807935, 123.6087917, 'Baluarte Beach Resort, General Ortega St, Argao, 6021 Cebu', '09425533464'),
  ('Argao Fire Station', 'fire', 9.8819689, 123.6003262, 'VJJ2+Q4, Argao, Cebu', '(032)8872837')
on conflict (name) do update set latitude = excluded.latitude, longitude = excluded.longitude, address = excluded.address, phone = excluded.phone;

alter table public.emergency_facilities enable row level security;

create policy "read_all_emergency_facilities" on public.emergency_facilities
  for select using (true);
