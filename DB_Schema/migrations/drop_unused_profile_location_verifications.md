# Remove unused profile GPS verification records

The actual table name is `public.profile_location_verifications` (plural).

1. Deploy the latest backend and frontend, which use only manually entered
   `profiles.location` for the home/permanent address. Older deployments required
   the verification table: do not drop it before replacing those deployments.
2. Export/back up `profile_location_verifications` if you want its old GPS history.
3. Run `drop_unused_profile_location_verifications.sql` in Supabase SQL Editor.

This permanently drops ONLY that table. It does not delete users, profile
addresses, incident coordinates or map data. No `CASCADE` is used. If PostgreSQL
reports a dependency, stop and inspect it instead of deleting dependencies blindly.
Repeating the cleanup is safe. Do not rerun the obsolete
`user_profile_completion.sql` migration afterward: it would recreate the table.

The unused `address_barangay` and `address_line` columns are deliberately untouched
by this cleanup. They are separate from the verification table and the current
app's `profiles.location` field. Removing those columns is not necessary here.
