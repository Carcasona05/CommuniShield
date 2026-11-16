-- Read-only checks. Safe to run on an existing deployment after its migrations.
-- Does not create, modify, delete, train, activate or reset anything.
begin read only;

do $$
declare capabilities jsonb; relation text; role_name text;
begin
   foreach relation in array array['incident_categories','incident_types','reports','report_images',
     'report_comments','report_likes','profiles','notification_types','notifications',
     'notification_report_status','notification_nearby_incident','login_activities',
     'emergency_facilities','user_credibility','credibility_events','report_credibility_analysis',
     'app_settings','audit_logs','report_validations','admin_announcement','system_settings',
     'user_terms_acceptance','sentiment_analysis','admin_blotters','credibility_usage',
     'credibility_report_effects','credibility_suspensions','comment_sentiment_jobs',
     'admin_analysis_batches','admin_analysis_jobs','admin_analysis_batch_jobs',
    'sentiment_datasets','sentiment_training_samples','sentiment_dataset_events',
    'sentiment_training_jobs','sentiment_training_events','sentiment_model_state',
    'sentiment_supporting_models','sentiment_supporting_settings'] loop
    if to_regclass('public.'||relation) is null then raise exception 'Missing required table: %',relation; end if;
   end loop;
   if not exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
     where n.nspname='public' and t.typname='user_role' and t.typtype='e') then
     raise exception 'Missing user_role enum';
   end if;
  capabilities := public.sentiment_training_capabilities();
  if capabilities->>'language_scoped_training' is distinct from 'true'
    or capabilities->>'independent_admission' is distinct from 'true'
    or capabilities->>'manual_training' is distinct from 'true'
    or capabilities->>'manual_enable' is distinct from 'true'
    or capabilities->>'automatic_activation' is distinct from 'false' then
    raise exception 'Training protocol is not finalized. Apply missing migrations in order.';
  end if;
  if not exists(select 1 from public.sentiment_model_state where id=1 and active_job_id is null and previous_job_id is null) then
    raise exception 'Permanent-primary state is missing or legacy primary pointers remain';
  end if;
  if not exists(select 1 from public.sentiment_supporting_settings where id=1 and max_enabled between 1 and 3) then
    raise exception 'Supporting pool settings are missing or invalid';
  end if;
  if not exists(select 1 from storage.buckets where id='sentiment-models' and public=false) then
    raise exception 'Private sentiment-models bucket is missing';
  end if;
   foreach role_name in array array['anon','authenticated'] loop
     foreach relation in array array['sentiment_datasets','sentiment_training_samples',
       'sentiment_dataset_events','sentiment_training_jobs','sentiment_model_state',
       'sentiment_training_events','sentiment_supporting_models','sentiment_supporting_settings',
       'credibility_usage','credibility_report_effects','credibility_suspensions',
       'comment_sentiment_jobs','admin_analysis_batches','admin_analysis_jobs','admin_analysis_batch_jobs','admin_blotters'] loop
       if has_table_privilege(role_name,'public.'||relation,'SELECT,INSERT,UPDATE,DELETE') then
         raise exception 'Private table % is exposed to %',relation,role_name;
       end if;
     end loop;
    if has_table_privilege(role_name,'public.sentiment_training_samples','SELECT')
      or has_function_privilege(role_name,'public.sentiment_training_worker(text,uuid,uuid,jsonb)','EXECUTE')
      or has_function_privilege(role_name,'public.report_sentiment_training_progress(uuid,uuid,bigint,numeric,integer,text,text)','EXECUTE')
      or has_function_privilege(role_name,'public.get_sentiment_training_progress(uuid[])','EXECUTE') then
      raise exception 'Training data/protocol must not be directly accessible to role %',role_name;
    end if;
  end loop;
  if has_function_privilege('service_role','public.sentiment_training_worker_scope_legacy(text,uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'Private worker wrapper can be bypassed';
  end if;
end $$;

select public.sentiment_training_capabilities() as training_capabilities;
select generation,data_revision,active_job_id,previous_job_id from public.sentiment_model_state where id=1;
select max_enabled from public.sentiment_supporting_settings where id=1;
select 'Finalized schema verification passed; no data changed.' as result;
commit;
