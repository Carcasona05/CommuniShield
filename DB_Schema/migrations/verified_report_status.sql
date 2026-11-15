-- Run AFTER admin_analysis_jobs.sql and credibility_timed_suspensions.sql.
-- Adds Verified as an active, confirmed status, separate from Resolved.
-- Existing reports/statuses/scores are NOT backfilled or rewritten.
begin;

alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports add constraint reports_status_check
  check (status in ('Pending Review','Under Verification','Verified','Resolved','Rejected','Archived','Marked Fake'));
alter table public.report_validations drop constraint if exists report_validations_action_check;
alter table public.report_validations add constraint report_validations_action_check
  check (action in ('Under Verification','Verified','Resolved','Rejected','Archived','Marked Fake'));

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
  -- Keep older verification-only callers compatible with the new status.
  if tg_op='UPDATE' and new.status is not distinct from old.status and new.is_verified is distinct from old.is_verified then
    if new.is_verified and new.status in ('Pending Review','Under Verification') then new.status:='Verified';
    elsif not new.is_verified and new.status='Verified' then new.status:='Under Verification'; end if;
  end if;
  new.is_verified:=new.status in ('Verified','Resolved');
  return new;
end $$;

-- Preserve the existing review rewards/deductions and outcome ledger. A second
-- transition from Verified to Resolved finds the same report_verified effect,
-- so it does NOT award verification points twice. Ownerless seed reports have
-- nobody to score and may still be reviewed normally.
create or replace function public.score_reviewed_report() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare s numeric; n numeric; delta numeric; outcome text; effect record;
begin
  if new.status is not distinct from old.status and new.is_verified is not distinct from old.is_verified then return new; end if;
  if new.user_id is null then return new; end if;
  if exists(select 1 from profiles where id=new.user_id and role in ('admin','super_admin')) then return new; end if;
  perform refresh_credibility_suspension(new.user_id);
  select score into s from user_credibility where user_id=new.user_id for update;
  outcome:=case when new.status='Marked Fake' then 'report_marked_fake' when new.status='Rejected' then 'report_rejected'
    when new.is_verified then 'report_verified' else null end;
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

create or replace function public.save_admin_report_status(p_report uuid,p_actor uuid,p_actor_name text,p_status text,p_verified boolean)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r reports%rowtype; next_status text; next_verified boolean; job uuid; incident text; action text;
begin
  select * into r from reports where id=p_report for update;
  if not found then raise exception 'Report not found'; end if;
  next_status:=coalesce(p_status,r.status); next_verified:=coalesce(p_verified,r.is_verified,false);
  if next_status not in ('Pending Review','Under Verification','Verified','Resolved','Rejected','Marked Fake','Archived') then raise exception 'Invalid report status'; end if;
  if p_status is null and p_verified and r.status in ('Archived','Rejected','Marked Fake') then raise exception 'Invalid verification: choose an active status first'; end if;
  if p_status is null and p_verified and next_status not in ('Verified','Resolved') then next_status:='Verified'; end if;
  if p_status is null and p_verified=false and next_status='Verified' then next_status:='Under Verification'; end if;
  next_verified:=next_status in ('Verified','Resolved');
  if next_status is not distinct from r.status and next_verified is not distinct from r.is_verified then
    return jsonb_build_object('id',r.id,'status',next_status,'is_verified',next_verified,'jobId',null);
  end if;
  select name into incident from incident_types where id=r.incident_type_id;
  update reports set status=next_status,is_verified=next_verified where id=r.id;
  action:=case when next_status='Archived' then 'Report Archived' when next_status in ('Rejected','Marked Fake') then 'Report Rejected'
    when next_status='Verified' then 'Report Verified' else 'Report Status Updated' end;
  insert into audit_logs(actor_id,actor_name,action_type,title,details,report_id,old_value,new_value)
    values(p_actor,p_actor_name,action,case when next_status='Archived' then 'Report archived: ' else 'Report status updated: ' end||coalesce(incident,'Incident'),
      'Status changed from "'||r.status||'" to "'||next_status||'".',r.id,r.status,next_status);
  insert into admin_analysis_jobs(kind,subject_id,report_id,payload)
    values('status_followup',r.id,r.id,jsonb_build_object('actorId',p_actor,'actorName',p_actor_name,'ownerId',r.user_id,
      'location',r.location,'status',next_status,'verified',next_verified)) returning id into job;
  if next_verified then
    insert into admin_analysis_jobs(kind,subject_id,report_id,payload)
      values('credibility',r.id,r.id,jsonb_build_object('actorId',p_actor,'actorName',p_actor_name)),
        ('report_sentiment',r.id,r.id,jsonb_build_object('actorId',p_actor,'actorName',p_actor_name))
      on conflict (kind,subject_id) where state in ('queued','running') and kind <> 'status_followup' do nothing;
  end if;
  return jsonb_build_object('id',r.id,'status',next_status,'is_verified',next_verified,'jobId',job);
end $$;

create or replace function public.feed_safety_reports(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'latitude',r.latitude,'longitude',r.longitude,
    'status',r.status,'verified',r.is_verified,'created_at',r.created_at,
    'incident_type',t.name,'severity',coalesce(a.severity,'Unknown'))), '[]'::jsonb)
  from reports r left join incident_types t on t.id=r.incident_type_id
    left join report_credibility_analysis a on a.report_id=r.id
  where r.created_at between p_from and p_to and r.status in ('Pending Review','Under Verification','Verified')
    and r.latitude is not null and r.longitude is not null;
$$;

revoke all on function public.protect_report_review_fields(),public.score_reviewed_report(),
  public.save_admin_report_status(uuid,uuid,text,text,boolean),public.feed_safety_reports(timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.save_admin_report_status(uuid,uuid,text,text,boolean),public.feed_safety_reports(timestamptz,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
