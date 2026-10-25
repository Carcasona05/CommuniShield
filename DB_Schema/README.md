# Database files

**Current final schema:** [finalized/README.md](finalized/README.md).

- `finalized/`: consolidated schema for a **new empty Supabase project**, reference
  defaults, and a read-only verification script for existing deployments.
- `migrations/`: keep these for incremental upgrades of existing databases;
  the final snapshot and PostgreSQL regression tests depend on them.
- Root `*_schema.sql` files: original application schema sources, retained for
  provenance and deterministic generation. Do not mix them with a fresh final
  install or apply them blindly over an existing database.
- `seed/` and older seed SQL: optional synthetic/demo data, never part of the
  finalized production schema. Review before use; they are kept for testing.
- `password_resets_migration.sql`: historical removal of the retired password
  reset table, not part of a fresh install. Do not run it as a setup requirement.

No schema consolidation changes your live database or built-in model files.
