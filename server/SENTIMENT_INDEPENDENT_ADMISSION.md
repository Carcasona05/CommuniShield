# Independent supporting-model admission

> **Language-specific upgrade:** see `SENTIMENT_LANGUAGE_SCOPED_TRAINING.md` and
> apply `sentiment_language_scoped_training.sql` after the pending-summary migration.
> Under this upgrade only dataset-selected languages train, each qualifies
> separately, and failed languages no longer block a passing subset. The all-three
> admission descriptions below document the preceding protocol.

This supersedes the comparative admission/automatic-registration-enabling parts
of `SENTIMENT_SUPPORTING_POOL.md`. The built-in is still permanent and primary.

## Install

With `sentiment_fresh_candidates.sql` already installed, apply only:

`DB_Schema/migrations/sentiment_independent_admission.sql`

Then restart the backend and, when you want to train, start the updated worker:

```powershell
.\.venv-data\Scripts\python.exe datasets/sentiment_training_worker.py --env-file server/.env
```

Do not reapply older protocol migrations afterward. The new migration is
transactional and rerunnable; no built-in model, baseline CSV, report, or saved
analysis is rewritten. It does not train anything or enable any candidate.
Legacy enabled candidates are disabled for fresh independent evaluation; legacy
results are never relabelled as new quality evidence. Old workers are rejected
at claim and old evaluation payloads are rejected at completion.

The UI shows a setup warning until the migration advertises
`independent_admission`, `manual_training`, and `manual_enable`. Installing code
alone does not install SQL in Supabase. The updated API blocks approval and
queueing, and the updated worker refuses startup until the migration is applied,
rather than silently falling back to comparative admission. Submissions and
dataset inspection remain available.

## Collection and review

1. An admin submits one or more examples (manual entry or CSV).
2. Preview checks duplicates, conflicts, supported language/labels and privacy.
3. A super-admin reviews the labels. Approval adds examples to the training pool
   and increments the data revision; it **does not auto-queue training**.
4. Apply `DB_Schema/migrations/sentiment_pending_training_summary.sql` after this
   migration for the **Ready to queue training** summary. It shows only active,
   approved dataset versions not already in a completed training run or a live
   training/evaluation job. Counts, language/class distributions, and the ten most
   recent dataset names all refer to this new-approval subset, not the cumulative
   approved library. Example: 20 trained + 180 newly approved displays **180**.
   Failed quality evaluations with stored training metadata count as trained;
   failures before fitting finishes remain pending. Earlier data remains in the
   full training inputs and can be retried manually; no rows are deleted.
5. A super-admin explicitly queues a batch. Empty reviewed pools cannot queue.

One-row and one-word contributions are allowed. The UI warns that a single word
can lack sufficient context; it does not invent a label or silently discard it.
An incident term is not automatically negative sentiment. Accumulate varied,
reviewed examples; no arbitrary upload size guarantees serving eligibility.

## Training and quality

Both fitting modes create separate candidates:

- **Queue retraining** continues trusted built-in weights with fixed vocabulary
  and replay data. Selection uses absolute validation floors under independent
  admission, not the built-in's validation scores.
- **Queue fresh challenger** fits vocabulary and classifiers from scratch on
  baseline training rows plus approved additions. No baseline model directory is
  passed to the fresh trainer for metric comparison or recall retention floors.

The built-in fingerprint is retained solely for immutable-file/routing
compatibility checks, **not score comparison**. Baseline validation and test CSVs
remain held out and are copied unchanged; overlapping uploads are excluded from
fitting. The worker's original comparative evaluators remain available for the
offline built-in tooling and legacy deployments, but the independent job path
never invokes them or downloads enabled supports for comparative evaluation.

For **each of all three languages**, the candidate must meet:

| Check | Minimum |
|---|---:|
| Validation and test macro-F1 | 0.60 |
| Precision and recall for every class, on both splits | 0.50 |
| Held-out examples per class, on both splits | 10 |
| Accepted validation predictions | 20 |
| Accepted test predictions | 10 |
| Precision among accepted predictions, on both splits | 0.75 |

Confidence/margin thresholds are selected using validation only; the untouched
test split confirms those thresholds, and is never used to choose them. Selection
now requires a Wilson 95% lower precision bound of 0.75 before preferring accepted
evidence breadth, then validation precision. This is a stricter validation
selection safeguard, not a relaxation of any held-out test gate. Fresh independent
fits also select under absolute per-class precision/recall floors, with validation
choosing class weights and offsets. See `datasets/SUPPORTING_TRAINING_AUDIT.md`
for findings and validation-only development commands. The policy is
version 2, admission `independent-v1`, and records all per-class measurements and
accepted-test precision/counts. SQL independently enforces the required evidence
and fixed routing boundaries; a client cannot enable a model with just `passed`.

No built-in score is measured in this admission path; there is no relative F1,
relative recall, pool-coverage, or improvement requirement. Failing quality
publishes no candidate artifacts. Passing quality registers the model
**disabled**, with a "Ready for super-admin review" notice. Registration never
enables serving, even when slots are available.

The Training run card shows failing checks immediately, with their observed
values, required minimums, and explicit pass/fail labels. Expand a language's
"all quality checks" section to inspect every validation/test metric and evidence
count. Macro-F1 alone is never presented as overall eligibility. Missing evidence
in older runs is labelled "Not recorded", not fabricated or interpreted as a pass.
New runs retain validation acceptance counts/precision and selected thresholds
even when the later test check fails; this is extra reporting evidence, not a
change to the admission thresholds or results.

These thresholds are explicit operational floors, not a claim of deployment
readiness in every setting. Benchmark label quality and repeated testing remain
limitations. Before making accuracy claims, evaluate a truly independent,
human-reviewed domain benchmark that has not been repeatedly used for selection.

## Manual enabling and inference

Only an active super-admin can enable a disabled, independently qualified
candidate. The API checks its complete ONNX bundle, evidence and built-in
fingerprint; SQL checks role, pool generation, evidence, compatibility and the
1–3 enabled-model limit. Archive/restore/delete remain explicit lifecycle actions.
Old policies cannot bypass the independent gate by clicking Enable.

The built-in language router and primary sentiment model always run first.
Independent supports are consulted only when primary confidence is below 0.85
**or** its top-two margin is below 0.20. Supports must meet their validation-selected
confidence and margin thresholds. A qualified disagreement with the primary or
between supports returns `unclear`, regardless of majority size. No qualified
support in an eligible region also returns `unclear`; confident primary results
are retained. Missing/unavailable supporting artifacts fall back safely as before.

Independent quality does **not** prove the combined system improves. Because
qualified disagreement abstains, coverage may decrease. The new policy does not
claim that the old full-pool improvement/coverage guarantees still hold. If that
tradeoff is unacceptable, keep supporting inference off and review independently.

`SENTIMENT_MODEL_REGISTRY_ENABLED=true` permits registration; backend
`SENTIMENT_SUPPORT_ENABLED=true` separately opts in to supporting inference.
Neither is changed by this feature. Existing reports/analyses are untouched.

## Progress and verification

```powershell
.\.venv-data\Scripts\python.exe datasets/worker_progress.py --env-file server/.env --watch
```

Training subprocess output is unbuffered so progress is visible while fitting.
The monitor identifies independent results as awaiting manual review, not enabled.

- Python tests: independent per-class/evidence gates, validation-only threshold
  selection, no baseline scoring, no comparative selection in either mode,
  worker artifact preservation and failing candidates publishing nothing.
- `server/tests/sentimentIndependentAdmission.postgres.mjs`: actual PostgreSQL,
  migration applied twice, one-row approval without training, manual queue/enable,
  malformed/weak evidence, worker fencing, private helper grants and pool limits.
- Backend tests: independent policy parsing, primary/support disagreement,
  super-admin authorization and capability-gated readiness summaries.
- Browser test against a new Expo export: manual approval/queue/enable flow,
  candidate-only quality display, single shared Refresh control and pagination.

No live training or live enabling is performed by these tests.
