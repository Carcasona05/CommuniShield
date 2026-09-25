-- Migration: unified hybrid sentiment analysis for reports and comments
-- Run this against an existing CommuniShield Supabase database.

create extension if not exists pgcrypto;

create table if not exists public.sentiment_analysis (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  label text not null default 'unclear',
  confidence numeric(5,4) not null default 0,
  language text not null default 'unknown',
  provider text not null default 'none',
  model text not null default '',
  status text not null default 'pending',
  input_hash text not null default '',
  source_text text not null default '',
  error_code text not null default '',
  analyzed_at timestamptz,
  request_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_type, subject_id)
);

alter table public.sentiment_analysis add column if not exists subject_type text;
alter table public.sentiment_analysis add column if not exists subject_id uuid;
alter table public.sentiment_analysis add column if not exists label text;
alter table public.sentiment_analysis add column if not exists confidence numeric(5,4);
alter table public.sentiment_analysis add column if not exists language text;
alter table public.sentiment_analysis add column if not exists provider text;
alter table public.sentiment_analysis add column if not exists model text;
alter table public.sentiment_analysis add column if not exists status text;
alter table public.sentiment_analysis add column if not exists input_hash text;
alter table public.sentiment_analysis add column if not exists source_text text;
alter table public.sentiment_analysis add column if not exists error_code text;
alter table public.sentiment_analysis add column if not exists analyzed_at timestamptz;
alter table public.sentiment_analysis add column if not exists request_id text;
alter table public.sentiment_analysis add column if not exists created_at timestamptz;
alter table public.sentiment_analysis add column if not exists updated_at timestamptz;

update public.sentiment_analysis
set subject_type = coalesce(nullif(subject_type, ''), 'report'),
    label = coalesce(nullif(label, ''), 'unclear'),
    confidence = coalesce(confidence, 0),
    language = coalesce(nullif(language, ''), 'unknown'),
    provider = coalesce(nullif(provider, ''), 'none'),
    model = coalesce(model, ''),
    status = coalesce(nullif(status, ''), 'pending'),
    input_hash = coalesce(input_hash, ''),
    source_text = coalesce(source_text, ''),
    error_code = coalesce(error_code, ''),
    request_id = coalesce(request_id, ''),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now());

do $$
declare
  null_subject_count bigint;
begin
  select count(*) into null_subject_count
  from public.sentiment_analysis
  where subject_id is null;
  if null_subject_count > 0 then
    raise exception
      'Cannot migrate % sentiment row(s) with null subject_id; backfill or delete them before running this migration',
      null_subject_count;
  end if;
end $$;

alter table public.sentiment_analysis
  alter column subject_type set default 'report',
  alter column subject_type set not null,
  alter column subject_id set not null,
  alter column label set default 'unclear',
  alter column label set not null,
  alter column confidence set default 0,
  alter column confidence set not null,
  alter column language set default 'unknown',
  alter column language set not null,
  alter column provider set default 'none',
  alter column provider set not null,
  alter column model set default '',
  alter column model set not null,
  alter column status set default 'pending',
  alter column status set not null,
  alter column input_hash set default '',
  alter column input_hash set not null,
  alter column source_text set default '',
  alter column source_text set not null,
  alter column error_code set default '',
  alter column error_code set not null,
  alter column request_id set default '',
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
declare
  invalid_subject_type text;
  invalid_label text;
  invalid_language text;
  invalid_provider text;
  invalid_status text;
  invalid_confidence text;
begin
  select string_agg(distinct subject_type, ', ') into invalid_subject_type
  from public.sentiment_analysis
  where subject_type is not null
    and subject_type not in ('report', 'comment');
  if invalid_subject_type is not null then
    raise exception 'Invalid sentiment subject types: %', invalid_subject_type;
  end if;

  select string_agg(distinct label, ', ') into invalid_label
  from public.sentiment_analysis
  where label is not null
    and label not in ('positive', 'neutral', 'negative', 'mixed', 'unclear');
  if invalid_label is not null then
    raise exception 'Invalid sentiment labels: %', invalid_label;
  end if;

  select string_agg(distinct language, ', ') into invalid_language
  from public.sentiment_analysis
  where language is not null
    and language not in ('english', 'filipino', 'cebuano', 'unknown');
  if invalid_language is not null then
    raise exception 'Invalid sentiment languages: %', invalid_language;
  end if;

  select string_agg(distinct provider, ', ') into invalid_provider
  from public.sentiment_analysis
  where provider is not null
    and provider not in ('local', 'gemini', 'ensemble', 'none');
  if invalid_provider is not null then
    raise exception 'Invalid sentiment providers: %', invalid_provider;
  end if;

  select string_agg(distinct status, ', ') into invalid_status
  from public.sentiment_analysis
  where status is not null
    and status not in ('pending', 'succeeded', 'failed', 'unavailable', 'skipped');
  if invalid_status is not null then
    raise exception 'Invalid sentiment statuses: %', invalid_status;
  end if;

  select string_agg(distinct confidence::text, ', ') into invalid_confidence
  from public.sentiment_analysis
  where confidence is not null
    and (confidence < 0 or confidence > 1);
  if invalid_confidence is not null then
    raise exception 'Invalid sentiment confidence values: %', invalid_confidence;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.sentiment_analysis'::regclass
      and conname = 'sentiment_analysis_subject_type_check'
  ) then
    alter table public.sentiment_analysis
      drop constraint sentiment_analysis_subject_type_check;
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.sentiment_analysis'::regclass
      and conname = 'sentiment_analysis_label_check'
  ) then
    alter table public.sentiment_analysis
      drop constraint sentiment_analysis_label_check;
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.sentiment_analysis'::regclass
      and conname = 'sentiment_analysis_confidence_check'
  ) then
    alter table public.sentiment_analysis
      drop constraint sentiment_analysis_confidence_check;
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.sentiment_analysis'::regclass
      and conname = 'sentiment_analysis_language_check'
  ) then
    alter table public.sentiment_analysis
      drop constraint sentiment_analysis_language_check;
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.sentiment_analysis'::regclass
      and conname = 'sentiment_analysis_provider_check'
  ) then
    alter table public.sentiment_analysis
      drop constraint sentiment_analysis_provider_check;
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.sentiment_analysis'::regclass
      and conname = 'sentiment_analysis_status_check'
  ) then
    alter table public.sentiment_analysis
      drop constraint sentiment_analysis_status_check;
  end if;

  alter table public.sentiment_analysis
    add constraint sentiment_analysis_subject_type_check
      check (subject_type in ('report', 'comment')),
    add constraint sentiment_analysis_label_check
      check (label in ('positive', 'neutral', 'negative', 'mixed', 'unclear')),
    add constraint sentiment_analysis_confidence_check
      check (confidence >= 0 and confidence <= 1),
    add constraint sentiment_analysis_language_check
      check (language in ('english', 'filipino', 'cebuano', 'unknown')),
    add constraint sentiment_analysis_provider_check
      check (provider in ('local', 'gemini', 'ensemble', 'none')),
    add constraint sentiment_analysis_status_check
      check (status in ('pending', 'succeeded', 'failed', 'unavailable', 'skipped'));
end $$;

do $$
begin
  delete from public.sentiment_analysis
  where id in (
    select id
    from (
      select id,
        row_number() over (
          partition by subject_type, subject_id
          order by
            case status
              when 'succeeded' then 6
              when 'failed' then 5
              when 'unavailable' then 4
              when 'skipped' then 3
              when 'pending' then 2
              else 1
            end desc,
            updated_at desc nulls last,
            created_at desc nulls last,
            id desc
        ) as row_number
      from public.sentiment_analysis
    ) ranked
    where row_number > 1
  );
end $$;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.sentiment_analysis'::regclass
      and contype = 'u'
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.sentiment_analysis'::regclass
            and attname = 'subject_type'
        ),
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.sentiment_analysis'::regclass
            and attname = 'subject_id'
        )
      ]::smallint[]
  loop
    execute format(
      'alter table public.sentiment_analysis drop constraint %I',
      constraint_record.conname
    );
  end loop;
end $$;

create unique index if not exists sentiment_analysis_subject_unique_idx
  on public.sentiment_analysis(subject_type, subject_id);

create index if not exists sentiment_analysis_subject_idx
  on public.sentiment_analysis(subject_type, subject_id);
create index if not exists sentiment_analysis_status_idx
  on public.sentiment_analysis(status, updated_at desc);

create or replace function public.set_sentiment_analysis_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

do $$
begin
  drop trigger if exists set_sentiment_analysis_updated_at on public.sentiment_analysis;
  create trigger set_sentiment_analysis_updated_at
    before update on public.sentiment_analysis
    for each row execute function public.set_sentiment_analysis_updated_at();

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

drop policy if exists "read_all_sentiment_analysis" on public.sentiment_analysis;
create policy "read_all_sentiment_analysis"
  on public.sentiment_analysis for select
  to authenticated
  using (true);

drop policy if exists "write_sentiment_analysis" on public.sentiment_analysis;
drop policy if exists "update_sentiment_analysis" on public.sentiment_analysis;
drop policy if exists "delete_sentiment_analysis" on public.sentiment_analysis;

do $$
begin
  if to_regclass('public.system_settings') is not null then
    if to_regclass('public.app_settings') is not null then
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
  if to_regclass('public.report_credibility_analysis') is not null then
    alter table public.report_credibility_analysis
      drop column if exists sentiment;
  end if;
end $$;
