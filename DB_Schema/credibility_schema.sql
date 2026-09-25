create table if not exists public.user_credibility (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  score numeric(5,2) not null default 60 check (score >= 0 and score <= 100),
  level smallint not null default 3 check (level between 0 and 4),
  level_label text not null default 'Limited'
    check (level_label in ('Suspended', 'At risk', 'Very Limited', 'Limited', 'All good')),
  updated_at timestamptz not null default now()
);

create or replace function public.set_credibility_level()
returns trigger language plpgsql as $$
begin
  if new.score >= 80 then
    new.level := 4;
    new.level_label := 'All good';
  elsif new.score >= 60 then
    new.level := 3;
    new.level_label := 'Limited';
  elsif new.score >= 40 then
    new.level := 2;
    new.level_label := 'Very Limited';
  elsif new.score >= 20 then
    new.level := 1;
    new.level_label := 'At risk';
  else
    new.level := 0;
    new.level_label := 'Suspended';
  end if;
  return new;
end;
$$;

do $$
begin
  drop trigger if exists set_credibility_level_trigger on public.user_credibility;
  create trigger set_credibility_level_trigger
    before insert or update on public.user_credibility
    for each row execute function public.set_credibility_level();
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
  drop trigger if exists set_user_credibility_updated_at on public.user_credibility;
  create trigger set_user_credibility_updated_at
    before update on public.user_credibility
    for each row execute function public.set_updated_at();
end $$;

create table if not exists public.credibility_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null
    check (event_type in ('report_submitted', 'report_verified', 'report_rejected', 'report_resolved', 'penalty', 'admin_adjustment', 'system')),
  points numeric(5,2) not null,
  reason text not null default '',
  report_id uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists credibility_events_user on public.credibility_events(user_id);

create table if not exists public.report_credibility_analysis (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  ai_score numeric(5,2) not null default 0 check (ai_score >= 0 and ai_score <= 100),
  severity text not null default 'Medium'
    check (severity in ('Low', 'Medium', 'High', 'Critical')),
  credibility_level text not null default 'Medium'
    check (credibility_level in ('Low', 'Medium', 'High')),
  credibility_review text not null default '',
  ai_model_version text not null default '',
  analysis_duration_ms integer not null default 0,
  analyzed_at timestamptz not null default now()
);

create table if not exists public.sentiment_analysis (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('report', 'comment')),
  subject_id uuid not null,
  label text not null check (label in ('positive', 'neutral', 'negative', 'mixed', 'unclear')),
  confidence numeric(5,4) not null default 0 check (confidence >= 0 and confidence <= 1),
  language text not null default 'unknown' check (language in ('english', 'filipino', 'cebuano', 'unknown')),
  provider text not null default 'none' check (provider in ('local', 'gemini', 'ensemble', 'none')),
  model text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'unavailable', 'skipped')),
  input_hash text not null default '',
  source_text text not null default '',
  error_code text not null default '',
  analyzed_at timestamptz,
  request_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_type, subject_id)
);

create index if not exists sentiment_analysis_subject_idx
  on public.sentiment_analysis(subject_type, subject_id);
create index if not exists sentiment_analysis_status_idx
  on public.sentiment_analysis(status, updated_at desc);

create or replace function public.cleanup_sentiment_analysis()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'reports' then
    delete from public.sentiment_analysis
    where subject_type = 'report' and subject_id = old.id;
  else
    delete from public.sentiment_analysis
    where subject_type = 'comment' and subject_id = old.id;
  end if;
  return old;
end;
$$;

create or replace function public.set_sentiment_analysis_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.sentiment_analysis') is not null then
    drop trigger if exists set_sentiment_analysis_updated_at on public.sentiment_analysis;
    create trigger set_sentiment_analysis_updated_at
      before update on public.sentiment_analysis
      for each row execute function public.set_sentiment_analysis_updated_at();
  end if;

  if to_regclass('public.reports') is not null then
    drop trigger if exists cleanup_report_sentiment on public.reports;
    create trigger cleanup_report_sentiment
      after delete on public.reports
      for each row execute function public.cleanup_sentiment_analysis();
    drop trigger if exists cleanup_report_sentiment_on_text_change on public.reports;
    create trigger cleanup_report_sentiment_on_text_change
      after update of details on public.reports
      for each row
      when (old.details is distinct from new.details)
      execute function public.cleanup_sentiment_analysis();
  end if;

  if to_regclass('public.report_comments') is not null then
    drop trigger if exists cleanup_comment_sentiment on public.report_comments;
    create trigger cleanup_comment_sentiment
      after delete on public.report_comments
      for each row execute function public.cleanup_sentiment_analysis();
    drop trigger if exists cleanup_comment_sentiment_on_text_change on public.report_comments;
    create trigger cleanup_comment_sentiment_on_text_change
      after update of content on public.report_comments
      for each row
      when (old.content is distinct from new.content)
      execute function public.cleanup_sentiment_analysis();
  end if;
end $$;

alter table public.sentiment_analysis enable row level security;

create policy "read_all_sentiment_analysis"
  on public.sentiment_analysis for select
  to authenticated
  using (true);

drop policy if exists "write_sentiment_analysis" on public.sentiment_analysis;
drop policy if exists "update_sentiment_analysis" on public.sentiment_analysis;
drop policy if exists "delete_sentiment_analysis" on public.sentiment_analysis;

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  ai_credibility_enabled boolean not null default true,
  high_credibility_threshold smallint not null default 90
    check (high_credibility_threshold between 0 and 100),
  medium_credibility_threshold smallint not null default 60
    check (medium_credibility_threshold between 0 and 100),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.system_settings') is not null
     and to_regclass('public.app_settings') is not null then
    insert into public.system_settings (key, value)
    select
      'ai_scoring_enabled',
      case when ai_credibility_enabled then 'true' else 'false' end
    from public.app_settings
    order by updated_at desc
    limit 1
    on conflict (key) do nothing;

    insert into public.system_settings (key, value)
    select 'ai_high_threshold', high_credibility_threshold::text
    from public.app_settings
    order by updated_at desc
    limit 1
    on conflict (key) do nothing;

    insert into public.system_settings (key, value)
    select 'ai_medium_threshold', medium_credibility_threshold::text
    from public.app_settings
    order by updated_at desc
    limit 1
    on conflict (key) do nothing;
  end if;

  if to_regclass('public.system_settings') is not null then
    insert into public.system_settings (key, value) values
      ('ai_scoring_enabled', 'true'),
      ('ai_high_threshold', '85'),
      ('ai_medium_threshold', '60'),
      ('sentiment_local_model_enabled', 'true'),
      ('sentiment_gemini_enabled', 'true'),
      ('sentiment_cebuano_mode', 'gemini')
    on conflict (key) do nothing;
  end if;
end $$;

do $$
begin
  drop trigger if exists set_app_settings_updated_at on public.app_settings;
  create trigger set_app_settings_updated_at
    before update on public.app_settings
    for each row execute function public.set_updated_at();
end $$;

insert into public.app_settings (ai_credibility_enabled, high_credibility_threshold, medium_credibility_threshold)
select true, 90, 60
where not exists (select 1 from public.app_settings);

insert into public.user_credibility (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function public.handle_new_credibility()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_credibility (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

do $$
begin
  drop trigger if exists on_profile_created_credibility on public.profiles;
  create trigger on_profile_created_credibility
    after insert on public.profiles
    for each row execute function public.handle_new_credibility();
end $$;

alter table public.user_credibility enable row level security;
alter table public.credibility_events enable row level security;
alter table public.report_credibility_analysis enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "read_app_settings" on public.app_settings;

create policy "read_own_credibility"
  on public.user_credibility for select
  to authenticated
  using (auth.uid() = user_id);

create policy "read_all_credibility"
  on public.user_credibility for select
  to authenticated
  using (public.current_user_role() in ('admin', 'super_admin'));

create policy "read_own_credibility_events"
  on public.credibility_events for select
  to authenticated
  using (auth.uid() = user_id);

create policy "read_all_credibility_events"
  on public.credibility_events for select
  to authenticated
  using (public.current_user_role() in ('admin', 'super_admin'));

create policy "read_all_report_credibility"
  on public.report_credibility_analysis for select
  to authenticated
  using (true);