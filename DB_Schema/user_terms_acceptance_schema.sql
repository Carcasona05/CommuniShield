create table if not exists public.user_terms_acceptance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  unique(user_id, terms_version)
);

alter table public.user_terms_acceptance enable row level security;

create policy "select_own_terms"
  on public.user_terms_acceptance for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insert_own_terms"
  on public.user_terms_acceptance for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "admin_select_all_terms"
  on public.user_terms_acceptance for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'super_admin')
  );

create index if not exists idx_user_terms_user_id
  on public.user_terms_acceptance(user_id);

create index if not exists idx_user_terms_version
  on public.user_terms_acceptance(terms_version);
