-- Read-only checks. Safe to run on an existing deployment after its migrations.
-- Does not create, modify, delete, train, activate or reset anything.
begin read only;

do $$
declare capabilities jsonb; relation text; role_name text;
begin
  foreach relation in array array['profiles','reports','report_comments','sentiment_analysis',
    'sentiment_datasets','sentiment_training_samples','sentiment_dataset_events',
    'sentiment_training_jobs','sentiment_training_events','sentiment_model_state',
    'sentiment_supporting_models','sentiment_supporting_settings'] loop
    if to_regclass('public.'||relation) is null then raise exception 'Missing required table: %',relation; end if;
  end loop;
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
    if has_table_privilege(role_name,'public.sentiment_training_samples','SELECT')
      or has_function_privilege(role_name,'public.sentiment_training_worker(text,uuid,uuid,jsonb)','EXECUTE') then
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
