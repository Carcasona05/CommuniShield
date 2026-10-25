# Finalized CommuniShield database schema

This folder is the **fresh-install, final-state schema** for the application,
including language-scoped supporting-model training. It is generated from the
repository's base schemas and the full ordered migration chain—not a dump of your
live Supabase database, and not an instruction to erase or rebuild it.

## Which file should I use?

| Situation | Action |
|---|---|
| Your current working database | **Do not run `01_schema.sql`.** Keep the current database and apply only missing migrations. |
| New, empty Supabase project | Run `01_schema.sql`, then `02_reference_data.sql`, then `03_verify.sql`. |
| Check an existing final deployment | Run only `03_verify.sql` (read-only). |

`01_schema.sql` refuses to run if any application table already exists. It never
drops tables, truncates rows, resets model history or imports sample users.
Do not bypass this guard or run all historical schemas after installing it.
`02_reference_data.sql` inserts defaults with conflict protection, not user data;
reapplying it does not overwrite settings or rewind model counters.

## Contents

### Per-table layout (recommended for browsing)

Each table has its own file named **exactly after the table**:

```text
finalized/
  tables/
    profiles.sql
    reports.sql
    report_comments.sql
    sentiment_datasets.sql
    ... (32 table files)
  shared/
    00_preflight.sql
    01_foreign_keys.sql
    02_functions.sql
    03_triggers_and_policies.sql
    04_finish.sql
  install.psql
```

Each table file contains its columns, primary/unique/check constraints, indexes,
RLS enablement and table grants. Foreign keys are applied only after **all** tables
exist. Shared functions, triggers and policies follow, because they can reference
multiple tables/functions. This avoids circular dependencies and duplicate helper
definitions. Table files are not standalone migrations and must not be installed
individually over an existing database.

For a new project, `psql "$env:DATABASE_URL" -f DB_Schema/finalized/install.psql`
loads the split files in order, then reference data and verification. Use a trusted
database connection and do not commit credentials. `install.psql` is a **psql**
script, not SQL for the Supabase editor. All schema parts run in one transaction;
do not run these parts in separate editor sessions.

For the Supabase SQL editor, the generated **`01_schema.sql`** remains a convenience
bundle containing exactly the same split files in installation order. Choose
**either** the split installer **or** the bundle, never both. With the bundle,
run reference data and verification afterward as described above.

`manifest.json` records the precise schema installation order and hashes of every
generated file. Changes belong in the schema/migration sources, then regenerate;
do not hand-edit generated table files.

- **`01_schema.sql`**: 32 final tables, 25 functions, keys, constraints, indexes,
  triggers, RLS policies and explicit grants.
- **`02_reference_data.sql`**: incident categories/types, application defaults,
  emergency-facility reference entries, singleton training settings/state, and the
  **private** `sentiment-models` bucket. Review facility details before deployment.
- **`03_verify.sql`**: read-only protocol, primary-state, pool, storage-privacy and
  permission checks. No training, claiming, enabling or data deletion.
- **`manifest.json`**: source paths/hashes and generated SQL hashes.
- **`build.mjs`**: development-only deterministic generator using isolated PGlite.
  It does not read `.env`, connect to Supabase or access production data.

Supabase must already supply `auth.users`, `auth.uid()`, `storage.buckets`, roles
`anon`/`authenticated`/`service_role`, and PostgreSQL UUID support (`pgcrypto`).
Do not create the generator's test fixtures in a real Supabase project. Image
buckets created by application upload handlers and Supabase's own storage/auth
policies are outside this application-schema snapshot.

The source RLS policies are preserved, not redesigned by this consolidation.
Application tables receive explicit DML grants consistent with those policies;
private training tables/RPCs remain service-role-only, and internal protocol
helpers remain revoked even from service_role. This is not a new security audit
of every legacy application policy.

## Final training behavior

- Built-in sentiment models and the language router remain permanently primary.
- Uploads support any combination of Cebuano, English and Filipino.
- Approval collects reviewed examples; training and enabling are manual.
- Approved datasets determine the selected languages, independently of baseline
  languages. Earlier examples can be reused within the selected languages.
- Each language must meet its own unchanged held-out quality requirements.
- A failed language cannot block a qualified one or be enabled alongside it.
- Only qualified-language artifacts are registered, initially **disabled**.
- The enabled pool remains limited to 1–3 supporting candidate bundles.
- Qualified disagreement abstains (`unclear`); no majority voting or automatic
  built-in replacement. Existing report analyses are not rewritten.

Private functions with `_legacy`/`_all_languages` names are **required internal
dependencies** of the final worker and lifecycle wrappers, not obsolete public
entry points. Deleting them would break the final protocol. Their grants remain
revoked and their definitions are included once in the snapshot.

There are no uploaded datasets, training samples, training jobs, supporting models,
accounts, credentials, reports, saved analyses or model binaries in this package.
Existing migrations, test fixtures and built-in provenance are deliberately kept
elsewhere in the repository. Demo SQL under `DB_Schema/seed/` is optional and is
not part of this installation.

## Existing installations: migration order

Never reapply an earlier protocol migration after a later one. After the base
application schemas, training migrations are:

1. `migrations/sentiment_datasets.sql`
2. `migrations/sentiment_training_jobs.sql`
3. `migrations/sentiment_continued_training.sql`
4. `migrations/sentiment_supporting_pool.sql`
5. `migrations/sentiment_fresh_candidates.sql`
6. `migrations/sentiment_independent_admission.sql`
7. `migrations/sentiment_pending_training_summary.sql`
8. `migrations/sentiment_language_scoped_training.sql`

Stop the worker while changing protocols, apply only missing migrations, restart
the backend and updated worker, and refresh the client. Supporting inference is
still separately controlled by backend environment flags. This folder does not
change those flags or create a new model.

## Rebuild and test (development only)

Install `@electric-sql/pglite@0.5.10` in a temporary tools folder and set
`PGLITE_MODULE` to its `dist/index.js` file URL. No runtime dependency is added.
From the repository root:

```powershell
node DB_Schema/finalized/build.mjs
node DB_Schema/finalized/build.mjs --check
node --test tests/database/finalizedSchema.postgres.mjs
```

The test installs the complete source chain in one isolated database, installs
the finalized SQL in another, and compares final tables, columns, constraints,
functions, triggers, policies and grants. It also checks reproducibility,
no demo/user data, guard safety, auth triggers and one-row/scoped training flow.
Tests do not touch your live database.
