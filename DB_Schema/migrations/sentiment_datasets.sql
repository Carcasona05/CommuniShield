-- Apply in Supabase SQL Editor before deploying the dataset manager.
-- Examples are a reviewed training pool, never automatic model overrides.
create table if not exists public.sentiment_datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  source text not null check (source in ('manual', 'csv')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sentiment_training_samples (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.sentiment_datasets(id),
  text text not null check (char_length(text) between 1 and 2000),
  language text not null check (language in ('english', 'filipino', 'cebuano')),
  label text not null check (label in ('positive', 'neutral', 'negative')),
  text_key text not null check (text_key ~ '^[a-f0-9]{64}$'),
  active boolean not null default true
);
-- Unique regardless of label: conflicting labels cannot silently coexist.
create unique index if not exists sentiment_training_active_key on public.sentiment_training_samples(text_key) where active;
create index if not exists sentiment_training_dataset_id on public.sentiment_training_samples(dataset_id);
create index if not exists sentiment_datasets_created_at on public.sentiment_datasets(created_at desc);
create table if not exists public.sentiment_dataset_events (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.sentiment_datasets(id),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.sentiment_datasets enable row level security;
alter table public.sentiment_training_samples enable row level security;
alter table public.sentiment_dataset_events enable row level security;
-- All access goes through the role-checked API. No direct browser writes.
revoke all on public.sentiment_datasets, public.sentiment_training_samples, public.sentiment_dataset_events from anon, authenticated;
grant all on public.sentiment_datasets, public.sentiment_training_samples, public.sentiment_dataset_events to service_role;

create or replace function public.manage_sentiment_dataset(p_actor uuid, p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles%rowtype;
  batch public.sentiment_datasets%rowtype;
  sample public.sentiment_training_samples%rowtype;
  item jsonb;
  result_id uuid;
  next_status text;
  note text;
begin
  select * into actor from public.profiles where id = p_actor;
  if actor.id is null or actor.role not in ('admin', 'super_admin') or actor.status = 'Disabled' then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  -- Serialize dataset mutations, including duplicate checks and review/export
  -- snapshots. A database uniqueness constraint provides an additional guard.
  perform pg_advisory_xact_lock(72846102);
  if p_action = 'submit' then
    if (p_payload->>'privacy_reviewed') is distinct from 'true' then raise exception 'Data review confirmation required' using errcode = '22023'; end if;
    if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') not between 1 and 1000 then
      raise exception 'Provide 1 to 1000 examples' using errcode = '22023';
    end if;
    insert into public.sentiment_datasets(name, source, created_by, created_by_name)
    values (p_payload->>'name', p_payload->>'source', p_actor, coalesce(actor.fullname, actor.user_name, 'Admin')) returning id into result_id;
    for item in select value from jsonb_array_elements(p_payload->'rows') loop
      insert into public.sentiment_training_samples(dataset_id, text, language, label, text_key)
      values (result_id, item->>'text', item->>'language', item->>'label', item->>'text_key');
    end loop;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
    values (result_id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), 'submitted', jsonb_build_object('count', jsonb_array_length(p_payload->'rows'), 'source', p_payload->>'source', 'privacy_reviewed', true));
    return jsonb_build_object('id', result_id);
  end if;
  select * into batch from public.sentiment_datasets where id = (p_payload->>'dataset_id')::uuid for update;
  if batch.id is null then raise exception 'Dataset not found' using errcode = 'P0002'; end if;
  if (p_payload->>'version') is null or batch.version <> (p_payload->>'version')::integer then
    raise exception 'Dataset changed. Refresh and try again.' using errcode = '40001';
  end if;
  if p_action = 'export' then
    if actor.role <> 'super_admin' then raise exception 'Only super admins can export training data' using errcode = '42501'; end if;
    if batch.status <> 'approved' then raise exception 'Only approved datasets can be exported' using errcode = '22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('text', text, 'language', language, 'label', label) order by id), '[]'::jsonb)
      into item from public.sentiment_training_samples where dataset_id = batch.id and active;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
      values (batch.id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), 'exported', jsonb_build_object('version', batch.version, 'count', jsonb_array_length(item), 'format', p_payload->>'format'));
    return jsonb_build_object('dataset_id', batch.id, 'version', batch.version, 'status', 'approved', 'samples', item);
  end if;
  if p_action = 'edit' then
    if batch.status <> 'pending' then raise exception 'Only pending examples can be edited' using errcode = '22023'; end if;
    if batch.created_by is distinct from p_actor and actor.role <> 'super_admin' then raise exception 'Only the submitter or super admin can edit' using errcode = '42501'; end if;
    select * into sample from public.sentiment_training_samples where id = (p_payload->>'sample_id')::uuid and dataset_id = batch.id for update;
    if sample.id is null then raise exception 'Example not found' using errcode = 'P0002'; end if;
    item := p_payload->'sample';
    update public.sentiment_training_samples set text = item->>'text', language = item->>'language', label = item->>'label', text_key = item->>'text_key' where id = sample.id;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
    values (batch.id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), 'edited', jsonb_build_object('sample_id', sample.id, 'before', to_jsonb(sample), 'after', item));
  elsif p_action in ('approve', 'reject', 'archive') then
    note := coalesce(p_payload->>'note', '');
    if char_length(note) > 1000 then raise exception 'Review note is too long' using errcode = '22023'; end if;
    if p_action in ('approve', 'reject') then
      if actor.role <> 'super_admin' then raise exception 'Only super admins can review datasets' using errcode = '42501'; end if;
      if batch.status <> 'pending' then raise exception 'Only pending datasets can be reviewed' using errcode = '22023'; end if;
      if p_action = 'reject' and btrim(note) = '' then raise exception 'A rejection reason is required' using errcode = '22023'; end if;
    else
      if batch.status = 'archived' then raise exception 'Dataset is already archived' using errcode = '22023'; end if;
      if actor.role <> 'super_admin' and (batch.status <> 'pending' or batch.created_by is distinct from p_actor) then
        raise exception 'Only your own pending dataset can be archived' using errcode = '42501';
      end if;
    end if;
    next_status := case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'archived' end;
    update public.sentiment_datasets set status = next_status,
      reviewed_by = case when p_action = 'archive' then reviewed_by else p_actor end,
      review_note = case when p_action = 'archive' then review_note else note end
      where id = batch.id;
    update public.sentiment_training_samples set active = (next_status = 'approved') where dataset_id = batch.id;
    insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
    values (batch.id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), next_status, jsonb_build_object('from', batch.status, 'to', next_status, 'note', note));
  else
    raise exception 'Unsupported action' using errcode = '22023';
  end if;
  update public.sentiment_datasets set version = version + 1, updated_at = now() where id = batch.id;
  return jsonb_build_object('id', batch.id);
end;
$$;
revoke all on function public.manage_sentiment_dataset(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.manage_sentiment_dataset(uuid, text, jsonb) to service_role;
