-- Final functions and required private protocol helpers. Private helper grants remain revoked.

CREATE OR REPLACE FUNCTION public.active_admin_analysis(p_actor uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(public.admin_analysis_progress(b.id)),'[]'::jsonb) from (
    select b.id from admin_analysis_batches b where b.actor_id=p_actor and exists(
      select 1 from admin_analysis_batch_jobs l join admin_analysis_jobs j on j.id=l.job_id
      where l.batch_id=b.id and j.state in ('queued','running')) order by b.created_at desc
  ) b
$function$;

CREATE OR REPLACE FUNCTION public.admin_analysis_progress(p_batch uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('id',b.id,'createdAt',b.created_at,'total',count(j.id),
    'done',count(*) filter(where j.state in ('succeeded','failed','skipped')),
    'failed',count(*) filter(where j.state='failed'),'skipped',count(*) filter(where j.state='skipped'),
    'state',case when bool_or(j.state='running') then 'running' when bool_or(j.state='queued') then 'queued'
      when bool_or(j.state='failed') then 'failed' when bool_or(j.state='skipped') then 'partial' else 'succeeded' end,
    'reports',coalesce((select jsonb_agg(x) from (select j2.report_id as id,count(*) as total,
      count(*) filter(where j2.state in ('succeeded','failed','skipped')) as done,
      count(*) filter(where j2.state='failed') as failed from admin_analysis_batch_jobs l2 join admin_analysis_jobs j2 on j2.id=l2.job_id
      where l2.batch_id=b.id group by j2.report_id) x),'[]'::jsonb))
  from admin_analysis_batches b join admin_analysis_batch_jobs l on l.batch_id=b.id
    join admin_analysis_jobs j on j.id=l.job_id where b.id=p_batch group by b.id
$function$;

CREATE OR REPLACE FUNCTION public.admin_browse_page(p_view text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT NULL::text, p_kind text DEFAULT NULL::text, p_actor_role text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10, p_focus_report uuid DEFAULT NULL::uuid, p_export boolean DEFAULT false, p_before_time timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_kind text DEFAULT NULL::text, p_before_id uuid DEFAULT NULL::uuid, p_before_sort jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare result jsonb;
begin
  if p_view not in ('records', 'logs', 'archived') or p_page < 1 or p_page_size < 1 or p_page_size > 50 then
    raise exception 'Invalid browsing request';
  end if;
  if p_view='records' and p_before_time is not null and
    (p_before_sort is null or (p_before_sort->>'version')::integer is distinct from 1) then
    raise exception 'Record order changed. Refresh the list before loading more.';
  end if;
  with eligible as materialized (
    select r.id as raw_id, 'Incident'::text as kind, r.created_at, r.status, coalesce(r.role, 'user') as actor_role
    from public.reports r
    where (p_view = 'records' and coalesce(r.role,'user') in ('user','admin','super_admin')
      and r.status not in ('Archived','Rejected','Marked Fake'))
       or (p_view = 'archived' and r.status = 'Archived')
    union all
    select a.id, 'Announcement', a.created_at, 'Published', coalesce(p.role, 'admin')
    from public.admin_announcement a left join public.profiles p on p.id = a.admin_id
    where p_view = 'records' and p_status is null and p_actor_role is distinct from 'user'
    union all
    select l.id, 'Activity', l.created_at, l.action_type, coalesce(p.role, 'system')
    from public.audit_logs l left join public.profiles p on p.id = l.actor_id
    where p_view = 'logs' or (p_view = 'records' and p_status is null and p_actor_role is distinct from 'user'
      and coalesce(l.action_type, '') !~* '^report (archived|rejected|marked fake)(\s*:|\s*$)'
      and coalesce(l.title, '') !~* '^report (archived|rejected|marked fake)(\s*:|\s*$)'
      and not exists (select 1 from public.reports excluded where excluded.id=l.report_id and excluded.status in ('Archived','Rejected','Marked Fake')))
  ), filtered as materialized (
    select * from eligible e where (p_from is null or e.created_at >= p_from) and (p_to is null or e.created_at <= p_to)
      and (p_status is null or e.status = p_status)
      and (case when p_view='records' and p_actor_role='user' then e.kind='Incident' else p_kind is null or e.kind = p_kind end)
      and (p_actor_role is null or e.actor_role = p_actor_role)
   ), ranked as materialized (
    select e.*,
      case when p_view<>'records' then 0 when e.kind<>'Incident' then 7 else
        case e.status when 'Pending Review' then 0 when 'Under Verification' then 1 when 'Verified' then 2
          when 'Resolved' then 3 when 'Rejected' then 4 when 'Marked Fake' then 5 else 6 end end as status_rank,
      case when p_view<>'records' or e.kind<>'Incident' then 4 else
        case a.severity when 'Critical' then 0 when 'High' then 1 when 'Medium' then 2 when 'Low' then 3 else 4 end end as severity_rank,
      case when p_view='records' and e.kind='Incident' then extract(epoch from e.created_at)
        else -extract(epoch from e.created_at) end as sort_time
    from filtered e left join public.report_credibility_analysis a on e.kind='Incident' and a.report_id=e.raw_id
   ), remaining as materialized (
    select * from ranked e where p_export or p_before_time is null or
      (e.status_rank,e.severity_rank,e.sort_time,e.kind) >
        (case when p_view='records' then (p_before_sort->>'status_rank')::integer else 0 end,
         case when p_view='records' then (p_before_sort->>'severity_rank')::integer else 4 end,
         case when p_view='records' then (p_before_sort->>'sort_time')::numeric else -extract(epoch from p_before_time) end,p_before_kind)
      or ((e.status_rank,e.severity_rank,e.sort_time,e.kind) =
        (case when p_view='records' then (p_before_sort->>'status_rank')::integer else 0 end,
         case when p_view='records' then (p_before_sort->>'severity_rank')::integer else 4 end,
         case when p_view='records' then (p_before_sort->>'sort_time')::numeric else -extract(epoch from p_before_time) end,p_before_kind)
         and e.raw_id < p_before_id)
   ), selected as (
    select * from remaining order by status_rank, severity_rank, sort_time, kind, raw_id desc
    limit (case when p_export then 50001 else p_page_size end)
    offset (case when p_export or p_before_time is not null then 0 else (p_page::bigint - 1) * p_page_size end)
  ), focused as (
    select e.* from ranked e join public.audit_logs l on l.id = e.raw_id
    where p_view = 'logs' and e.kind = 'Activity' and l.report_id = p_focus_report
    order by e.created_at desc, e.raw_id desc limit 1
  ), wanted as (
    select *, false as focus_only from selected
    union all select *, true from focused
  ), payloads as (
    select e.created_at, e.kind, e.raw_id, e.focus_only, e.status_rank, e.severity_rank, e.sort_time,
      case when e.kind = 'Incident' then jsonb_build_object(
        'id', r.id, 'kind', 'Incident', 'reportType', 'Incident', 'status', r.status,
        'title', coalesce(t.name, 'Incident') || case when coalesce(r.location, '') <> '' then ' in ' || r.location else '' end,
        'incident_type', coalesce(t.name, 'Incident'), 'incident_category', coalesce(c.name, ''),
        'location', coalesce(r.location, ''), 'latitude', r.latitude, 'longitude', r.longitude,
        'details', case when p_export or p_view = 'archived' then coalesce(r.details, '') else left(coalesce(r.details, ''), 240) end,
        'previewOnly', not p_export and p_view = 'records', 'created_at', r.created_at, 'is_verified', r.is_verified,
        'poster_name', r.poster_name, 'reporter_name', coalesce(nullif(rp.fullname, ''), nullif(r.poster_name, ''), 'Anonymous User'),
        'actor', coalesce(nullif(rp.fullname, ''), nullif(r.poster_name, ''), 'Admin'), 'actorRole', e.actor_role,
        'severity', coalesce(analysis.severity, 'Unknown'), 'ai_score', analysis.ai_score)
      when e.kind = 'Announcement' then jsonb_build_object(
        'id', 'announcement-' || a.id, 'kind', 'Announcement', 'type', a.type, 'title', coalesce(nullif(a.title, ''), a.type),
        'location', coalesce(a.location, ''), 'details', a.details, 'pic_url', a.pic_url, 'status', 'Published', 'severity', '',
        'created_at', a.created_at, 'actor', coalesce(nullif(ap.fullname, ''), 'Admin'), 'actorRole', e.actor_role)
      else jsonb_build_object(
        'id', case when p_view = 'records' then 'activity-' || l.id else l.id::text end,
        'kind', 'Activity', 'title', coalesce(nullif(l.title, ''), l.action_type, 'Admin activity'),
        'location', '', 'details', coalesce(l.details, ''), 'status', coalesce(l.action_type, 'Recorded'), 'severity', '',
        'created_at', l.created_at, 'dateTime', l.created_at, 'actionType', l.action_type,
        'actor', coalesce(l.actor_name, 'System'), 'actorRole', e.actor_role, 'reportId', coalesce(l.report_id::text, ''),
        'oldStatus', coalesce(l.old_value, ''), 'newStatus', coalesce(l.new_value, '')) end as item
    from wanted e
    left join public.reports r on e.kind = 'Incident' and r.id = e.raw_id
    left join public.incident_types t on t.id = r.incident_type_id
    left join public.incident_categories c on c.id = t.category_id
    left join public.profiles rp on rp.id = r.user_id
    left join public.report_credibility_analysis analysis on analysis.report_id = r.id
    left join public.admin_announcement a on e.kind = 'Announcement' and a.id = e.raw_id
    left join public.profiles ap on ap.id = a.admin_id
    left join public.audit_logs l on e.kind = 'Activity' and l.id = e.raw_id
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(item order by status_rank, severity_rank, sort_time, kind, raw_id desc) from payloads where not focus_only), '[]'::jsonb),
    'total', (select count(*) from filtered), 'page', p_page, 'pageSize', p_page_size,
    'hasMore', not p_export and (select count(*) from remaining) > (case when p_before_time is not null then p_page_size else p_page::bigint * p_page_size end),
    'cursor', (select jsonb_build_object('created_at', created_at, 'kind', kind, 'id', raw_id) ||
      case when p_view='records' then jsonb_build_object('priority',jsonb_build_object('version',1,
        'status_rank',status_rank,'severity_rank',severity_rank,'sort_time',sort_time::text)) else '{}'::jsonb end
      from selected order by status_rank desc, severity_rank desc, sort_time desc, kind desc, raw_id limit 1),
    'focusedItem', (select item from payloads where focus_only limit 1),
    'stats', (select jsonb_build_object('reports', count(*) filter (where kind = 'Incident'),
      'announcements', count(*) filter (where kind = 'Announcement'), 'activities', count(*) filter (where kind = 'Activity'),
      'verified', count(*) filter (where status in ('Report Verified', 'Report Mapped')),
      'rejected', count(*) filter (where status in ('Report Rejected', 'Report Deleted')),
      'ai', count(*) filter (where status = 'AI Analysis Completed')) from filtered)
  ) into result;
  if p_export and (result->>'total')::bigint > 50000 then raise exception 'Export exceeds 50000 records. Select a smaller date range.'; end if;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.audit_admin_analysis_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.kind <> 'status_followup' and new.state in ('succeeded','failed','skipped') and old.state not in ('succeeded','failed','skipped') then
    insert into audit_logs(actor_id,actor_name,action_type,title,details,report_id,new_value)
      values(case when exists(select 1 from profiles where id=nullif(new.payload->>'actorId','')::uuid) then nullif(new.payload->>'actorId','')::uuid else null end,
        coalesce(new.payload->>'actorName','Analysis worker'),
        case new.state when 'succeeded' then 'AI Analysis Completed' when 'failed' then 'AI Analysis Failed' else 'AI Analysis Skipped' end,
        new.kind||' analysis '||new.state,'Background analysis job '||new.id||'. '||coalesce(new.last_error,''),
        case when exists(select 1 from reports where id=new.report_id) then new.report_id else null end,new.state);
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.claim_admin_analysis_job()
 RETURNS SETOF admin_analysis_jobs
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update admin_analysis_jobs set state='failed',last_error='Worker lease expired after three attempts',updated_at=now(),lease_token=null,lease_until=null
    where state='running' and lease_until < now() and attempts>=3;
  return query with candidate as (
    select id from admin_analysis_jobs where attempts<3 and available_at<=now()
      and (state='queued' or (state='running' and lease_until<now()))
    order by case when kind='status_followup' then 0 else 1 end,created_at,id for update skip locked limit 1
  ) update admin_analysis_jobs j set state='running',attempts=j.attempts+1,
    lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
    from candidate c where j.id=c.id returning j.*;
end $function$;

CREATE OR REPLACE FUNCTION public.claim_comment_sentiment_job()
 RETURNS SETOF comment_sentiment_jobs
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  update comment_sentiment_jobs set attempts=attempts+1, lease_token=gen_random_uuid(), lease_until=now()+interval '10 minutes'
  where comment_id=(select comment_id from comment_sentiment_jobs
    where completed_at is null and available_at<=now() and (lease_until is null or lease_until<now())
    order by available_at for update skip locked limit 1)
  returning *;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_sentiment_analysis()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.credibility_access(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.profiles where id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.delete_sentiment_supporting_with_datasets(p_actor uuid, p_model uuid, p_generation bigint, p_datasets jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare preview jsonb; item jsonb; linked jsonb; archived jsonb := '[]'::jsonb;
begin
  -- Same transaction lock as model activation, dataset mutation and training.
  perform pg_advisory_xact_lock(72846102);
  preview := public.sentiment_supporting_delete_preview(p_actor,p_model);
  perform 1 from public.sentiment_model_state where id=1 for update;
  if p_generation is distinct from (preview->>'generation')::bigint then
    raise exception 'Model pool changed. Refresh first.' using errcode='40001';
  end if;
  if jsonb_typeof(p_datasets) is distinct from 'array' then
    raise exception 'Provide the selected datasets' using errcode='22023';
  end if;
  if jsonb_array_length(p_datasets)>1000 or
    (select count(distinct value->>'id') from jsonb_array_elements(p_datasets))<>jsonb_array_length(p_datasets) then
    raise exception 'Invalid or duplicate dataset selection' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_datasets) loop
    select value into linked from jsonb_array_elements(preview->'datasets') where value->>'id'=item->>'id';
    if linked is null or linked->>'status'='archived' or (linked->>'shared')::boolean or not (linked->>'unchanged')::boolean then
      raise exception 'A selected dataset is shared, changed, archived or not linked. Refresh first.' using errcode='22023';
    end if;
    if item->>'version' is null or item->>'version' is distinct from linked->>'version' then
      raise exception 'Dataset changed. Refresh first.' using errcode='40001';
    end if;
  end loop;
  -- Same deletion guards as the original pool RPC, except disabled models no
  -- longer need an intermediate archive step. Never disable/delete an enabled model.
  if exists(select 1 from public.sentiment_training_jobs j where j.status in ('training','evaluating') and j.lease_until>now()
     and (j.base_job_id=p_model or j.snapshot->'supporting_models' @> jsonb_build_array(jsonb_build_object('id',p_model)))) then
    raise exception 'A live training/evaluation still references this model. Wait for it to finish.' using errcode='22023';
  end if;
  -- Logical removal retains private artifacts and history for in-flight inference.
  update public.sentiment_supporting_models set status='deleted',deleted_at=now(),updated_at=now() where id=p_model;
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,actor_id,action,details)
    values(p_model,p_actor,'support_delete',jsonb_build_object('archive_datasets',p_datasets));
  for item in select value from jsonb_array_elements(p_datasets) loop
    perform public.manage_sentiment_dataset(p_actor,'archive',jsonb_build_object(
      'dataset_id',item->>'id','version',(item->>'version')::integer,
      'note','Archived when deleting supporting model '||p_model::text));
    archived := archived || jsonb_build_array(item->>'id');
  end loop;
  return jsonb_build_object('id',p_model,'archivedDatasetIds',archived);
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_credibility_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.enqueue_admin_analysis(p_actor uuid, p_reports uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare batch uuid;
begin
  if cardinality(p_reports) is null or cardinality(p_reports) < 1 or cardinality(p_reports) > 50 then raise exception 'Select between 1 and 50 reports'; end if;
  if exists(select 1 from unnest(p_reports) x where x is null or not exists(select 1 from reports r where r.id=x)) then raise exception 'Report not found'; end if;
  -- One task per AI call, not a serverless request that must finish a whole thread.
  if (select count(*) from report_comments where report_id=any(p_reports)) > 50000 then raise exception 'Thread too large; select fewer reports'; end if;
  insert into admin_analysis_batches(actor_id,report_ids) values(p_actor,p_reports) returning id into batch;
  with tasks as (
    select distinct k.kind,r.id subject_id,r.id report_id from reports r
      cross join (values ('credibility'),('report_sentiment')) k(kind) where r.id=any(p_reports)
    union select 'comment_sentiment',c.id,c.report_id from report_comments c where c.report_id=any(p_reports)
  ), queued as (
    insert into admin_analysis_jobs(kind,subject_id,report_id,payload)
    select kind,subject_id,report_id,jsonb_build_object('actorId',p_actor) from tasks order by kind,subject_id
    on conflict (kind,subject_id) where state in ('queued','running') and kind <> 'status_followup'
      do update set subject_id=excluded.subject_id
    returning id
  ) insert into admin_analysis_batch_jobs(batch_id,job_id) select batch,id from queued;
  return batch;
end $function$;

CREATE OR REPLACE FUNCTION public.enqueue_comment_sentiment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into comment_sentiment_jobs(comment_id) values(new.id) on conflict do nothing;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.enqueue_sentiment_training(p_mode text DEFAULT 'continue'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result uuid;
begin
  if p_mode is distinct from 'continue' and p_mode is distinct from 'fresh' then
    raise exception 'Training mode must be "continue" or "fresh"' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(72846102);
  select id into result from public.sentiment_training_jobs where status = 'queued' for update;
  if result is null then
    insert into public.sentiment_training_jobs (training_mode) values (p_mode) returning id into result;
    insert into public.sentiment_training_events(job_id, action) values (result, 'queued');
  else
    -- Coalesce approvals during a short debounce window. The snapshot is taken
    -- when a worker claims the job, not while an approval request is running.
    if p_mode = 'fresh' then
      update public.sentiment_training_jobs set training_mode = 'fresh' where id = result and training_mode is distinct from 'fresh';
    end if;
    update public.sentiment_training_jobs set available_at = least(created_at + interval '2 minutes', now() + interval '30 seconds') where id = result;
  end if;
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.feed_page(p_owner uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT NULL::text, p_source text DEFAULT 'All'::text, p_before_time timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_before_source text DEFAULT 'User'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with eligible as (
    select r.id, r.created_at, 'User'::text as source
    from reports r where r.status <> 'Archived'
      and (p_owner is null or r.user_id = p_owner)
      and (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at <= p_to)
      and (p_status is null or r.status = p_status) and p_source in ('All', 'User')
    union all
    select a.id, a.created_at, 'Admin'::text from admin_announcement a
    where p_owner is null and p_status is null and p_source in ('All', 'Admin')
      and (p_from is null or a.created_at >= p_from) and (p_to is null or a.created_at <= p_to)
  ), page as (
    select * from eligible where p_before_time is null
      or (created_at, id, source) < (p_before_time, p_before_id, p_before_source)
    order by created_at desc, id desc, source desc limit 11
  ), status_totals as (
    select status, count(*) as n from reports
    where p_owner is not null and user_id = p_owner and status <> 'Archived' group by status
  ) select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, id desc, source desc) from page), '[]'::jsonb),
    'total', (select count(*) from eligible),
    'statusCounts', coalesce((select jsonb_object_agg(status, n) from status_totals), '{}'::jsonb)
      || jsonb_build_object('All Status', coalesce((select sum(n) from status_totals), 0))
  );
$function$;

CREATE OR REPLACE FUNCTION public.feed_safety_reports(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'latitude',r.latitude,'longitude',r.longitude,
    'status',r.status,'verified',r.is_verified,'created_at',r.created_at,
    'incident_type',t.name,'severity',coalesce(a.severity,'Unknown'))), '[]'::jsonb)
  from reports r left join incident_types t on t.id=r.incident_type_id
    left join report_credibility_analysis a on a.report_id=r.id
  where r.created_at between p_from and p_to and r.status in ('Pending Review','Under Verification','Verified')
    and r.latitude is not null and r.longitude is not null;
$function$;

CREATE OR REPLACE FUNCTION public.get_sentiment_training_progress(p_jobs uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_jobs is null or cardinality(p_jobs) > 10 then
    raise exception 'At most ten training jobs may be read' using errcode='22023';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'progress',
    case when progress_lease_token = lease_token then progress else null end))
    from public.sentiment_training_jobs where id=any(p_jobs)), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.handle_new_credibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.user_credibility (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_dataset(p_actor uuid, p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_supporting_model(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles%rowtype; model public.sentiment_supporting_models%rowtype;
  state public.sentiment_model_state%rowtype; cap integer; enabled integer; filename text;
begin
  if p_action <> 'enable' then return public.manage_sentiment_supporting_model_independent_legacy(p_actor,p_action,p_model,p_generation,p_payload); end if;
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(72846102);
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.generation is distinct from p_generation then raise exception 'Model pool changed. Refresh first.' using errcode='40001'; end if;
  select * into model from public.sentiment_supporting_models where id=p_model for update;
  if model.id is null or model.status <> 'disabled' then raise exception 'Only a disabled model can be enabled' using errcode='22023'; end if;
  select max_enabled into cap from public.sentiment_supporting_settings where id=1;
  select count(*) into enabled from public.sentiment_supporting_models where status='enabled';
  if enabled>=cap then raise exception 'Enabled model limit reached. Disable another model first.' using errcode='22023'; end if;
  if (model.metrics->>'passed') is distinct from 'true' or not public.valid_sentiment_independent_policy(model.routing_policy) then
    raise exception 'Independent quality evaluation required. Retrain legacy candidates first.' using errcode='22023'; end if;
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
    if model.routing_policy->'builtin_hashes'->>filename is distinct from p_payload->'builtin_hashes'->>filename then
      raise exception 'Built-in fingerprint changed; re-evaluate routing compatibility.' using errcode='22023'; end if;
  end loop;
  update public.sentiment_supporting_models set status='enabled',updated_at=now() where id=p_model;
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,actor_id,action,details) values(p_model,p_actor,'support_enable',jsonb_build_object('admission','independent-v1'));
  return jsonb_build_object('id',p_model);
end $function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_supporting_model_independent_legacy(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles%rowtype; state public.sentiment_model_state%rowtype;
  model public.sentiment_supporting_models%rowtype; cap integer; enabled integer; language text; rule jsonb; filename text;
begin
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(72846102);
  select * into state from public.sentiment_model_state where id=1 for update;
  if p_generation is distinct from state.generation then raise exception 'Model pool changed. Refresh first.' using errcode='40001'; end if;
  select count(*) into enabled from public.sentiment_supporting_models where status='enabled';
  select max_enabled into cap from public.sentiment_supporting_settings where id=1;
  if p_action='set_limit' then
    cap := (p_payload->>'limit')::integer;
    if cap is null or cap not between 1 and 3 or enabled>cap then raise exception 'Limit must be 1–3 and cannot be below the enabled count' using errcode='22023'; end if;
    update public.sentiment_supporting_settings set max_enabled=cap where id=1;
  else
    select * into model from public.sentiment_supporting_models where id=p_model for update;
    if model.id is null or model.status='deleted' then raise exception 'Supporting model not found' using errcode='22023'; end if;
    if p_action='enable' then
      if model.status <> 'disabled' then raise exception 'Only a disabled model can be enabled' using errcode='22023'; end if;
      if enabled>=cap then raise exception 'Enabled model limit reached. Disable another model first.' using errcode='22023'; end if;
      if (model.metrics->>'passed') is distinct from 'true' or not public.valid_sentiment_pool_policy(model.routing_policy) then raise exception 'A passing model and verified fallback policy are required' using errcode='22023'; end if;
      foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
        if model.routing_policy->'builtin_hashes'->>filename is distinct from p_payload->'builtin_hashes'->>filename then
          raise exception 'Built-in model differs from the evaluated policy. Re-evaluate first.' using errcode='22023';
        end if;
      end loop;
      -- Full-pool validation must include exactly the currently enabled IDs.
      if coalesce((select jsonb_agg(id::text order by id::text) from public.sentiment_supporting_models where status='enabled'),'[]'::jsonb)
        is distinct from coalesce(model.routing_policy->'evaluated_pool_ids','[]'::jsonb) then
        raise exception 'Enabled pool differs from this model’s evaluated combination. Queue fresh evaluation.' using errcode='22023';
      end if;
      update public.sentiment_supporting_models set status='enabled',updated_at=now() where id=p_model;
    elsif p_action='disable' then
      if model.status <> 'enabled' then raise exception 'Only an enabled model can be disabled' using errcode='22023'; end if;
      update public.sentiment_supporting_models set status='disabled',updated_at=now() where id=p_model;
      -- Remove dependent combinations too; removing a disagreeing participant
      -- must not silently turn an unvalidated remaining vote into a result.
      loop
        update public.sentiment_supporting_models m set status='disabled',updated_at=now()
        where m.status='enabled' and exists(select 1 from jsonb_array_elements_text(m.routing_policy->'evaluated_pool_ids') dependency
          where not exists(select 1 from public.sentiment_supporting_models parent where parent.id::text=dependency and parent.status='enabled'));
        exit when not found;
      end loop;
    elsif p_action='archive' then
      if model.status <> 'disabled' then raise exception 'Disable the model before archiving' using errcode='22023'; end if;
      update public.sentiment_supporting_models set status='archived',updated_at=now() where id=p_model;
    elsif p_action='restore' then
      if model.status <> 'archived' then raise exception 'Only an archived model can be restored to disabled' using errcode='22023'; end if;
      update public.sentiment_supporting_models set status='disabled',updated_at=now() where id=p_model;
    elsif p_action='delete' then
      if model.status <> 'archived' then raise exception 'Archive the disabled model before deleting' using errcode='22023'; end if;
      if exists(select 1 from public.sentiment_training_jobs j where j.status in ('training','evaluating') and j.lease_until>now()
         and (j.base_job_id=p_model or j.snapshot->'supporting_models' @> jsonb_build_array(jsonb_build_object('id',p_model)))) then
        raise exception 'A live training/evaluation still references this model. Wait for it to finish.' using errcode='22023';
      end if;
      -- Logical permanent removal. Private artifacts/audit are retained so an
      -- in-flight inference cannot lose files. No blind storage deletion.
      update public.sentiment_supporting_models set status='deleted',deleted_at=now(),updated_at=now() where id=p_model;
    else raise exception 'Unsupported model action' using errcode='22023'; end if;
  end if;
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,actor_id,action,details) values(p_model,p_actor,'support_'||p_action,p_payload-'builtin_hashes');
  return jsonb_build_object('id',p_model);
end $function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_training(p_actor uuid, p_action text, p_job uuid DEFAULT NULL::uuid, p_generation bigint DEFAULT NULL::bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles%rowtype; eligible uuid[]; selected uuid[];
  retry public.sentiment_training_jobs%rowtype; versions jsonb;
  request jsonb := p_payload; result jsonb;
begin
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then
    raise exception 'Super admin access required' using errcode='42501'; end if;
  if p_action <> 'queue' then raise exception 'Built-in models are permanent.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(72846102);
  if exists(select 1 from public.sentiment_training_jobs where status='queued' or
    (status in ('training','evaluating') and lease_until>now())) then
    raise exception 'A training run is already queued or running.' using errcode='40001'; end if;

  if p_payload ? 'retry_job_id' then
    select * into retry from public.sentiment_training_jobs where id=(p_payload->>'retry_job_id')::uuid;
    if retry.id is null or not (retry.status='failed' or
      (retry.status in ('training','evaluating') and retry.lease_until<=now()))
      or retry.snapshot is null or retry.data_revision is distinct from (select data_revision from public.sentiment_model_state where id=1)
      or retry.id is distinct from (select id from public.sentiment_training_jobs order by created_at desc,id desc limit 1) then
      raise exception 'This run cannot be retried. Refresh and queue newly approved data instead.' using errcode='22023'; end if;
    if retry.selected_dataset_versions is null then
      raise exception 'This older run has no exact dataset selection. Select the intended datasets and queue a new run.' using errcode='22023'; end if;
    select array_agg((d->>'id')::uuid order by d->>'id') into selected
      from jsonb_array_elements(retry.selected_dataset_versions) d
      where exists(select 1 from public.sentiment_datasets current where current.id=(d->>'id')::uuid
        and current.status='approved' and current.version=(d->>'version')::integer);
    if selected is null or cardinality(selected) <> jsonb_array_length(retry.selected_dataset_versions) then
      raise exception 'Retry requires the original approved dataset versions.' using errcode='22023'; end if;
    versions := retry.selected_dataset_versions;
    request := jsonb_build_object('mode',retry.training_mode,'dataset_ids',to_jsonb(selected));
  else
    select array_agg(distinct d.id order by d.id) into eligible from public.sentiment_datasets d
      join public.sentiment_training_samples s on s.dataset_id=d.id and s.active
      where d.status='approved' and public.sentiment_dataset_ready_to_queue(d.id,d.version);
    if eligible is null then
      raise exception 'No approved, untrained datasets are ready to queue.' using errcode='22023'; end if;
    if p_payload ? 'dataset_ids' then
      if jsonb_typeof(p_payload->'dataset_ids') is distinct from 'array' then
        raise exception 'Select approved datasets ready to train.' using errcode='22023'; end if;
      if jsonb_array_length(p_payload->'dataset_ids')=0 then
        raise exception 'Select approved datasets ready to train.' using errcode='22023'; end if;
      select array_agg(distinct value::uuid order by value::uuid) into selected
        from jsonb_array_elements_text(p_payload->'dataset_ids');
      if selected is null or array_position(selected,null) is not null or not selected <@ eligible then
        raise exception 'Selected datasets are not approved and ready to train.' using errcode='22023'; end if;
    else
      selected := eligible;
    end if;
    select jsonb_agg(jsonb_build_object('id',d.id,'version',d.version) order by d.id)
      into versions from public.sentiment_datasets d where d.id=any(selected);
    -- Always pass the resolved selection, including the default "all ready" case.
    request := p_payload || jsonb_build_object('dataset_ids',to_jsonb(selected));
  end if;
  result := public.manage_sentiment_training_eligibility_legacy(p_actor,p_action,p_job,p_generation,request);
  update public.sentiment_training_jobs set selected_dataset_versions=versions
    where id=(result->>'job_id')::uuid;
  if p_payload ? 'retry_job_id' then
    update public.sentiment_training_jobs set training_languages=retry.training_languages where id=(result->>'job_id')::uuid;
    result := result || jsonb_build_object('requested_languages',retry.training_languages);
  end if;
  insert into public.sentiment_training_events(job_id,actor_id,action,details)
    values((result->>'job_id')::uuid,p_actor,'dataset_selection',jsonb_build_object('datasets',versions));
  return result || jsonb_build_object('selected_datasets',versions);
end $function$;

CREATE OR REPLACE FUNCTION public.manage_sentiment_training_eligibility_legacy(p_actor uuid, p_action text, p_job uuid DEFAULT NULL::uuid, p_generation bigint DEFAULT NULL::bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles%rowtype; target uuid; selected text[]; ids uuid[];
begin
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then raise exception 'Super admin access required' using errcode='42501'; end if;
  if p_action <> 'queue' then raise exception 'Built-in models are permanent.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(72846102);
  if p_payload ? 'dataset_ids' then
    if jsonb_typeof(p_payload->'dataset_ids') <> 'array' or jsonb_array_length(p_payload->'dataset_ids')=0 then raise exception 'Select approved datasets.' using errcode='22023'; end if;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_payload->'dataset_ids');
    if exists(select 1 from unnest(ids) i where not exists(select 1 from public.sentiment_datasets d where d.id=i and d.status='approved')) then raise exception 'Only approved datasets can be selected.' using errcode='22023'; end if;
  else
    -- Scope new work from newly approved dataset versions, not baseline languages
    -- or older attempted uploads. Retry with no new approvals keeps the last scope.
    select array_agg(d.id) into ids from public.sentiment_datasets d where d.status='approved' and not exists(
      select 1 from public.sentiment_training_jobs j where j.status in ('ready','failed') and j.finished_at is not null
      and j.snapshot->'datasets' @> jsonb_build_array(jsonb_build_object('id',d.id,'version',d.version)));
    if ids is null then
      select training_languages into selected from public.sentiment_training_jobs
      where training_languages is not null order by created_at desc limit 1;
    end if;
  end if;
  select array_agg(distinct s.language order by s.language) into selected from public.sentiment_training_samples s
    join public.sentiment_datasets d on d.id=s.dataset_id where s.active and d.status='approved' and (ids is null or d.id=any(ids))
    and (selected is null or s.language=any(selected));
  if selected is null then raise exception 'Approve at least one training example before queueing.' using errcode='22023'; end if;
  target := public.enqueue_sentiment_training(coalesce(p_payload->>'mode','continue'));
  update public.sentiment_training_jobs set training_languages=selected where id=target;
  return jsonb_build_object('job_id',target,'requested_languages',selected);
end $function$;

CREATE OR REPLACE FUNCTION public.protect_report_review_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.queue_approved_sentiment_training()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform pg_advisory_xact_lock(72846102);
  update public.sentiment_model_state set data_revision=data_revision+1 where id=1;
  insert into public.sentiment_dataset_events(dataset_id,actor_id,actor_name,action,details)
    values(new.id,new.reviewed_by,'Reviewed training pool','training_pool_updated',jsonb_build_object('reason',new.status,'automatic_training',false));
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.record_sentiment_support_usage(p_ids uuid[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.sentiment_supporting_models set use_count=use_count+1,last_used_at=now()
  where id=any(p_ids) and status <> 'deleted';
$function$;

CREATE OR REPLACE FUNCTION public.refresh_credibility_suspension(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.report_engagement_counts(p_ids uuid[], p_viewer uuid)
 RETURNS TABLE(id uuid, comments bigint, likes bigint, is_liked boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select r.id, (select count(*) from report_comments c where c.report_id=r.id),
    (select count(*) from report_likes l where l.report_id=r.id),
    exists(select 1 from report_likes l where l.report_id=r.id and l.user_id=p_viewer)
  from reports r where r.id=any(p_ids);
$function$;

CREATE OR REPLACE FUNCTION public.report_sentiment_training_progress(p_job uuid, p_lease uuid, p_sequence bigint, p_completed numeric, p_total integer, p_stage text, p_language text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare job public.sentiment_training_jobs%rowtype; result jsonb;
begin
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status not in ('training','evaluating') or p_lease is null
    or job.lease_token is distinct from p_lease or job.lease_until is null or job.lease_until <= now() then
    raise exception 'Training lease is stale or invalid' using errcode='40001';
  end if;
  if p_sequence is null or p_sequence < 1 or p_total is null or p_total not between 1 and 100
    or p_completed is null or p_completed::text in ('NaN','Infinity','-Infinity')
    or p_completed < 0 or p_completed >= p_total
    or p_stage is null or p_stage not in ('preparing','fitting','checking','uploading','registering')
    or (p_language is not null and p_language not in ('english','filipino','cebuano')) then
    raise exception 'Invalid training progress' using errcode='22023';
  end if;
  if job.progress_lease_token = p_lease and job.progress is not null and
    (p_sequence <= (job.progress->>'sequence')::bigint or p_total <> (job.progress->>'total')::integer
      or p_completed < (job.progress->>'completed')::numeric) then
    raise exception 'Training progress cannot move backwards' using errcode='22023';
  end if;
  result := jsonb_build_object('version',1,'sequence',p_sequence,'completed',p_completed,
    'total',p_total,'stage',p_stage,'language',p_language,'updatedAt',now());
  update public.sentiment_training_jobs set progress=result, progress_lease_token=p_lease where id=p_job;
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.restore_sentiment_dataset(p_actor uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor public.profiles%rowtype;
  batch public.sentiment_datasets%rowtype;
  note text := coalesce(p_payload->>'note', '');
begin
  select * into actor from public.profiles where id = p_actor;
  if actor.id is null or actor.role <> 'super_admin' or actor.status = 'Disabled' then
    raise exception 'Only super admins can restore datasets' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(72846102);
  select * into batch from public.sentiment_datasets where id = (p_payload->>'dataset_id')::uuid for update;
  if batch.id is null then raise exception 'Dataset not found' using errcode = 'P0002'; end if;
  if (p_payload->>'version') is null or batch.version <> (p_payload->>'version')::integer then
    raise exception 'Dataset changed. Refresh and try again.' using errcode = '40001';
  end if;
  if batch.status <> 'archived' then raise exception 'Only archived datasets can be restored' using errcode = '22023'; end if;
  if char_length(note) > 1000 then raise exception 'Review note is too long' using errcode = '22023'; end if;
  update public.sentiment_training_samples set active = false where dataset_id = batch.id;
  update public.sentiment_datasets set status = 'pending', reviewed_by = null, review_note = '',
    version = version + 1, updated_at = now() where id = batch.id;
  insert into public.sentiment_dataset_events(dataset_id, actor_id, actor_name, action, details)
    values (batch.id, p_actor, coalesce(actor.fullname, actor.user_name, 'Admin'), 'restored',
      jsonb_build_object('from', 'archived', 'to', 'pending', 'note', note,
        'previous_reviewed_by', batch.reviewed_by, 'previous_review_note', batch.review_note,
        'previous_version', batch.version));
  return jsonb_build_object('id', batch.id, 'status', 'pending', 'version', batch.version + 1);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_admin_report_status(p_report uuid, p_actor uuid, p_actor_name text, p_status text, p_verified boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.score_reviewed_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.sentiment_dataset_ready_to_queue(p_dataset uuid, p_version integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not exists (
    select 1 from public.sentiment_training_jobs j
    where (j.status in ('queued','ready')
      or (j.status in ('training','evaluating') and j.lease_until>now())
      or (j.status='failed' and jsonb_typeof(j.metrics->'training')='object'))
    and j.selected_dataset_versions @>
      jsonb_build_array(jsonb_build_object('id',p_dataset,'version',p_version))
  );
$function$;

CREATE OR REPLACE FUNCTION public.sentiment_supporting_delete_preview(p_actor uuid, p_model uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles%rowtype; model public.sentiment_supporting_models%rowtype; items jsonb;
begin
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or actor.role is distinct from 'super_admin' or actor.status is distinct from 'Active' then
    raise exception 'Super admin access required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(72846102);
  select * into model from public.sentiment_supporting_models where id=p_model for update;
  if model.id is null or model.status not in ('disabled','archived') then
    raise exception 'Disable the model before deleting it from the pool' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'status',d.status,'version',d.version,
    'shared',exists(select 1 from public.sentiment_supporting_models other
      where other.id<>p_model and other.status<>'deleted'
        and other.datasets @> jsonb_build_array(jsonb_build_object('id',d.id))),
    'unchanged',model.datasets @> jsonb_build_array(jsonb_build_object('id',d.id,'version',d.version)))
    order by d.created_at,d.id),'[]'::jsonb) into items
  from public.sentiment_datasets d
  where model.datasets @> jsonb_build_array(jsonb_build_object('id',d.id));
  return jsonb_build_object('modelId',p_model,'generation',(select generation from public.sentiment_model_state where id=1),'datasets',items);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_capabilities()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('continued_training',true,'automatic_activation',false,'supporting_pool',true,'fresh_candidates',true,
    'independent_admission',true,'manual_training',true,'manual_enable',true,'language_scoped_training',true);
$function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_pool_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with approved as (
    select s.*,d.version from public.sentiment_training_samples s
    join public.sentiment_datasets d on d.id=s.dataset_id where d.status='approved' and s.active
  ), pending as (
    select a.* from approved a where public.sentiment_dataset_ready_to_queue(a.dataset_id,a.version)
  ), distribution as (
    select language,jsonb_build_object('total',count(*),'negative',count(*) filter(where label='negative'),
      'neutral',count(*) filter(where label='neutral'),'positive',count(*) filter(where label='positive')) counts
    from pending group by language
  ), recent as (
    select d.id,d.name,d.version,d.updated_at approved_at,count(*) example_count,
      coalesce(p.fullname,p.user_name,'Super admin') approved_by
    from pending a join public.sentiment_datasets d on d.id=a.dataset_id
    left join public.profiles p on p.id=d.reviewed_by
    group by d.id,d.name,d.version,d.updated_at,p.fullname,p.user_name
    order by d.updated_at desc,d.id limit 10
  )
  select jsonb_build_object('queueSummaryVersion',1,'datasetSelectionVersion',1,
    'approvedExamples',(select count(*) from approved),
    'approvedDatasets',(select count(*) from public.sentiment_datasets where status='approved'),
    'pendingDatasets',(select count(*) from public.sentiment_datasets where status='pending'),
    'newExamples',(select count(*) from pending),
    'readyToQueueExamples',(select count(*) from pending),
    'readyToQueueDatasets',(select count(distinct dataset_id) from pending),
    'languages',coalesce((select jsonb_object_agg(language,counts) from distribution),'{}'::jsonb),
    'readyDatasets',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'version',version,
      'exampleCount',example_count,'approvedAt',approved_at,'approvedBy',approved_by)
      order by approved_at desc,id) from recent),'[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare job public.sentiment_training_jobs%rowtype; state public.sentiment_model_state%rowtype;
  result jsonb; policy jsonb; manifest jsonb; filename text; file jsonb; language text; qualified text[]; required text[];
begin
  -- protocol: supporting-pool-v1; protocol: supporting-pool-v2; admission: independent-v1; language-scope-v1
  if p_action='capabilities' then return public.sentiment_training_capabilities(); end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action='claim' then
    if p_payload->>'language_scope_protocol' is distinct from '1' then raise exception 'Updated language-scoped worker required. Restart the worker.' using errcode='22023'; end if;
    result := public.sentiment_training_worker_scope_legacy(p_action,p_job,p_lease,p_payload);
    if result is null then return null; end if;
    select * into job from public.sentiment_training_jobs where id=(result->>'id')::uuid;
    if job.training_languages is null then
      select array_agg(distinct s->>'language' order by s->>'language') into job.training_languages from jsonb_array_elements(job.snapshot->'samples') s;
    end if;
    if job.training_languages is null or cardinality(job.training_languages) not between 1 and 3 or exists(
      select 1 from unnest(job.training_languages) l where l not in ('cebuano','english','filipino') or
      not exists(select 1 from jsonb_array_elements(job.snapshot->'samples') s where s->>'language'=l)) then
      raise exception 'Training scope no longer has approved examples; queue a new run.' using errcode='22023'; end if;
    update public.sentiment_training_jobs set training_languages=job.training_languages,
      snapshot=snapshot || jsonb_build_object('scope_version',1,'requested_languages',job.training_languages)
      where id=job.id returning * into job;
    return to_jsonb(job);
  end if;
  if p_action <> 'complete' then return public.sentiment_training_worker_scope_legacy(p_action,p_job,p_lease,p_payload); end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status <> 'evaluating' or job.lease_token is distinct from p_lease or job.lease_until is null or job.lease_until<now() then raise exception 'Training lease is stale or invalid' using errcode='40001'; end if;
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.active_job_id is not null or job.data_revision is distinct from state.data_revision then raise exception 'Approved data changed during evaluation' using errcode='40001'; end if;
  policy := p_payload->'metrics'->'routing_policy'; manifest := p_payload->'manifest';
  if job.snapshot->'scope_version' is distinct from '1'::jsonb or policy->'scope_version' is distinct from '1'::jsonb
    or policy->'requested_languages' is distinct from job.snapshot->'requested_languages'
    or p_payload->'metrics'->'requested_languages' is distinct from job.snapshot->'requested_languages'
    or (p_payload->'metrics'->>'admission') is distinct from 'independent-v1'
    or (p_payload->'metrics'->>'passed') is distinct from 'true' or (p_payload->'metrics'->>'pool_protocol') is distinct from '1'
    or p_payload->'metrics'->>'training_mode' is distinct from job.training_mode
    or not public.valid_sentiment_independent_policy(policy) or policy->'builtin_hashes' is distinct from job.snapshot->'builtin_hashes' then
    raise exception 'Valid language-scoped held-out quality evidence required' using errcode='22023'; end if;
  select array_agg(key order by key) into qualified from jsonb_object_keys(policy->'languages') key;
  if manifest->'languages' is distinct from to_jsonb(qualified) or p_payload->'metrics'->'qualified_languages' is distinct from to_jsonb(qualified) then raise exception 'Qualified languages and artifacts differ' using errcode='22023'; end if;
  required := array['language_id.onnx'];
  foreach language in array qualified loop required := required || array['sentiment_'||language||'.onnx','sentiment_'||language||'.joblib']; end loop;
  foreach filename in array required loop
    file := case when filename like '%.joblib' then manifest->'training_files'->filename else manifest->'files'->filename end;
    if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
      or file->>'path' is distinct from job.id::text||'/'||job.lease_token::text||'/'||filename then raise exception 'Complete qualified-language artifacts required' using errcode='22023'; end if;
  end loop;
  if (select count(*) from jsonb_object_keys(manifest->'files')) <> cardinality(qualified)+1 or
     (select count(*) from jsonb_object_keys(manifest->'training_files')) <> cardinality(qualified) then raise exception 'Unexpected unqualified artifacts' using errcode='22023'; end if;
  update public.sentiment_training_jobs set status='ready',metrics=p_payload->'metrics',artifact_manifest=manifest,finished_at=now(),lease_until=null where id=job.id;
  insert into public.sentiment_supporting_models(id,name,status,artifact_manifest,routing_policy,metrics,datasets)
    values(job.id,'Supporting model '||left(job.id::text,8),'disabled',manifest,policy,p_payload->'metrics',coalesce(job.snapshot->'datasets','[]'::jsonb));
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,action,details) values(job.id,'support_registered',jsonb_build_object('qualified_languages',qualified,'enabled',false,'manual_review_required',true));
  return jsonb_build_object('id',job.id,'qualified_languages',qualified,'support_enabled',false,'built_in_unchanged',true);
end $function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker_independent_legacy(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare job public.sentiment_training_jobs%rowtype; state public.sentiment_model_state%rowtype;
  result jsonb; manifest jsonb; policy jsonb; filename text; file jsonb; cap integer; enabled integer; auto_enable boolean;
begin
  -- protocol: supporting-pool-v1
  -- protocol: supporting-pool-v2
  if p_action='capabilities' then return public.sentiment_training_capabilities(); end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action='claim' then
    if (p_payload->>'pool_protocol') is distinct from '1' then raise exception 'Updated supporting-pool worker required' using errcode='22023'; end if;
    if (p_payload->>'worker_protocol') is distinct from 'supporting-pool-v2' then raise exception 'Updated fresh-candidate worker required. Restart the worker after applying sentiment_fresh_candidates.sql.' using errcode='22023'; end if;
    foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
      if coalesce(p_payload->'builtin_hashes'->>filename,'') !~ '^[a-f0-9]{64}$' then raise exception 'Built-in hashes required' using errcode='22023'; end if;
    end loop;
    if exists(select 1 from public.sentiment_model_state where active_job_id is not null) then raise exception 'Legacy primary pointer must be cleared by the pool migration' using errcode='22023'; end if;
    result := public.sentiment_training_worker_pool_legacy(p_action,p_job,p_lease,p_payload);
    if result is null then return null; end if;
    update public.sentiment_training_jobs set base_job_id=null,
      snapshot=snapshot || jsonb_build_object('pool_protocol',1,'builtin_hashes',p_payload->'builtin_hashes',
        'supporting_models',coalesce((select jsonb_agg(jsonb_build_object('id',id,'artifact_manifest',artifact_manifest,'routing_policy',routing_policy) order by id)
          from public.sentiment_supporting_models where status='enabled'),'[]'::jsonb))
      where id=(result->>'id')::uuid returning * into job;
    return to_jsonb(job);
  end if;
  if p_action <> 'complete' then return public.sentiment_training_worker_pool_legacy(p_action,p_job,p_lease,p_payload); end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status <> 'evaluating' or job.lease_token is distinct from p_lease or job.lease_until is null or job.lease_until<now() then
    raise exception 'Training lease is stale or invalid' using errcode='40001';
  end if;
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.active_job_id is not null or job.base_generation is distinct from state.generation or job.data_revision is distinct from state.data_revision then
    raise exception 'Pool or approved data changed during evaluation' using errcode='40001';
  end if;
  if (p_payload->'metrics'->>'passed') is distinct from 'true' or
     (p_payload->'metrics'->>'pool_protocol') is distinct from '1' or
     (job.snapshot->>'pool_protocol') is distinct from '1' then
    raise exception 'A passing supporting-pool evaluation is required' using errcode='22023';
  end if;
  -- Fresh jobs must carry fresh-training evidence from an updated worker;
  -- continue jobs may omit it (outdated workers default to continued training).
  if coalesce(job.training_mode,'continue') = 'fresh' then
    if (p_payload->'metrics'->>'training_mode') is distinct from 'fresh' then
      raise exception 'Fresh training evidence required. Restart the worker and queue this job again.' using errcode='22023';
    end if;
  elsif (p_payload->'metrics'->>'training_mode') is not null and (p_payload->'metrics'->>'training_mode') is distinct from coalesce(job.training_mode,'continue') then
    raise exception 'Training mode mismatch between job and worker' using errcode='22023';
  end if;
  manifest := p_payload->'manifest';
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx','sentiment_english.joblib','sentiment_filipino.joblib','sentiment_cebuano.joblib'] loop
    file := case when filename like '%.joblib' then manifest->'training_files'->filename else manifest->'files'->filename end;
    if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
      or (file->>'path') is distinct from (job.id::text||'/'||job.lease_token::text||'/'||filename) then
      raise exception 'Complete checked inference/training artifacts required' using errcode='22023';
    end if;
  end loop;
  policy := coalesce(p_payload->'metrics'->'routing_policy','{}'::jsonb);
  if policy->'builtin_hashes' is distinct from job.snapshot->'builtin_hashes' then raise exception 'Built-in fingerprint differs' using errcode='22023'; end if;
  select max_enabled into cap from public.sentiment_supporting_settings where id=1;
  select count(*) into enabled from public.sentiment_supporting_models where status='enabled';
  auto_enable := public.valid_sentiment_pool_policy(policy) and enabled<cap;
  if auto_enable and coalesce(policy->'evaluated_pool_ids','[]'::jsonb) is distinct from
     coalesce((select jsonb_agg(id::text order by id::text) from public.sentiment_supporting_models where status='enabled'),'[]'::jsonb) then
    raise exception 'Evaluated pool does not match enabled models' using errcode='40001';
  end if;
  update public.sentiment_training_jobs set status='ready',metrics=p_payload->'metrics',artifact_manifest=manifest,finished_at=now(),lease_until=null where id=job.id;
  insert into public.sentiment_supporting_models(id,name,status,artifact_manifest,routing_policy,metrics,datasets)
    values(job.id,'Supporting model '||left(job.id::text,8),case when coalesce(auto_enable,false) then 'enabled' else 'disabled' end,
      manifest,policy,p_payload->'metrics',coalesce(job.snapshot->'datasets','[]'::jsonb));
  update public.sentiment_model_state set generation=generation+1,active_job_id=null,previous_job_id=null,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,action,details) values(job.id,'support_registered',jsonb_build_object('enabled',coalesce(auto_enable,false),'built_in_unchanged',true));
  return jsonb_build_object('id',job.id,'support_enabled',coalesce(auto_enable,false),'built_in_unchanged',true);
end $function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker_pool_legacy(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  job public.sentiment_training_jobs%rowtype;
  state public.sentiment_model_state%rowtype;
  inputs jsonb;
  filename text;
  file jsonb;
begin
  -- protocol: continued-training-v1
  if p_action = 'capabilities' then
    return jsonb_build_object('continued_training', true, 'automatic_activation', true);
  end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action = 'claim' then
    update public.sentiment_training_jobs set status = 'failed', error = 'Worker lease expired. Queue a retry.', finished_at = now()
      where status in ('training','evaluating') and lease_until < now();
    if exists (select 1 from public.sentiment_training_jobs where status in ('training','evaluating')) then return null; end if;
    select * into job from public.sentiment_training_jobs where status = 'queued' and available_at <= now() order by created_at limit 1 for update;
    if job.id is null then return null; end if;
    select * into state from public.sentiment_model_state where id = 1;
    if (select count(*) from (select 1 from public.sentiment_training_samples s join public.sentiment_datasets d on d.id = s.dataset_id where d.status = 'approved' and s.active limit 50001) pool) > 50000 then
      update public.sentiment_training_jobs set status='failed', error='Approved pool exceeds the 50,000-example worker limit.', finished_at=now() where id=job.id;
      return null;
    end if;
    select jsonb_build_object(
      'datasets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'version', version) order by id) from public.sentiment_datasets where status = 'approved'), '[]'::jsonb),
      'samples', coalesce((select jsonb_agg(jsonb_build_object('text', s.text, 'language', s.language, 'label', s.label) order by s.id)
        from public.sentiment_training_samples s join public.sentiment_datasets d on d.id = s.dataset_id where d.status = 'approved' and s.active), '[]'::jsonb)
    ) into inputs;
    update public.sentiment_training_jobs set status='training', started_at=now(), lease_token=gen_random_uuid(), lease_until=now()+interval '5 minutes',
      snapshot=inputs, data_revision=state.data_revision, base_generation=state.generation, base_job_id=state.active_job_id
      where id=job.id returning * into job;
    insert into public.sentiment_training_events(job_id, action) values (job.id, 'training');
    return to_jsonb(job);
  end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status not in ('training','evaluating') or job.lease_token is distinct from p_lease or job.lease_until < now() then
    raise exception 'Training lease is stale or invalid' using errcode='40001';
  end if;
  if p_action = 'heartbeat' then
    update public.sentiment_training_jobs set lease_until=now()+interval '5 minutes' where id=job.id;
  elsif p_action = 'evaluating' then
    update public.sentiment_training_jobs set status='evaluating', lease_until=now()+interval '5 minutes' where id=job.id;
  elsif p_action = 'fail' then
    update public.sentiment_training_jobs set status='failed', error=left(coalesce(p_payload->>'error','Training failed'),1000), metrics=p_payload->'metrics', finished_at=now(), lease_until=null where id=job.id;
  elsif p_action = 'complete' then
    if job.status <> 'evaluating' or (p_payload->'metrics'->>'passed') is distinct from 'true' then
      raise exception 'A passing evaluation is required' using errcode='22023';
    end if;
    if (p_payload->'metrics'->'training'->>'mode') is distinct from 'continued' then
      raise exception 'Updated continued-training worker required. Cold-trained bundles cannot auto-activate.' using errcode='22023';
    end if;
    foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
      file := p_payload->'manifest'->'files'->filename;
      if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
        or (file->>'path') is distinct from (job.id::text || '/' || job.lease_token::text || '/' || filename) then
        raise exception 'Incomplete or invalid model manifest' using errcode='22023';
      end if;
    end loop;
    foreach filename in array array['sentiment_english.joblib','sentiment_filipino.joblib','sentiment_cebuano.joblib'] loop
      file := p_payload->'manifest'->'training_files'->filename;
      if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
        or (file->>'path') is distinct from (job.id::text || '/' || job.lease_token::text || '/' || filename) then
        raise exception 'Complete checksummed training state is required' using errcode='22023';
      end if;
    end loop;
    select * into state from public.sentiment_model_state where id=1 for update;
    if job.base_generation is distinct from state.generation or job.base_job_id is distinct from state.active_job_id
      or job.data_revision is distinct from state.data_revision then
      raise exception 'Training result is stale. New approved data or model state must be trained first.' using errcode='40001';
    end if;
    -- Publish and switch the pointer in ONE transaction. A failure anywhere
    -- leaves both the old pointer and the candidate job unchanged.
    update public.sentiment_training_jobs set status='ready', metrics=p_payload->'metrics', artifact_manifest=p_payload->'manifest',
      finished_at=now(), lease_until=null where id=job.id;
    update public.sentiment_model_state set previous_job_id=state.active_job_id, active_job_id=job.id,
      generation=generation+1, updated_at=now() where id=1;
    insert into public.sentiment_training_events(job_id, action, details)
      values (job.id, 'auto_activate', jsonb_build_object('previous_job_id',state.active_job_id,'previous_generation',state.generation,'mode','continued'));
  else
    raise exception 'Unsupported worker action' using errcode='22023';
  end if;
  if p_action <> 'heartbeat' then insert into public.sentiment_training_events(job_id, action) values (job.id,p_action); end if;
  return jsonb_build_object('id',job.id,'auto_activated',p_action='complete');
end $function$;

CREATE OR REPLACE FUNCTION public.sentiment_training_worker_scope_legacy(p_action text, p_job uuid DEFAULT NULL::uuid, p_lease uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare job public.sentiment_training_jobs%rowtype; state public.sentiment_model_state%rowtype;
  result jsonb; policy jsonb; manifest jsonb; filename text; file jsonb;
begin
  -- protocol: supporting-pool-v1; protocol: supporting-pool-v2; admission: independent-v1
  if p_action='capabilities' then return public.sentiment_training_capabilities(); end if;
  perform pg_advisory_xact_lock(72846102);
  if p_action='claim' then
    if (p_payload->>'admission_protocol') is distinct from 'independent-v1' then
      raise exception 'Updated independent-quality worker required. Restart the worker.' using errcode='22023'; end if;
    result := public.sentiment_training_worker_independent_legacy(p_action,p_job,p_lease,p_payload);
    if result is null then return null; end if;
    update public.sentiment_training_jobs set snapshot=snapshot || jsonb_build_object('admission','independent-v1','supporting_models','[]'::jsonb)
      where id=(result->>'id')::uuid returning * into job;
    return to_jsonb(job);
  end if;
  if p_action <> 'complete' then return public.sentiment_training_worker_independent_legacy(p_action,p_job,p_lease,p_payload); end if;
  select * into job from public.sentiment_training_jobs where id=p_job for update;
  if job.id is null or job.status <> 'evaluating' or job.lease_token is distinct from p_lease or job.lease_until is null or job.lease_until<now() then
    raise exception 'Training lease is stale or invalid' using errcode='40001'; end if;
  select * into state from public.sentiment_model_state where id=1 for update;
  if state.active_job_id is not null or job.data_revision is distinct from state.data_revision then
    raise exception 'Approved data changed during evaluation' using errcode='40001'; end if;
  if (job.snapshot->>'admission') is distinct from 'independent-v1' or (p_payload->'metrics'->>'admission') is distinct from 'independent-v1'
    or (p_payload->'metrics'->>'pool_protocol') is distinct from '1' or (p_payload->'metrics'->>'passed') is distinct from 'true'
    or (p_payload->'metrics'->>'training_mode') is distinct from job.training_mode then
    raise exception 'Independent held-out evaluation and matching training evidence required' using errcode='22023'; end if;
  policy := p_payload->'metrics'->'routing_policy';
  if not public.valid_sentiment_independent_policy(policy) or policy->'builtin_hashes' is distinct from job.snapshot->'builtin_hashes' then
    raise exception 'Independent quality evidence or built-in fingerprint invalid' using errcode='22023'; end if;
  manifest := p_payload->'manifest';
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx','sentiment_english.joblib','sentiment_filipino.joblib','sentiment_cebuano.joblib'] loop
    file := case when filename like '%.joblib' then manifest->'training_files'->filename else manifest->'files'->filename end;
    if file is null or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((file->>'size')::bigint,0) not between 1 and 104857600
      or file->>'path' is distinct from job.id::text||'/'||job.lease_token::text||'/'||filename then
      raise exception 'Complete checked inference/training artifacts required' using errcode='22023'; end if;
  end loop;
  update public.sentiment_training_jobs set status='ready',metrics=p_payload->'metrics',artifact_manifest=manifest,finished_at=now(),lease_until=null where id=job.id;
  insert into public.sentiment_supporting_models(id,name,status,artifact_manifest,routing_policy,metrics,datasets)
    values(job.id,'Supporting model '||left(job.id::text,8),'disabled',manifest,policy,p_payload->'metrics',coalesce(job.snapshot->'datasets','[]'::jsonb));
  update public.sentiment_model_state set generation=generation+1,updated_at=now() where id=1;
  insert into public.sentiment_training_events(job_id,action,details) values(job.id,'support_registered',jsonb_build_object('enabled',false,'manual_review_required',true,'built_in_unchanged',true));
  return jsonb_build_object('id',job.id,'support_enabled',false,'manual_review_required',true,'built_in_unchanged',true);
end $function$;

CREATE OR REPLACE FUNCTION public.set_credibility_level()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.score = 100 then
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
$function$;

CREATE OR REPLACE FUNCTION public.set_fullname()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.fullname = nullif(btrim(concat_ws(' ', nullif(new.first_name, ''), nullif(new.middle_name, ''), nullif(new.last_name, ''))), '');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_sentiment_analysis_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_credibility_suspension()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform refresh_credibility_suspension(new.user_id);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_independent_metrics(m jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare label text; c jsonb;
begin
  if jsonb_typeof(m->'macro_f1') is distinct from 'number' or (m->>'macro_f1')::numeric not between 0.6 and 1 then return false; end if;
  foreach label in array array['negative','neutral','positive'] loop
    c := m->'per_class'->label;
    if jsonb_typeof(c->'support') is distinct from 'number' or (c->>'support')::numeric<10
      or trunc((c->>'support')::numeric)<>(c->>'support')::numeric
      or jsonb_typeof(c->'precision') is distinct from 'number' or (c->>'precision')::numeric not between 0.5 and 1
      or jsonb_typeof(c->'recall') is distinct from 'number' or (c->>'recall')::numeric not between 0.5 and 1 then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_independent_policy(policy jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare language text; expanded jsonb; rule jsonb; evidence jsonb; requested jsonb;
begin
  if not (policy ? 'scope_version') then return public.valid_sentiment_independent_policy_all_languages(policy); end if;
  if policy->'scope_version' is distinct from '1'::jsonb or jsonb_typeof(policy->'languages') is distinct from 'object'
    or jsonb_typeof(policy->'requested_languages') is distinct from 'array' then return false; end if;
  requested := policy->'requested_languages';
  if jsonb_array_length(requested) not between 1 and 3 or
    exists(select 1 from jsonb_array_elements_text(requested) l where l not in ('cebuano','english','filipino')) or
    (select count(distinct l) from jsonb_array_elements_text(requested) l) <> jsonb_array_length(requested) or
    (select count(*) from jsonb_object_keys(policy->'languages')) not between 1 and 3 then return false; end if;
  for language,rule in select * from jsonb_each(policy->'languages') loop
    if language not in ('cebuano','english','filipino') or not requested @> jsonb_build_array(language) then return false; end if;
    evidence := policy->'independent_test'->'languages'->language;
    -- Internally repeat this one language's measurements under the three keys
    -- expected by the original validator. This does not fabricate stored scores.
    expanded := policy || jsonb_build_object('languages',jsonb_build_object('cebuano',rule,'english',rule,'filipino',rule),
      'independent_test',jsonb_build_object('passed',true,'languages',jsonb_build_object('cebuano',evidence,'english',evidence,'filipino',evidence)));
    if not public.valid_sentiment_independent_policy_all_languages(expanded) then return false; end if;
  end loop;
  return coalesce((policy->>'passed')='true' and (policy->'independent_test'->>'passed')='true',false);
exception when invalid_parameter_value or invalid_text_representation then return false;
end $function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_independent_policy_all_languages(policy jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare language text; rule jsonb; check_result jsonb; filename text; field text;
begin
  if (policy->>'version') is distinct from '2' or (policy->>'admission') is distinct from 'independent-v1'
    or (policy->>'passed') is distinct from 'true' or (policy->'independent_test'->>'passed') is distinct from 'true'
    or jsonb_typeof(policy->'languages') is distinct from 'object'
    or policy->'evaluated_pool_ids' is distinct from '[]'::jsonb then return false; end if;
  foreach filename in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
    if coalesce(policy->'builtin_hashes'->>filename,'') !~ '^[a-f0-9]{64}$' then return false; end if;
  end loop;
  if (select count(*) from jsonb_object_keys(policy->'languages')) <> 3 then return false; end if;
  foreach language in array array['cebuano','english','filipino'] loop
    rule := policy->'languages'->language;
    check_result := policy->'independent_test'->'languages'->language;
    if rule is null or (check_result->>'passed') is distinct from 'true'
      or not public.valid_sentiment_independent_metrics(check_result->'metrics')
      or not public.valid_sentiment_independent_metrics(check_result->'validation_metrics') then return false; end if;
    if (rule->'primary_confidence') is distinct from '0.85'::jsonb or (rule->'primary_margin') is distinct from '0.2'::jsonb then return false; end if;
    foreach field in array array['support_confidence','support_margin','validation_precision'] loop
      if jsonb_typeof(rule->field) is distinct from 'number' or (rule->>field)::numeric not between 0 and 1 then return false; end if;
    end loop;
    if (rule->>'support_confidence')::numeric<0.5 or (rule->>'support_margin')::numeric<0.05
      or (rule->>'validation_precision')::numeric<0.75
      or jsonb_typeof(rule->'validation_support') is distinct from 'number' or (rule->>'validation_support')::numeric<20
      or trunc((rule->>'validation_support')::numeric)<>(rule->>'validation_support')::numeric
      or jsonb_typeof(check_result->'precision') is distinct from 'number' or (check_result->>'precision')::numeric not between 0.75 and 1
      or jsonb_typeof(check_result->'support') is distinct from 'number' or (check_result->>'support')::numeric<10
      or trunc((check_result->>'support')::numeric)<>(check_result->>'support')::numeric then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $function$;

CREATE OR REPLACE FUNCTION public.valid_sentiment_pool_policy(policy jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare language text; rule jsonb; key text;
begin
  if policy is null or (policy->>'version') is distinct from '1' or (policy->>'passed') is distinct from 'true'
    or (policy->'cascade_test'->>'passed') is distinct from 'true' or jsonb_typeof(policy->'languages') is distinct from 'object'
    or policy->'languages'='{}'::jsonb or jsonb_typeof(policy->'evaluated_pool_ids') is distinct from 'array' then return false; end if;
  foreach key in array array['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'] loop
    if coalesce(policy->'builtin_hashes'->>key,'') !~ '^[a-f0-9]{64}$' then return false; end if;
  end loop;
  for language,rule in select * from jsonb_each(policy->'languages') loop
    if language not in ('cebuano','english','filipino') then return false; end if;
    foreach key in array array['primary_confidence','primary_margin','support_confidence','support_margin','validation_precision'] loop
      if jsonb_typeof(rule->key) is distinct from 'number' or (rule->>key)::numeric not between 0 and 1 then return false; end if;
    end loop;
    if (rule->>'validation_precision')::numeric < 0.75 or jsonb_typeof(rule->'validation_support') is distinct from 'number'
      or (rule->>'validation_support')::numeric<20 or trunc((rule->>'validation_support')::numeric)<>(rule->>'validation_support')::numeric then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $function$;

revoke all on function public."active_admin_analysis"(p_actor uuid) from public, anon, authenticated, service_role;

revoke all on function public."admin_analysis_progress"(p_batch uuid) from public, anon, authenticated, service_role;

revoke all on function public."admin_browse_page"(p_view text, p_from timestamp with time zone, p_to timestamp with time zone, p_status text, p_kind text, p_actor_role text, p_page integer, p_page_size integer, p_focus_report uuid, p_export boolean, p_before_time timestamp with time zone, p_before_kind text, p_before_id uuid, p_before_sort jsonb) from public, anon, authenticated, service_role;

revoke all on function public."audit_admin_analysis_completion"() from public, anon, authenticated, service_role;

revoke all on function public."claim_admin_analysis_job"() from public, anon, authenticated, service_role;

revoke all on function public."claim_comment_sentiment_job"() from public, anon, authenticated, service_role;

revoke all on function public."cleanup_sentiment_analysis"() from public, anon, authenticated, service_role;

revoke all on function public."credibility_access"(p_user uuid) from public, anon, authenticated, service_role;

revoke all on function public."current_user_role"() from public, anon, authenticated, service_role;

revoke all on function public."delete_sentiment_supporting_with_datasets"(p_actor uuid, p_model uuid, p_generation bigint, p_datasets jsonb) from public, anon, authenticated, service_role;

revoke all on function public."enforce_credibility_write"() from public, anon, authenticated, service_role;

revoke all on function public."enqueue_admin_analysis"(p_actor uuid, p_reports uuid[]) from public, anon, authenticated, service_role;

revoke all on function public."enqueue_comment_sentiment"() from public, anon, authenticated, service_role;

revoke all on function public."enqueue_sentiment_training"(p_mode text) from public, anon, authenticated, service_role;

revoke all on function public."feed_page"(p_owner uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_status text, p_source text, p_before_time timestamp with time zone, p_before_id uuid, p_before_source text) from public, anon, authenticated, service_role;

revoke all on function public."feed_safety_reports"(p_from timestamp with time zone, p_to timestamp with time zone) from public, anon, authenticated, service_role;

revoke all on function public."get_sentiment_training_progress"(p_jobs uuid[]) from public, anon, authenticated, service_role;

revoke all on function public."handle_new_credibility"() from public, anon, authenticated, service_role;

revoke all on function public."handle_new_user"() from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_dataset"(p_actor uuid, p_action text, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_supporting_model"(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_supporting_model_independent_legacy"(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_training"(p_actor uuid, p_action text, p_job uuid, p_generation bigint, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."manage_sentiment_training_eligibility_legacy"(p_actor uuid, p_action text, p_job uuid, p_generation bigint, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."protect_report_review_fields"() from public, anon, authenticated, service_role;

revoke all on function public."queue_approved_sentiment_training"() from public, anon, authenticated, service_role;

revoke all on function public."record_sentiment_support_usage"(p_ids uuid[]) from public, anon, authenticated, service_role;

revoke all on function public."refresh_credibility_suspension"(p_user uuid) from public, anon, authenticated, service_role;

revoke all on function public."report_engagement_counts"(p_ids uuid[], p_viewer uuid) from public, anon, authenticated, service_role;

revoke all on function public."report_sentiment_training_progress"(p_job uuid, p_lease uuid, p_sequence bigint, p_completed numeric, p_total integer, p_stage text, p_language text) from public, anon, authenticated, service_role;

revoke all on function public."restore_sentiment_dataset"(p_actor uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."save_admin_report_status"(p_report uuid, p_actor uuid, p_actor_name text, p_status text, p_verified boolean) from public, anon, authenticated, service_role;

revoke all on function public."score_reviewed_report"() from public, anon, authenticated, service_role;

revoke all on function public."sentiment_dataset_ready_to_queue"(p_dataset uuid, p_version integer) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_supporting_delete_preview"(p_actor uuid, p_model uuid) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_capabilities"() from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_pool_summary"() from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker_independent_legacy"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker_pool_legacy"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."sentiment_training_worker_scope_legacy"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public."set_credibility_level"() from public, anon, authenticated, service_role;

revoke all on function public."set_fullname"() from public, anon, authenticated, service_role;

revoke all on function public."set_sentiment_analysis_updated_at"() from public, anon, authenticated, service_role;

revoke all on function public."set_updated_at"() from public, anon, authenticated, service_role;

revoke all on function public."start_credibility_suspension"() from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_independent_metrics"(m jsonb) from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_independent_policy"(policy jsonb) from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_independent_policy_all_languages"(policy jsonb) from public, anon, authenticated, service_role;

revoke all on function public."valid_sentiment_pool_policy"(policy jsonb) from public, anon, authenticated, service_role;

grant EXECUTE on function public."active_admin_analysis"(p_actor uuid) to "service_role";

grant EXECUTE on function public."admin_analysis_progress"(p_batch uuid) to "service_role";

grant EXECUTE on function public."admin_browse_page"(p_view text, p_from timestamp with time zone, p_to timestamp with time zone, p_status text, p_kind text, p_actor_role text, p_page integer, p_page_size integer, p_focus_report uuid, p_export boolean, p_before_time timestamp with time zone, p_before_kind text, p_before_id uuid, p_before_sort jsonb) to "service_role";

grant EXECUTE on function public."audit_admin_analysis_completion"() to "service_role";

grant EXECUTE on function public."claim_admin_analysis_job"() to "service_role";

grant EXECUTE on function public."claim_comment_sentiment_job"() to "service_role";

grant EXECUTE on function public."cleanup_sentiment_analysis"() to "service_role";

grant EXECUTE on function public."credibility_access"(p_user uuid) to "service_role";

grant EXECUTE on function public."current_user_role"() to public;

grant EXECUTE on function public."delete_sentiment_supporting_with_datasets"(p_actor uuid, p_model uuid, p_generation bigint, p_datasets jsonb) to "service_role";

grant EXECUTE on function public."enqueue_admin_analysis"(p_actor uuid, p_reports uuid[]) to "service_role";

grant EXECUTE on function public."enqueue_sentiment_training"(p_mode text) to "service_role";

grant EXECUTE on function public."feed_page"(p_owner uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_status text, p_source text, p_before_time timestamp with time zone, p_before_id uuid, p_before_source text) to "service_role";

grant EXECUTE on function public."feed_safety_reports"(p_from timestamp with time zone, p_to timestamp with time zone) to "service_role";

grant EXECUTE on function public."get_sentiment_training_progress"(p_jobs uuid[]) to "service_role";

grant EXECUTE on function public."handle_new_credibility"() to public;

grant EXECUTE on function public."handle_new_user"() to public;

grant EXECUTE on function public."manage_sentiment_dataset"(p_actor uuid, p_action text, p_payload jsonb) to "service_role";

grant EXECUTE on function public."manage_sentiment_supporting_model"(p_actor uuid, p_action text, p_model uuid, p_generation bigint, p_payload jsonb) to "service_role";

grant EXECUTE on function public."manage_sentiment_training"(p_actor uuid, p_action text, p_job uuid, p_generation bigint, p_payload jsonb) to "service_role";

grant EXECUTE on function public."queue_approved_sentiment_training"() to "service_role";

grant EXECUTE on function public."record_sentiment_support_usage"(p_ids uuid[]) to "service_role";

grant EXECUTE on function public."report_engagement_counts"(p_ids uuid[], p_viewer uuid) to "service_role";

grant EXECUTE on function public."report_sentiment_training_progress"(p_job uuid, p_lease uuid, p_sequence bigint, p_completed numeric, p_total integer, p_stage text, p_language text) to "service_role";

grant EXECUTE on function public."restore_sentiment_dataset"(p_actor uuid, p_payload jsonb) to "service_role";

grant EXECUTE on function public."save_admin_report_status"(p_report uuid, p_actor uuid, p_actor_name text, p_status text, p_verified boolean) to "service_role";

grant EXECUTE on function public."sentiment_dataset_ready_to_queue"(p_dataset uuid, p_version integer) to "service_role";

grant EXECUTE on function public."sentiment_supporting_delete_preview"(p_actor uuid, p_model uuid) to "service_role";

grant EXECUTE on function public."sentiment_training_capabilities"() to "service_role";

grant EXECUTE on function public."sentiment_training_pool_summary"() to "service_role";

grant EXECUTE on function public."sentiment_training_worker"(p_action text, p_job uuid, p_lease uuid, p_payload jsonb) to "service_role";

grant EXECUTE on function public."set_credibility_level"() to public;

grant EXECUTE on function public."set_fullname"() to public;

grant EXECUTE on function public."set_sentiment_analysis_updated_at"() to public;

grant EXECUTE on function public."set_updated_at"() to public;

grant EXECUTE on function public."valid_sentiment_independent_metrics"(m jsonb) to "service_role";

grant EXECUTE on function public."valid_sentiment_independent_policy"(policy jsonb) to "service_role";

grant EXECUTE on function public."valid_sentiment_pool_policy"(policy jsonb) to "service_role";
