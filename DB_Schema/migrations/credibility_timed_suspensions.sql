-- Self-contained timed credibility policy for the existing application schema.
-- Safe to rerun: preserves scores, rewards, usage and suspension deadlines.
begin;
revoke insert,update,delete on public.user_credibility,public.credibility_events from anon,authenticated;
create table if not exists public.credibility_usage (
  kind text not null check(kind in ('report','comment')),
  source_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key(kind,source_id)
);
create index if not exists credibility_usage_user_day on public.credibility_usage(user_id,kind,used_at);
create table if not exists public.credibility_report_effects (
  -- Evidence survives report deletion, so deletion cannot erase a scored outcome.
  report_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check(event_type in ('report_verified','report_rejected','report_marked_fake')),
  applied numeric not null default 0,
  active boolean not null default true,
  corrected boolean not null default false,
  primary key(report_id,event_type)
);
alter table public.credibility_report_effects drop constraint if exists credibility_report_effects_report_id_fkey;
alter table public.credibility_usage enable row level security;
alter table public.credibility_report_effects enable row level security;
revoke all on public.credibility_usage,public.credibility_report_effects from public,anon,authenticated;
grant select,insert,update,delete on public.credibility_usage,public.credibility_report_effects to service_role;

-- Record existing usage and rewards without replaying points or refunding usage.
insert into public.credibility_usage(kind,source_id,user_id,used_at)
select 'report',id,user_id,created_at from public.reports where user_id is not null on conflict do nothing;
insert into public.credibility_usage(kind,source_id,user_id,used_at)
select 'comment',id,user_id,created_at from public.report_comments where user_id is not null on conflict do nothing;
insert into public.credibility_report_effects(report_id,user_id,event_type,applied)
select report_id,user_id,event_type,sum(points) from public.credibility_events
where report_id is not null and event_type in ('report_verified','report_rejected','report_marked_fake')
group by report_id,user_id,event_type on conflict do nothing;

do $$ declare c record; begin
  for c in select conname,pg_get_expr(conbin,conrelid) as expression from pg_constraint
    where conrelid='public.notification_types'::regclass and contype='c' and pg_get_expr(conbin,conrelid) like '%name%' loop
    if c.expression not like '%credibility_suspension%' then
      execute format('alter table public.notification_types drop constraint %I',c.conname);
      execute format('alter table public.notification_types add constraint %I check ((%s) or name=''credibility_suspension'')',c.conname,c.expression);
    end if;
  end loop;
end $$;
insert into public.notification_types(name) values('credibility_suspension') on conflict(name) do nothing;

create table if not exists public.credibility_suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  occurrence integer not null check(occurrence>0),
  duration_days integer not null check(duration_days in (1,3,7,14,30)),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  released_at timestamptz,
  reason text not null,
  check(ends_at>started_at)
);
create unique index if not exists credibility_one_open_suspension on public.credibility_suspensions(user_id) where released_at is null;
create index if not exists credibility_suspensions_user_date on public.credibility_suspensions(user_id,started_at desc);
alter table public.credibility_suspensions enable row level security;
revoke all on public.credibility_suspensions from public,anon,authenticated;
grant select,insert,update,delete on public.credibility_suspensions to service_role;

create or replace function public.refresh_credibility_suspension(p_user uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare s numeric; suspension credibility_suspensions; previous credibility_suspensions;
  occurrence integer; days integer; reason_text text;
begin
  if not exists(select 1 from profiles where id=p_user and role='user') then return; end if;
  insert into user_credibility(user_id) values(p_user) on conflict(user_id) do nothing;
  select score into s from user_credibility where user_id=p_user for update;
  select * into suspension from credibility_suspensions where user_id=p_user and released_at is null for update;
  if found then
    if suspension.ends_at>now() then return; end if;
    -- Recovery is evaluated by authoritative server time, exactly once. Rewards
    -- earned during the suspension are never reduced by expiry.
    update credibility_suspensions set released_at=now() where id=suspension.id;
    update user_credibility set score=greatest(s,20) where user_id=p_user;
    insert into credibility_events(user_id,event_type,points,reason)
      values(p_user,'system',greatest(s,20)-s,'Timed suspension expired; limited access restored');
    insert into notifications(user_id,type_id,title,message,priority)
      select p_user,id,'Your suspension has ended','Posting access is restored. Your credibility score is at least 20; daily limits still apply.','Low'
      from notification_types where name='credibility_suspension';
    return;
  end if;
  if s>=20 then return; end if;
  select * into previous from credibility_suspensions where user_id=p_user order by started_at desc limit 1;
  occurrence:=case when not found or previous.ends_at<=now()-interval '90 days' then 1 else previous.occurrence+1 end;
  days:=case occurrence when 1 then 1 when 2 then 3 when 3 then 7 when 4 then 14 else 30 end;
  select reason into reason_text from credibility_events where user_id=p_user and points<0 order by created_at desc limit 1;
  reason_text:=coalesce(nullif(trim(reason_text),''),'Credibility score fell below 20.');
  insert into credibility_suspensions(user_id,occurrence,duration_days,ends_at,reason)
    values(p_user,occurrence,days,now()+make_interval(days=>days),reason_text) returning * into suspension;
  insert into notifications(user_id,type_id,title,message,priority)
    select p_user,id,'Temporary account suspension',
      'Posting and commenting are suspended for '||days||' day(s), until '||to_char(suspension.ends_at at time zone 'Asia/Manila','YYYY-MM-DD HH24:MI')||' Philippine time. '||reason_text,'High'
    from notification_types where name='credibility_suspension';
end $$;

create or replace function public.start_credibility_suspension() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform refresh_credibility_suspension(new.user_id);
  return new;
end $$;
drop trigger if exists credibility_start_suspension on public.user_credibility;
create trigger credibility_start_suspension after insert or update of score on public.user_credibility
  for each row when(new.score<20) execute function public.start_credibility_suspension();

create or replace function public.credibility_access(p_user uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s numeric; r text; rl int; cl int; ru int; cu int; suspension credibility_suspensions;
  blocked boolean; day_start timestamptz:=date_trunc('day',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila';
begin
  select role into r from profiles where id=p_user;
  if r is null then raise exception 'Account unavailable'; end if;
  if r in ('admin','super_admin') then return jsonb_build_object('policyVersion','timed-v1','exempt',true,'score',100,'suspended',false,'reportAllowed',true,'commentAllowed',true,'editAllowed',true); end if;
  perform refresh_credibility_suspension(p_user);
  select score into s from user_credibility where user_id=p_user;
  select * into suspension from credibility_suspensions where user_id=p_user and released_at is null;
  blocked:=found;
  rl:=case when blocked then 0 when s=100 then 10 when s>=60 then 3 when s>=20 then 1 else 0 end;
  cl:=case when blocked then 0 when s=100 then 100 when s>=60 then 10 when s>=40 then 3 else 0 end;
  select count(*) filter(where kind='report'),count(*) filter(where kind='comment') into ru,cu
    from credibility_usage where user_id=p_user and used_at>=day_start;
  return jsonb_build_object('policyVersion','timed-v1','exempt',false,'score',s,'reportLimit',rl,'commentLimit',cl,'reportsUsed',ru,'commentsUsed',cu,
    'reportAllowed',not blocked and rl>ru,'commentAllowed',not blocked and cl>cu,'editAllowed',not blocked and s>=20,
    'suspended',blocked,'resetsAt',day_start+interval '1 day','timezone','Asia/Manila',
    'suspension',case when blocked then jsonb_build_object('id',suspension.id,'occurrence',suspension.occurrence,
      'durationDays',suspension.duration_days,'startedAt',suspension.started_at,'endsAt',suspension.ends_at,'reason',suspension.reason) else null end);
end $$;

create or replace function public.score_reviewed_report() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare s numeric; n numeric; delta numeric; outcome text; effect record;
begin
  if new.status is not distinct from old.status and new.is_verified is not distinct from old.is_verified then return new; end if;
  if exists(select 1 from profiles where id=new.user_id and role in ('admin','super_admin')) then return new; end if;
  -- Finish any elapsed suspension BEFORE applying this new review outcome.
  perform refresh_credibility_suspension(new.user_id);
  select score into s from user_credibility where user_id=new.user_id for update;
  outcome:=case when new.status='Marked Fake' then 'report_marked_fake' when new.status='Rejected' then 'report_rejected'
    when new.is_verified then 'report_verified' else null end;
  -- Retain outcome supersession, not a standalone manual correction operation.
  if outcome is not null then
    for effect in select * from credibility_report_effects where report_id=new.id and active
      and event_type in ('report_rejected','report_marked_fake') and event_type<>outcome for update loop
      n:=least(100,greatest(0,s-effect.applied));
      insert into credibility_events(user_id,event_type,points,reason,report_id)
        values(new.user_id,'admin_adjustment',n-s,'Previous deduction replaced by reviewed outcome',new.id);
      s:=n;
      update credibility_report_effects set active=false where report_id=effect.report_id and event_type=effect.event_type;
    end loop;
    select * into effect from credibility_report_effects where report_id=new.id and event_type=outcome;
    if not found or (not effect.active and not effect.corrected and outcome<>'report_verified') then
      delta:=case outcome when 'report_verified' then 15 when 'report_rejected' then -10 else -30 end;
      n:=least(100,greatest(0,s+delta));
      insert into credibility_events(user_id,event_type,points,reason,report_id)
        values(new.user_id,outcome,n-s,'Admin report review',new.id);
      insert into credibility_report_effects(report_id,user_id,event_type,applied,active)
        values(new.id,new.user_id,outcome,n-s,true)
        on conflict(report_id,event_type) do update set applied=excluded.applied,active=true;
      s:=n;
    end if;
  end if;
  update user_credibility set score=s where user_id=new.user_id;
  return new;
end $$;

create or replace function public.enforce_credibility_write() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb; k text; allowed boolean;
begin
  insert into user_credibility(user_id) values(new.user_id) on conflict(user_id) do nothing;
  perform 1 from user_credibility where user_id=new.user_id for update;
  a:=credibility_access(new.user_id);
  if (a->>'exempt')::boolean then return new; end if;
  k:=case when tg_table_name='reports' then 'report' else 'comment' end;
  allowed:=(a->>(k||'Allowed'))::boolean;
  if not allowed then
    raise exception using message=case when (a->>'suspended')::boolean then 'CREDIBILITY_SUSPENDED'
      when k='comment' and (a->>'commentLimit')::int=0 then 'CREDIBILITY_COMMENTS_DISABLED'
      else 'CREDIBILITY_DAILY_LIMIT' end,detail=a::text;
  end if;
  insert into credibility_usage(kind,source_id,user_id) values(k,new.id,new.user_id);
  return new;
end $$;
drop trigger if exists credibility_report_limit on public.reports;
create trigger credibility_report_limit before insert on public.reports for each row execute function public.enforce_credibility_write();
drop trigger if exists credibility_comment_limit on public.report_comments;
create trigger credibility_comment_limit before insert on public.report_comments for each row execute function public.enforce_credibility_write();

create or replace function public.protect_report_review_fields() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare jwt_role text;
begin
  jwt_role:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_setting('request.jwt.claim.role',true),'');
  if jwt_role='authenticated' and not exists(select 1 from profiles where id=auth.uid() and role in ('admin','super_admin') and coalesce(status,'')<>'Disabled') then
    if tg_op='INSERT' then new.status:='Pending Review'; new.is_verified:=false;
    elsif new.status is distinct from old.status or new.is_verified is distinct from old.is_verified or new.user_id is distinct from old.user_id then
      raise exception 'Only admins can change report review fields';
    end if;
  end if;
  if new.status in ('Archived','Rejected','Marked Fake') then new.is_verified:=false; end if;
  return new;
end $$;
drop trigger if exists credibility_protect_review_fields on public.reports;
create trigger credibility_protect_review_fields before insert or update on public.reports
  for each row execute function public.protect_report_review_fields();
drop trigger if exists credibility_review_score on public.reports;
create trigger credibility_review_score after update of status,is_verified on public.reports
  for each row execute function public.score_reviewed_report();

-- Already-low accounts begin their FIRST timed suspension at migration time;
-- historical verification rewards are not increased retroactively.
select public.refresh_credibility_suspension(c.user_id) from public.user_credibility c
  join public.profiles p on p.id=c.user_id where p.role='user' and c.score<20;
revoke all on function public.refresh_credibility_suspension(uuid),public.start_credibility_suspension(),
  public.credibility_access(uuid),public.score_reviewed_report(),public.enforce_credibility_write(),
  public.protect_report_review_fields() from public,anon,authenticated;
grant execute on function public.credibility_access(uuid) to service_role;
notify pgrst,'reload schema';
commit;
