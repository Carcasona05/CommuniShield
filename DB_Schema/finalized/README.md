# Finalized database — 39 tables

This is a **fresh-install definition**, aligned to the supplied table inventory
and current repository behavior. It is not a live database dump or a migration,
and contains no accounts, credentials, reports, datasets or trained models.
No live database was contacted or modified to produce it.

## Install into an empty Supabase project

Supabase must already provide `auth.users`, `auth.uid()`, `storage.buckets`,
`anon`, `authenticated`, and `service_role`. Do not create these managed objects
from application SQL.

With a trusted PostgreSQL connection, run:

```sh
psql "$DATABASE_URL" -f DB_Schema/finalized/install.psql
```

`install.psql` enables stop-on-error and includes each file in order. The schema
files form one transaction; defaults and read-only verification follow it.
For the Supabase SQL editor, concatenate the files listed in
`manifest.json.schema_install_order` **in that exact order into one execution**,
then execute `02_reference_data.sql`, then `03_verify.sql`. Keep the source files
separate; there is intentionally no combined schema SQL file.

| Files | Contents |
| --- | --- |
| `shared/00_preflight.sql` | Reject existing app tables; require managed Supabase dependencies. |
| `shared/00_types.sql` | `user_role`: `user`, `admin`, `super_admin`. Existing role columns remain text, as supplied. |
| `tables/*.sql` | Exactly 39 tables, one file each, with local constraints/indexes/RLS/grants. |
| `shared/01_foreign_keys.sql` | Cross-table constraints after all target keys exist. |
| `shared/02_functions.sql` | Current application RPCs and required private helpers. |
| `shared/03_triggers.sql` | Auth/profile, credibility, timestamps, queues and analysis triggers. |
| `shared/03_policies.sql` | Supplied public/own/admin RLS policies. |
| `shared/04_finish.sql` | Schema cache notification and commit. |
| `02_reference_data.sql` | Categories/types, notification types, settings, facilities, empty model-state/settings singletons, private artifact bucket. |
| `03_verify.sql` | Read-only existence, training capabilities and private-table/protocol access checks. |

The API provisions its public `report-images` bucket through the Storage API on
first upload. The private `sentiment-models` bucket is seeded here. No managed
storage objects or user files are exported.

## Existing databases

**Do not run this installer against your existing 39-table database.** Use only
missing feature migrations after reviewing their prerequisites and backing up
data. The read-only verification file can be used independently; it does not
reset models, scores, jobs or saved analyses. It checks required objects, not
exact column parity on a live deployment.

The definitions include current Verified status/scoring, timed credibility and
unlimited all-good access, feed/comment queues, durable admin analysis, current
record browsing/cursors, raw-confidence decision storage, dataset restore,
support-model deletion, progress and selected-dataset training receipts.
Private `_legacy` training helpers are still dependencies of active wrappers;
their direct grants remain revoked. No inference/training policy was rewritten.

The listed policy semantics are retained.
Private worker/training/credibility ledger tables have RLS and no client policies
or client grants. Browser roles receive only commands used by their policies
(plus read-only lookup tables); broad offline-fixture defaults are not exported.
The sentiment cleanup trigger runs with a pinned definer context so an allowed
own-report/comment edit can invalidate its cached analysis without client DELETE
access to analyses. Existing deployments can apply the additive
`../migrations/sentiment_cleanup_trigger_permissions.sql` permission fix; it does
not modify stored rows when installed.

## Provenance and validation

The previous combined snapshot had 32 tables and preserved training functions
whose original migrations are no longer present. It was materialized **only in
isolated PGlite**, upgraded with the available current feature migrations, then
exported into these split definitions. Retired `admin_posts` was excluded only
from that isolated reconstruction. No live DROP or data conversion was run.
Historical source paths/hashes in `manifest.json.sources` document this one-time
reconstruction, **not a runnable migration chain**; the old combined snapshot is
available in Git history. Current split definitions are now authoritative.

`inventory.mjs` independently records all supplied names, types and nullability.
Existing numeric precision/checks/defaults are retained; column ordering is not
significant. `build.mjs` loads the split installer into isolated PostgreSQL,
checks that contract, then canonicalizes the definitions and output hashes.
It does not claim parity with missing historical migrations or a live database.

With `@electric-sql/pglite` available (or `PGLITE_MODULE` set to its module URL):

```sh
node DB_Schema/finalized/build.mjs --check
node --test tests/database/finalizedSchema.postgres.mjs tests/database/analyticsReports.postgres.mjs
```

After intentional definition edits, run `build.mjs` without `--check` and inspect
the diff. The builder never reads `.env` or connects to Supabase.
