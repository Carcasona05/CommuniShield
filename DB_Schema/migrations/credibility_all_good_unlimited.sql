-- Run after credibility_timed_suspensions.sql.
-- All good (100 points) has no daily write quota. NULL limits mean unlimited;
-- suspension and profile-completion restrictions remain in force.
begin;

create or replace function public.credibility_access(p_user uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s numeric; r text; rl int; cl int; ru int; cu int; suspension credibility_suspensions;
  blocked boolean; unlimited boolean;
  day_start timestamptz:=date_trunc('day',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila';
begin
  select role into r from profiles where id=p_user;
  if r is null then raise exception 'Account unavailable'; end if;
  if r in ('admin','super_admin') then
    return jsonb_build_object('policyVersion','timed-v1','exempt',true,'score',100,'unlimited',true,
      'suspended',false,'reportAllowed',true,'commentAllowed',true,'editAllowed',true);
  end if;
  perform refresh_credibility_suspension(p_user);
  select score into s from user_credibility where user_id=p_user;
  select * into suspension from credibility_suspensions where user_id=p_user and released_at is null;
  blocked:=found;
  unlimited:=not blocked and s=100;
  rl:=case when blocked then 0 when unlimited then null when s>=60 then 3 when s>=20 then 1 else 0 end;
  cl:=case when blocked then 0 when unlimited then null when s>=60 then 10 when s>=40 then 3 else 0 end;
  select count(*) filter(where kind='report'),count(*) filter(where kind='comment') into ru,cu
    from credibility_usage where user_id=p_user and used_at>=day_start;
  return jsonb_build_object('policyVersion','timed-v1','exempt',false,'score',s,'unlimited',unlimited,
    'reportLimit',rl,'commentLimit',cl,'reportsUsed',ru,'commentsUsed',cu,
    'reportAllowed',not blocked and (unlimited or rl>ru),
    'commentAllowed',not blocked and (unlimited or cl>cu),'editAllowed',not blocked and s>=20,
    'suspended',blocked,'resetsAt',day_start+interval '1 day','timezone','Asia/Manila',
    'suspension',case when blocked then jsonb_build_object('id',suspension.id,'occurrence',suspension.occurrence,
      'durationDays',suspension.duration_days,'startedAt',suspension.started_at,'endsAt',suspension.ends_at,'reason',suspension.reason) else null end);
end $$;

commit;
