# Automatic retraining after dataset approval

## What happens

1. A super admin approves a dataset using the existing approval screen.
2. A database trigger **atomically queues** retraining in that same transaction.
   Approvals within 30 seconds share one queued job. A later approval while a job
   is already training creates the next queued job.
3. An always-running Python worker claims the job and takes an immutable snapshot
   of **all currently approved datasets**, not just the last upload. Pending,
   rejected, and archived examples are excluded.
4. The worker builds a new training snapshot, trains the three sentiment models,
   and evaluates the exported ONNX artifacts against the active model on the same
   fixed test set. The language-identification model is preserved unchanged.
5. A passing candidate appears as **Ready for review**. A super admin explicitly
   clicks **Activate candidate**. Training never activates a model automatically.
6. Backend instances verify checksums and ONNX contracts, download a complete
   bundle into writable temporary storage, and refresh within 30 seconds.
   Old report/comment analyses are not automatically recalculated.

Until activation, the current model continues serving requests. Training,
evaluation, storage, or download failures never overwrite the bundled ONNX files.

## Required one-time setup

### 1. Apply the new migration

After `DB_Schema/migrations/sentiment_datasets.sql`, run:

**`DB_Schema/migrations/sentiment_training_jobs.sql`**

Run it in Supabase SQL Editor. It creates the durable queue, lease protocol,
versioned model pointer, audit log, and private `sentiment-models` storage bucket.
It also queues existing approved datasets once when upgrading from manual exports.
Do not add public storage policies or expose the worker RPC to authenticated users.

### 2. Enable model activation on the backend

Add this to `server/.env` and the backend's Vercel environment variables:

```env
SENTIMENT_MODEL_REGISTRY_ENABLED=true
```

Keep your existing Supabase configuration. Restart/redeploy the backend and refresh
the client. Activation is intentionally disabled until this flag is enabled.
Models remain in the private bucket; browser clients never receive service keys.

### 3. Start the Python worker

From the repository root on Windows:

```powershell
.\.venv-data\Scripts\python.exe -m pip install -r datasets/requirements-training.txt
.\.venv-data\Scripts\python.exe datasets/sentiment_training_worker.py --env-file server/.env
```

The optional `--env-file` loads server credentials without copying them into the
client. Environment variables already supplied by a host take precedence.

**Keep this process running** for automatic training. A local demo stops processing
jobs when the terminal/computer is stopped. For production, run this same worker
as a supervised Python service on an always-on host; do not run it inside Vercel
HTTP functions. No particular hosting provider is required by the implementation.
Allow up to two hours per job and provision CPU/RAM for your roughly 100k-row
training corpus (start with 4–8 GB RAM and monitor actual usage).

The worker needs:

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server-side only).
- The **same immutable baseline** `datasets/processed/train.csv`,
  `validation.csv`, and `test.csv`. These are git-ignored; explicitly provision
  them securely on a remote worker. Do not upload a previous job's merged snapshot
  as the baseline, or archived examples would silently remain in future training.
- The bundled baseline `server/models/*.onnx` for the first evaluation/rollback.
  Subsequent runs download the active baseline bundle from private storage.

Optional paths:

```powershell
python datasets/sentiment_training_worker.py --env-file server/.env --data-dir path/to/frozen-baseline --baseline-model-dir path/to/bundled-models --runs-dir path/to/private-runs
```

`--once` processes at most one available job. It may report no claimable job during
the 30-second batching window. The default mode polls automatically every 5 seconds.
Never put the service-role key in Expo variables, browser requests, or source control.

## Super-admin workflow

Open **Sentiment Datasets** → approve → check **Automatic retraining**:

- **Queued:** worker has not claimed it yet. If it stays queued, start/check the worker.
- **Training:** candidate models are being built.
- **Evaluating:** real ONNX predictions are being compared with the active baseline.
- **Ready for review:** all checks passed; review the scores, then activate manually.
- **Failed:** inspect the error, fix the data/worker problem, and choose **Queue retraining**.

The panel refreshes every 10 seconds. Model generation and dataset revisions
prevent activation of stale candidates. Approving/archiving more data during a run
can make a completed candidate outdated; the next queued run captures the changes.
Archiving an approved dataset queues a new candidate without it; it does not
instantly remove its influence from a model that has already been activated.

**Roll back model** restores the previously active candidate, or the bundled
baseline for the first activation. Rollback increments the generation and is
audited. It may restore a model without the latest approved data. Activation and
rollback are blocked while a live evaluation is running, avoiding baseline races.

## Evaluation and data safety

- Train only on the frozen baseline training data plus approved examples.
- Exclude approved samples matching validation/test text after language-aware
  Unicode/case/whitespace normalization. Duplicates of baseline training examples
  are not added again; conflicting approved/baseline labels fail the job for review.
- Remove pre-existing training/holdout overlaps **only from the new snapshot**.
  Originals and validation/test files are never rewritten. Conflicting labels
  inside the existing fixed holdouts are reported as quality warnings, not silently
  changed to improve scores. The current source has 3 train/test overlap keys and
  3 conflicting-label groups in its test data; curate a separately versioned
  benchmark if those need correction.
- Each language must achieve macro-F1 ≥ 0.60 and must not fall more than 0.01 below
  the active baseline. No class recall may fall more than 0.03; each test class
  needs at least 10 examples. Known-correct Cebuano/Filipino/English regression
  phrases must not become incorrect. Metrics and policy are stored with the job.
- ONNX evaluation uses small batches to avoid dense TF-IDF memory blowups.
- A job records dataset IDs/versions, source split hashes, baseline model hashes,
  import counts, evaluation scores, and checksummed candidate artifacts.
- Job leases are heartbeated. Expired workers cannot complete/publish a job, and
  concurrent workers cannot claim two running jobs. A restarted worker expires
  old leases safely; **Queue retraining** retries with a fresh job/snapshot.
- The initial approved-pool limit is 50,000 samples. Archive/curate or explicitly
  revise the policy before growing beyond it. Per-import limits remain unchanged.
- Worker snapshots/logs live under git-ignored `datasets/training-runs/`; keep
  them private. Storage artifacts use immutable job/lease paths. Retain active and
  previous bundles; orphaned/failed-upload artifacts can be reviewed for cleanup.

Backend temporary caches are not the source of truth. A cold instance downloads
the active bundle again. Registry/download failures retain the last-good in-memory
model, or the bundled fallback on a cold start; inspect backend logs if an instance
has not switched. Disable the registry flag only as an emergency fallback to the
bundled models, consistently on all backend instances.

## Verification

- `npm test` in `server`: API validation, access checks, registry/checksum tests,
  real ONNX cache smoke tests, and existing backend coverage.
- `python -m unittest discover -s datasets -p test_sentiment_training_worker.py`:
  merge isolation, evaluation gates, worker lifecycle, and no automatic activation.
  Run with `.venv-data` to include the real ONNX contract test.
- `server/tests/sentimentTraining.postgres.mjs`: isolated PostgreSQL tests for the
  actual migrations, approval-trigger queueing, batching, immutable snapshots,
  leases, stale revisions, manual activation, rollback, and permissions. Use the
  same optional `PGLITE_MODULE` setup documented in `SENTIMENT_DATASETS.md`.

No live migration, cloud deployment, full-corpus retraining, or model activation
is performed merely by installing this code. Perform the setup above first.
