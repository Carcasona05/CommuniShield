# Continued training and automatic model updates

> **Superseded for serving:** use `server/SENTIMENT_SUPPORTING_POOL.md` and apply
> `sentiment_supporting_pool.sql`. The built-in models are now permanent; new
> candidates join a bounded supporting pool instead of replacing the primary.
> The single-active-model workflow below is historical migration context only.

**Active model state + newly approved examples + bounded older replay examples
→ updated model → quality checks → automatic activation.**

Uploads still require super-admin approval. A failed, interrupted, stale or
incomplete job never replaces the active model. Existing report/comment analyses
are not automatically recalculated.

## One-time setup / upgrade

Run the migrations in Supabase SQL Editor in this order:

1. `DB_Schema/migrations/sentiment_datasets.sql`
2. `DB_Schema/migrations/sentiment_training_jobs.sql`
3. **`DB_Schema/migrations/sentiment_continued_training.sql`**

For an existing installation with the first two already applied, run only the
third. Do not reapply the older worker migration afterward: it would restore the
legacy manual-activation protocol. The new migration does not itself activate,
retrain or overwrite any existing model.

Set this in `server/.env` (used by the local worker) and the deployed backend:

```env
SENTIMENT_MODEL_REGISTRY_ENABLED=true
```

Restart/redeploy the backend and restart the Python worker. From the project root:

```powershell
.\.venv-data\Scripts\python.exe -m pip install -r datasets/requirements-training.txt
.\.venv-data\Scripts\python.exe datasets/sentiment_training_worker.py --env-file server/.env
```

Keep the worker running. It can run on your computer while the app/backend are
online. It needs internet, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; those
credentials must never be exposed to the browser or committed. `--once` handles
at most one job; a 30-second batching window can mean none is claimable yet.

### Startup HTTP 503 / PGRST002

This means Supabase's database API cannot load its schema cache. It is not an
evaluation failure or evidence of a bad dataset. The worker retries only the
read-only capabilities probe with backoff (5, 10, 20, then 30 seconds) without
claiming jobs. Ctrl+C stops the wait; `--once` reports the error immediately.
Mutating RPCs and uploads are not automatically replayed after ambiguous errors.

Check that the Supabase project is active/resumed and inspect Database/API health
and logs. In the SQL Editor, test `select 1;`. If database access works but the API
cache remains unavailable, request a cache refresh with
`NOTIFY pgrst, 'reload schema';`. If database access itself fails, resolve the
project/database availability first; rerunning training migrations will not fix
an unavailable database. Once the API recovers, the worker rechecks migration
capabilities and starts normally. Auth health can be 200 while database API reads
still fail.

### Repeated lease errors during status polling (SQLSTATE 40001)

A log showing `sentiment_training_worker` called with only `p_action` and raising
`Training lease is stale or invalid` can indicate an old worker RPC receiving a
capabilities probe, not a real expired training job. An earlier status probe was
incompatible with that old definition. The backend and Python worker now call
the dedicated `sentiment_training_capabilities()` read-only RPC instead. It never
claims a job, takes the queue lock or checks a lease. It also detects if the old
worker migration was reapplied over the newer protocol.

Stop old workers/status clients, apply the **latest complete**
`sentiment_continued_training.sql`, then restart/redeploy the backend and worker.
The migration reloads the PostgREST schema cache at commit. Verify in SQL Editor:

```sql
select public.sentiment_training_capabilities();
```

Both flags should be `true`. Missing function/false flags mean migration setup is
incomplete. Do not bypass lease validation or force job statuses. This fixes the
protocol mismatch; a separate `PGRST002` outage still needs API/database health
diagnosis if it persists after upgrading.

## How continued training actually works

`datasets/continue_sentiment.py` loads the current fitted Python model state,
including its vectorizer and classifier weights. It does **not** initialize a
new classifier or refit the vocabulary. For each language with new examples:

- Determine additions relative to the active job's approved-data snapshot.
- Exclude exact baseline duplicates and validation/test overlaps.
- Select deterministic older rehearsal examples, up to 300 per sentiment class,
  from training rows only, excluding the new rows themselves.
- Warm-start the existing binary logistic classifiers using `lbfgs`. The previous
  `liblinear` solver does not support the required warm-start behavior.
- Select a bounded update strength using validation metrics, preserving per-class
  recall and macro-F1 safeguards. Test examples are never used for selection.
- Export both the updated ONNX inference model and its fitted joblib state.

Languages with no new examples are copied unchanged, not unnecessarily retrained.
A job with no genuinely new eligible examples stops with an explanatory message.
The final complete bundle must still pass all existing test-set and regression
gates. No gate is weakened to force activation.

**Vocabulary limitation:** new weights can learn from existing word/character
features, but this is not a vocabulary rebuild. If no new text has recognized
features, continued training stops. A full feature/vocabulary rebuild is a
separate, explicitly reviewed operation.

## Required baseline files

For the built-in model, the worker needs:

- The frozen `datasets/processed/train.csv`, `validation.csv`, `test.csv`.
- The served `server/models/*.onnx` bundle.
- The matching trusted `datasets/models/sentiment_*.joblib` fitted states and
  their paired `sentiment_*.onnx` files.
- `datasets/models/baseline_metrics.json`, containing recorded validation scores.

These data/state files are git-ignored. Provision them explicitly on a remote
worker. Bootstrap ONNX hashes must match the served model before a paired state
is accepted. Legacy models were refitted on validation, so the trainer uses
their recorded pre-refit validation scores, not inflated in-sample predictions.
Older model knowledge cannot be retrospectively removed from their weights.

After the first successful update, inference files **and training states** are
stored privately in the `sentiment-models` bucket. The next job downloads the
exact active state, verifies sizes/checksums/paths, and loads its snapshot and
recorded validation metadata. No local job directory is the source of truth.

Joblib is executable serialization. Only trusted bootstrap states and private
worker-generated, checksum-verified states may be loaded. Never load joblib files
from dataset uploads or arbitrary URLs. Browser/backend inference downloads only
ONNX files, not the Python training state.

## Automatic activation and rollback

The worker uploads the complete immutable bundle, then completes the job through
the service-role-only RPC. The database atomically verifies:

- A valid, unexpired worker lease and a passing evaluation.
- Continued-training provenance (legacy cold-training workers cannot activate).
- All four inference files and all three saved Python training states.
- The same active-model generation/parent and approved-data revision as claimed.

Only then does it mark the job ready, move the previous pointer and activate the
update in **one transaction**. New approval/model changes during training make
the result stale; the old model remains active and a fresh queued job can proceed.
Browser roles cannot call this protocol.

Backend instances refresh within approximately 30 seconds, verifying checksums
and ONNX contracts. Download failures retain the last working in-memory model
(or bundled fallback on a cold start) and log the failure.

In Sentiment Datasets → Training, **Queue retraining** and **Roll back model**
are directly below **Currently in use**, aligned right. Rollback is disabled
when the built-in model is already active, during a live training/evaluation,
or when registry serving is disabled. Rollback restores the previous pointer;
the first rollback can return to the built-in bundle. It does not delete datasets.

## Removed or relabelled data

Continued training cannot guarantee unlearning. If an example already learned by
the active model is archived, removed or relabelled, the worker stops instead of
silently claiming that its influence has disappeared. Roll back to an appropriate
earlier model, or perform a separately reviewed full rebuild to remove its effect.
Archiving may queue a job, but it does not itself remove knowledge from weights.

## Evaluation and diagnostics

Final test policy is unchanged: each language needs macro-F1 ≥ 0.60, no macro-F1
drop above 0.01, no class recall drop above 0.03, and at least 10 test examples per
class. Known-correct regression phrases must not become incorrect.

Failure messages identify the language/class and actual values. Detailed private
logs, the immutable approved snapshot, metadata and evaluation results are under
`datasets/training-runs/<job-id>/`. A candidate is not guaranteed to improve or
pass merely because additional data was uploaded. Review labels and data quality.

## Verification

```powershell
.\.venv-data\Scripts\python.exe -m unittest discover -s datasets -p "test_*.py"
```

From `server/`, `npm test` covers API access and registry behavior. Optional
`tests/sentimentContinuedTraining.postgres.mjs` runs the actual migrations in an
isolated PGlite database, covering atomic activation, stale/expired workers,
rollback, incomplete states and permissions. Use `PGLITE_MODULE` as documented
for the other optional PostgreSQL tests. The browser dataset test also verifies
the right-aligned controls and automatic-update UI.

Changing code alone does not apply migrations, start workers, deploy the backend,
train a live job or activate a live model. Complete setup explicitly.
