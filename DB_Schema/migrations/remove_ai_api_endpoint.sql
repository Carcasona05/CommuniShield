-- ai_api_endpoint is a ROW in the key/value settings table, not a column.
-- Remove only this retired override; preserve model metadata and all other settings.
begin;
delete from public.system_settings where key = 'ai_api_endpoint';
commit;
