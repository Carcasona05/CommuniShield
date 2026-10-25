create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  middle_name text,
  last_name text,
  fullname text,
  user_name text,
  role text not null default 'user' check (role in ('user', 'admin', 'super_admin')),
  phone text,
  birthdate date,
  location text,
  department text,
  notifications_enabled boolean not null default true,
  crime_alerts_enabled boolean not null default true,
  status text not null default 'Active' check (status in ('Active', 'Disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_fullname()
returns trigger
language plpgsql
as $$
begin
  new.fullname = nullif(btrim(concat_ws(' ', nullif(new.first_name, ''), nullif(new.middle_name, ''), nullif(new.last_name, ''))), '');
  return new;
end;
$$;

do $$
begin
  drop trigger if exists set_profiles_fullname on public.profiles;
  create trigger set_profiles_fullname
    before insert or update on public.profiles
    for each row execute function public.set_fullname();
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, middle_name, last_name, user_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'firstName',
    new.raw_user_meta_data->>'middleName',
    new.raw_user_meta_data->>'lastName',
    coalesce(new.raw_user_meta_data->>'userName', new.raw_user_meta_data->>'name', ''),
    'user'
  );
  return new;
end;
$$;

do $$
begin
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  drop trigger if exists set_profiles_updated_at on public.profiles;
  create trigger set_profiles_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();
end $$;

create or replace function public.current_user_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table public.profiles enable row level security;

create policy "select_own_profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "admin_select_all_profiles"
  on public.profiles for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'super_admin')
  );

create policy "super_admin_insert_profiles"
  on public.profiles for insert
  to authenticated
  with check (public.current_user_role() = 'super_admin');

create policy "update_own_profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "super_admin_update_all"
  on public.profiles for update
  to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

create policy "super_admin_delete_profiles"
  on public.profiles for delete
  to authenticated
  using (public.current_user_role() = 'super_admin');
