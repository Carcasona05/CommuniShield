-- Apply after sentiment_datasets.sql. Additive and safe to reapply.
-- Restore never reapproves examples or queues training.
create or replace function public.restore_sentiment_dataset(p_actor uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
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
$$;
revoke all on function public.restore_sentiment_dataset(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_sentiment_dataset(uuid, jsonb) to service_role;
