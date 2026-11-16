# Database files

The current database contract is **39 application tables**. Start with
[the finalized schema guide](finalized/README.md), not the older root scripts.

| Location | Purpose |
| --- | --- |
| `finalized/tables/` | One SQL file per current table: columns, checks, keys, indexes, RLS enablement and grants. |
| `finalized/shared/` | Enum, foreign keys, functions, triggers and RLS policies, installed in manifest order. |
| `finalized/02_reference_data.sql` | Safe fresh-install lookup/configuration defaults, not sample records. |
| `migrations/` | Feature-specific upgrades for existing databases; never run alphabetically or indiscriminately. |
| `analytics/` | Read-only analytics queries. |
| `seed/` | Optional synthetic development records; never part of schema installation. |
| `maintenance/` | Explicit maintenance tools; potentially destructive and never part of installation. |

Root `*_schema.sql` files and `ai_model_tracking_migration.sql` are retained as
historical upgrade/test prerequisites. They are **not an alternative current
installer**: for example, `reports_schema.sql` still describes retired
`admin_posts`. Do not replay them over the finalized schema.

## Cleanup in this revision

- Removed the obsolete combined finalized installer; use the 39 split files.
- Removed `demo_seed_data.sql` (retired `admin_posts` data) and
  `seed_15_reports.sql` (older sample-account/report generator). The maintained
  synthetic generator and `seed/communishield_sample_seed.sql` remain.
- Removed `password_resets_migration.sql`, an unrelated legacy destructive DROP.
- Replaced the two outdated database explanation guides with this guide.
- Kept upgrade scripts, including retired profile-address/location and blotter
  certification scripts, because existing deployments/tests can depend on them.
  Their presence does not mean they should be installed now.

The retired `profile_location_verifications` table and extra address columns are
not in the current 39-table contract. The explicitly superseded
`manual_profile_address.sql` must not be applied for the current single Address
field. `drop_unused_profile_location_verifications.sql` is a separate opt-in
cleanup for older deployments; no cleanup was run on a live database.

Database blotters retain the supplied original columns. Certification fields and
numbering are handled by the current client-local blotter implementation;
`admin_blotter_certification.sql` and `admin_blotter_numbering.sql` are historical
optional database extensions, not part of this fresh-install contract.
