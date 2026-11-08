-- Deploy the manual-only profile backend/client BEFORE running this cleanup.
-- WARNING: permanently deletes historical profile GPS verification records.
-- Back up/export this table first if you need its history.
-- Do not add CASCADE: unexpected dependencies must stop this migration.
begin;
drop table if exists public.profile_location_verifications;
notify pgrst, 'reload schema';
commit;
