-- SUPERSEDED: the current single-field Address form needs no migration.
-- Retained for installations that applied the earlier two-field design.
-- Do not run for this release. Existing extra columns may safely remain.
-- Keep existing single-line addresses and old GPS records; do not invent a
-- barangay or mark GPS permission as proof of residency.
begin;
alter table public.profiles add column if not exists address_barangay text not null default '';
alter table public.profiles add column if not exists address_line text not null default '';
notify pgrst, 'reload schema';
commit;
