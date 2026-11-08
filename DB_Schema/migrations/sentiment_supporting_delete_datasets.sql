-- Delete disabled/archived supporting models directly, with optional dataset archiving.
-- Requires the existing supporting pool and sentiment dataset functions.
-- Does not replace either existing mutation function. Safe to reapply.
create or replace function public.sentiment_supporting_delete_preview(p_actor uuid, p_model uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
$$;

create or replace function public.delete_sentiment_supporting_with_datasets(
  p_actor uuid, p_model uuid, p_generation bigint, p_datasets jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
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
$$;
revoke all on function public.sentiment_supporting_delete_preview(uuid,uuid) from public, anon, authenticated;
revoke all on function public.delete_sentiment_supporting_with_datasets(uuid,uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.sentiment_supporting_delete_preview(uuid,uuid) to service_role;
grant execute on function public.delete_sentiment_supporting_with_datasets(uuid,uuid,bigint,jsonb) to service_role;
