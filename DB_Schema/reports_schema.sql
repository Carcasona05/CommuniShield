create table if not exists public.incident_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.incident_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.incident_categories(id) on delete cascade,
  name text not null,
  unique (category_id, name)
);

insert into public.incident_categories (name) values
  ('Public Safety Incidents'),
  ('Property-Related Incidents'),
  ('Traffic and Road Incidents'),
  ('Community and Environmental Concerns'),
  ('Suspicious Activities'),
  ('Public Assistance / Community Reports'),
  ('Cyber and Online Incidents (Non-sensitive)')
on conflict (name) do nothing;

insert into public.incident_types (category_id, name)
select c.id, t.incident_type
from (values
  ('Public Safety Incidents', 'Public Disturbance'),
  ('Public Safety Incidents', 'Harassment'),
  ('Public Safety Incidents', 'Loitering / Suspicious Presence'),
  ('Public Safety Incidents', 'Trespassing'),
  ('Property-Related Incidents', 'Theft'),
  ('Property-Related Incidents', 'Lost Property'),
  ('Property-Related Incidents', 'Vandalism / Property Damage'),
  ('Property-Related Incidents', 'Shoplifting'),
  ('Traffic and Road Incidents', 'Vehicular Accident'),
  ('Traffic and Road Incidents', 'Reckless Driving'),
  ('Traffic and Road Incidents', 'Illegal Parking'),
  ('Traffic and Road Incidents', 'Road Obstruction'),
  ('Community and Environmental Concerns', 'Fire Incident'),
  ('Community and Environmental Concerns', 'Flooding'),
  ('Community and Environmental Concerns', 'Blocked Drainage'),
  ('Community and Environmental Concerns', 'Garbage / Sanitation Issues'),
  ('Community and Environmental Concerns', 'Streetlight Outage'),
  ('Suspicious Activities', 'Suspicious Person'),
  ('Suspicious Activities', 'Suspicious Vehicle'),
  ('Suspicious Activities', 'Unattended / Abandoned Object'),
  ('Suspicious Activities', 'Unusual Behavior'),
  ('Suspicious Activities', 'Loitering / Suspicious Presence'),
  ('Public Assistance / Community Reports', 'Missing Pet'),
  ('Public Assistance / Community Reports', 'Lost Item'),
  ('Public Assistance / Community Reports', 'Request for Assistance'),
  ('Public Assistance / Community Reports', 'General Safety Concern'),
  ('Cyber and Online Incidents (Non-sensitive)', 'Online Scam / Suspicious Message'),
  ('Cyber and Online Incidents (Non-sensitive)', 'Cyberbullying'),
  ('Cyber and Online Incidents (Non-sensitive)', 'Fake Information / Misinformation')
) as t(category_name, incident_type)
join public.incident_categories c on c.name = t.category_name
on conflict (category_id, name) do nothing;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  incident_type_id uuid references public.incident_types(id) on delete set null,
  location text,
  latitude double precision,
  longitude double precision,
  poster_name text,
  display_name_type text not null default 'Username'
    check (display_name_type in ('Fullname', 'Username')),
  details text not null default '',
  status text not null default 'Pending Review'
    check (status in ('Pending Review', 'Under Verification', 'Resolved', 'Rejected', 'Archived', 'Marked Fake')),
  is_verified boolean not null default false,
  role text not null default 'user'
    check (role in ('user', 'admin', 'super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_images (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  image_url text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists report_images_report on public.report_images(report_id);

create table if not exists public.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists report_comments_report on public.report_comments(report_id);

create table if not exists public.report_likes (
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create table if not exists public.admin_posts (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  type text not null default 'Safety/Tips'
    check (type in ('Seminar', 'Safety/Tips', 'Curfew', 'Announcement')),
  location text,
  details text not null,
  pic_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  drop trigger if exists set_reports_updated_at on public.reports;
  create trigger set_reports_updated_at
    before update on public.reports
    for each row execute function public.set_updated_at();
end $$;

do $$
begin
  drop trigger if exists set_admin_posts_updated_at on public.admin_posts;
  create trigger set_admin_posts_updated_at
    before update on public.admin_posts
    for each row execute function public.set_updated_at();
end $$;

alter table public.reports enable row level security;
alter table public.report_images enable row level security;
alter table public.report_comments enable row level security;
alter table public.report_likes enable row level security;
alter table public.admin_posts enable row level security;

create policy "read_all_reports" on public.reports for select using (true);
create policy "insert_own_report" on public.reports for insert
  with check (auth.uid() = user_id);
create policy "update_own_report" on public.reports for update
  using (auth.uid() = user_id);
create policy "delete_own_report" on public.reports for delete
  using (auth.uid() = user_id);

create policy "read_all_report_images" on public.report_images for select using (true);
create policy "insert_report_images" on public.report_images for insert
  with check (exists (
    select 1 from public.reports r where r.id = report_id and r.user_id = auth.uid()
  ));
create policy "delete_report_images" on public.report_images for delete
  using (exists (
    select 1 from public.reports r where r.id = report_id and r.user_id = auth.uid()
  ));

create policy "read_all_comments" on public.report_comments for select using (true);
create policy "insert_comment" on public.report_comments for insert
  with check (auth.uid() = user_id);
create policy "delete_own_comment" on public.report_comments for delete
  using (auth.uid() = user_id);

create policy "read_all_likes" on public.report_likes for select using (true);
create policy "insert_own_like" on public.report_likes for insert
  with check (auth.uid() = user_id);
create policy "delete_own_like" on public.report_likes for delete
  using (auth.uid() = user_id);

create policy "read_all_admin_posts" on public.admin_posts for select using (true);
create policy "admin_write_posts" on public.admin_posts for insert
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));
create policy "admin_update_posts" on public.admin_posts for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));
create policy "admin_delete_posts" on public.admin_posts for delete
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));