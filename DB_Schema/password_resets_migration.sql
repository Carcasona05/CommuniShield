create table if not exists public.password_resets (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_code text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_resets_email on public.password_resets (email);
create index if not exists idx_password_resets_expires on public.password_resets (expires_at);

alter table public.password_resets enable row level security;

create policy "Service role can manage password_resets"
  on public.password_resets
  for all
  using (true)
  with check (true);
