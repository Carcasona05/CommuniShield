# Permanent built-in models + bounded supporting pool

> **Current admission flow:** see [SENTIMENT_INDEPENDENT_ADMISSION.md](SENTIMENT_INDEPENDENT_ADMISSION.md)
> and apply `sentiment_independent_admission.sql` after the fresh-candidates migration.
> Independent admission replaces the comparative gates and auto-enabling described
> below. Approval collects data; training and enabling are manual. The remainder
> documents the legacy protocol and retained lifecycle/provenance infrastructure.

The built-in ONNX models and language router are always the primary. Registry
pointers never replace them. This supersedes the previous single-model automatic
activation workflow; it does not overwrite any built-in model file.

## Setup

Apply migrations in order:

1. `DB_Schema/migrations/sentiment_datasets.sql`
2. `DB_Schema/migrations/sentiment_training_jobs.sql`
3. `DB_Schema/migrations/sentiment_continued_training.sql`
4. `DB_Schema/migrations/sentiment_supporting_pool.sql`
5. **`DB_Schema/migrations/sentiment_fresh_candidates.sql`**

If the first four are installed, apply only the fifth. Do not reapply earlier
protocol migrations afterward. The pool migration retains legacy ready candidates
as **disabled**, clears obsolete primary pointers and installs a service-role-only
pool protocol. It does not enable unverified legacy candidates or train anything.
The fresh-candidates migration adds the opt-in fresh-training mode; after applying
it, restart the Python worker — claims from an outdated worker are rejected so a
job can never train under the wrong mode.

Keep this backend/worker setting:

```env
SENTIMENT_MODEL_REGISTRY_ENABLED=true
```

Supporting inference is separately opt-in on the backend:

```env
SENTIMENT_SUPPORT_ENABLED=true
```

Leave the second flag off until setup/review is complete. With it off, the app
continues using the permanent built-ins. Restart the backend and Python worker
after setup. The normal worker command is unchanged:

```powershell
.\.venv-data\Scripts\python.exe datasets/sentiment_training_worker.py --env-file server/.env
```

Stop old workers before applying the migration. An old worker cannot publish a
legacy result through the new protocol. New workers refuse to start without pool
capabilities. Migration/code changes are not applied to a live database merely by
creating these files.

## Watching worker progress

A read-only progress report ships with the worker (it only sends GET requests;
it can never claim, change, or fail a job, and it never prints credentials):

```powershell
.\.venv-data\Scripts\python.exe datasets/worker_progress.py --env-file server/.env
```

It shows the worker process, capabilities, pool slots, the active job's stage
(queued/training/checking), elapsed time, heartbeat freshness (with an explicit
INTERRUPTED warning when the lease expired), the training-approach mode,
snapshot row counts, a tail of the private `training.log` (freshness plus the
last lines), evaluation-gate results, the event timeline, and a summary of
recent runs (gates passed, registered disabled, or the failure reason).

Useful flags: `--watch [SECONDS]` refreshes continuously (default 5),
`--tail N` sets log lines (default 12), `--limit N` sets recent runs
(default 6), and `--skip-process-check` disables the local process probe.
The script reads only from the API and `datasets/training-runs/`; it does not
need to run on the same machine as the worker (the local run-directory details
are then simply reported as unavailable).

## Training and pool admission

Approval queues a separate candidate from the permanent built-in fitted state,
using currently approved examples and balanced older replay rows. Each candidate
is immutable and independent; it does not overwrite older supporting versions.
Candidates share data/ancestry and are **not independent voters**.

The worker first runs the existing three-language model and regression gates.
Failures publish nothing. Passing candidates then receive validation-only routing
calibration and a separate test evaluation of the **full currently enabled pool
plus the candidate**. A language needs enough accepted fallback examples,
fallback precision at least 0.75, improved cascade macro-F1, retained class recall
and at least 95% non-abstention coverage. The exact thresholds and measurements
are stored; they are not hand-picked per phrase or tuned on test labels.

If no validated fallback region exists, the model is registered **disabled**.
Passing standalone F1 does not make it eligible to serve. A verified candidate
can automatically join the enabled pool if a slot is available. It never replaces
an existing support to make room. At most three supports can be enabled; super
admins can set a smaller limit of one or two.

Pool generation, approved-data revision, leases, complete artifact manifests and
built-in fingerprints fence off stale/incomplete publications. Changing the pool
during evaluation prevents automatic admission of that result.

## Fresh challenger mode (opt-in)

Supporting candidates train in one of two modes; the mode never changes what is
evaluated, only how the candidate is fitted:

- **continued training** (default): warm-starts from the permanent built-in state
  with replay data. Safe and data-efficient, but the vocabulary is fixed, so novel
  phrasing contributes weakly.
- **fresh challenger**: trains from scratch on the full snapshot (all approved
  data plus baseline training rows) with a new vocabulary, reusing the exact
  from-scratch trainer that produced the built-ins. Use this when a continued
  candidate keeps failing because it is too similar to the built-in.

Everything else is identical and unchanged: the built-in files are never written,
the same held-out test gates apply, the same full-pool cascade calibration applies,
and a fresh candidate still registers disabled unless its fallback policy passes
every threshold. Fail-closed protocol checks ensure an outdated worker can neither
claim a fresh job nor complete one without fresh-training evidence.

The super-admin Training panel shows **Queue fresh challenger** only when the
migration reports support; queueing a fresh challenger without the migration is
rejected with a clear message instead of silently falling back. A fresh request
upgrades the pending (unclaimed) queued job; background approvals never downgrade
it. Job details record the training approach for auditability.

## Inference

1. The unchanged built-in language router chooses the language.
2. The built-in sentiment model runs first.
3. Only matching-language supports with a verified policy for the exact built-in
   hashes are considered, and only inside their evaluated uncertainty region.
4. Low-scoring support proposals are rejected. Qualified disagreement returns
   `unclear`, even if two models agree against one. No majority vote or averaging
   unrelated raw scores is used.
5. Agreeing supports use observed validation precision to select provenance; raw
   model scores are not claimed to be calibrated correctness probabilities.

No support/missing registry/download failure falls back to the built-in without
crashing inference. Unknown-language input is left unavailable/unclear in pool
mode rather than picking whichever unrelated language model has the largest raw
score. Pool mode uses local built-ins/supports, not the legacy Gemini voting path;
an explicitly disabled language remains disabled.

A confidently wrong built-in result may still bypass support. Validation-selected
thresholds do not solve every semantic error, sarcasm or distribution shift. The
existing benchmark also has known label-quality warnings. Evaluate on independent,
human-reviewed data before making real-world accuracy claims.

## Management and permissions

Sentiment Datasets → Training contains a permanent built-in card and a separate
Supporting models list, ten per page with View more. It shows dataset versions,
evaluation comparisons, verified fallback languages, status and completed uses.

- Admins can inspect and compare.
- Only active super admins can change limits or enable/disable/archive/restore/
  delete, enforced by API roles and database transactions.
- Enabling requires an evaluated combination matching currently enabled IDs and
  the exact current built-in hashes. If the combination changed, queue fresh
  training/evaluation rather than forcing an old policy to serve.
- Disabling also disables combinations that depended on that participant. Removing
  a disagreeing participant must not create a silently unvalidated decision.
- Archive requires disabled status. Restore returns it to disabled, not enabled.
- Delete requires archived status and no live training/evaluation reference.

**Delete means permanent removal from the serving pool**, not immediate storage
purge. A tombstone, immutable artifacts and audit history are retained so active
in-flight requests cannot lose files and historical analyses remain traceable.
Storage reclamation is a separate owner-operated retention/cleanup task, not an
automatic blind delete. Other models and their learned data are not erased.

Lifecycle changes invalidate the local pool cache. Other backend instances refresh
within ten seconds. In-flight requests may finish using their already acquired
snapshot; session resources are released only after those users finish.

## Provenance and compatibility

Existing sentiment columns remain compatible. `model` stores an auditable
`cascade:supporting|...|support:<ids>` or unresolved-cascade tag, retaining the
participating version IDs and decision reason. `provider` is `ensemble` for a
cascade result, `local` for built-in-only results. Admin map/risk comment labels
identify Built-in, Supporting or Cascade unresolved. Historical labels are never
rewritten silently; explicitly reanalyse if desired.

Saved analysis rows using supports increment per-model use counts only after
successful persistence/source validation. Re-reading cached analyses does not
increment usage. Old registry-generated results are labelled legacy versions,
not falsely relabelled as new supporting-model decisions.

## Verification

- Backend `npm test`: routing decisions, immutable primary, API authorization.
- Python `unittest discover -s tests -t .`: calibration, abstention,
  worker gates, immutable training behavior and the progress-report formatting.
- Optional `tests/database/supportingModelPool.postgres.mjs`: actual isolated
  PostgreSQL transactions, bounded coexistence, lifecycle, stale results,
  dependency invalidation, permissions, retained audit records, fresh-mode
  enqueue/claim/complete protocol checks.
- Browser dataset workflow: permanent primary, right-aligned queue actions
  (continued and fresh), comparison, disable/archive/restore/delete and retained
  View more pagination.

Training tests use fixtures, not proof that a real candidate qualifies. No new
supporting model is trained, enabled or deployed merely by installing this code.
