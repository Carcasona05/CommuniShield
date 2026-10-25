# Sentiment datasets: setup and workflow

**Current workflow:** see [SENTIMENT_INDEPENDENT_ADMISSION.md](SENTIMENT_INDEPENDENT_ADMISSION.md)
and apply `sentiment_independent_admission.sql` after the fresh-candidates migration.
Approval only collects reviewed data; super-admins queue training and enable
qualified models explicitly. One-row/one-word submissions are allowed with
context review. Automatic-training references below describe the legacy protocol.

**Supporting-pool upgrade:** see `server/SENTIMENT_SUPPORTING_POOL.md` and apply
`sentiment_training_jobs.sql`, then `sentiment_continued_training.sql`, after
the migration below, then `sentiment_supporting_pool.sql`. Approval queues a
separate supporting candidate. Only full-pool evaluated policies can serve;
the built-in models are never replaced. The export
workflow below remains useful for review and offline operation.

## Deployment prerequisite

Run `DB_Schema/migrations/sentiment_datasets.sql` in the Supabase SQL editor,
then deploy/restart the server and refresh the client. The migration is additive
and repeatable. No fake UI examples are imported and no existing models change.
No additional hosting service, API key, or client package is required.

## Roles and lifecycle

- Admin: submit manual examples / CSV batches, inspect history, edit or withdraw
  their own **pending** datasets.
- Super admin: use **Sentiment Datasets** in the super-admin sidebar to review,
  approve/reject, archive, and export. Rejection requires a reason.
- Status: `pending → approved / rejected`, then optionally `archived`.
- Approval makes examples eligible for export. It does **not** mean they have
  been trained or deployed. There is deliberately no fake “Included in training”
  toggle: inclusion must refer to an actual training run/model snapshot. The new
  automatic-training panel tracks those runs separately.
- Approved/rejected/archived examples cannot be edited. Submit a revised batch
  after archiving/rejection; old samples, edit snapshots, and reviewer names remain.
  If the active model already learned a removed or relabelled example, continued
  training stops: removing its influence requires an appropriate rollback or a
  separately reviewed full rebuild, not merely archiving the source row.
- Mutations are transactional, use optimistic dataset versions, and serialize
  duplicate checks. Normal browser/anonymous roles cannot access these tables or
  call the mutation RPC directly. API access requires an approved admin session.

## Import format and quality

UTF-8 CSV up to **2 MB / 1,000 examples**, with exactly these headers (any order):

```csv
text,language,label
"Maayo kaayo ang serbisyo",cebuano,positive
"Naay meeting ugma",cebuano,neutral
```

Languages: `english`, `filipino`, `cebuano`. Labels: `positive`, `neutral`, `negative`.
Text: 1–2,000 characters. Quoted commas, escaped quotes, and multiline cells work.
Preview does not write data. Only the clearly indicated valid rows are submitted.
Server validation runs again at submission; competing concurrent uploads return
a conflict, never partial writes. Duplicate/conflict matching uses normalized
language + text (case/whitespace insensitive) across pending/approved DB examples.
Rejecting/archiving releases the active duplicate key but retains history.

Admins must attest that they reviewed privacy and usage rights. This is a human
review, **not** an automatic personal-information detector. Avoid personal names,
phone numbers, addresses, account details, and copyrighted/private source text.
Label the expressed sentiment, not the severity of the incident. Prefer full
context over ambiguous standalone words. Review class/language balance before training.

## Export and controlled training

- **Training JSON** preserves exact text and includes dataset ID/version/status.
- **Safe CSV** is for spreadsheet review: formula-like cells are prefixed with an
  apostrophe. Do not train directly from this review CSV.
- Every export records an audit event with version, format, and count.
- Export artifacts must remain private; use a trusted training operator/runner.

The explicit offline bridge is:

```powershell
python datasets/import_approved_sentiment.py --dataset approved.json
python datasets/import_approved_sentiment.py --dataset approved.json --output-dir datasets/reviewed-run-1 --apply
python datasets/train_sentiment.py --data-dir datasets/reviewed-run-1 --output-dir datasets/candidate-run-1
```

The first command is a dry run. The merge writes **a new snapshot**, appending
only new non-conflicting training examples. Validation/test files are copied
unchanged and their examples are excluded from imports to prevent leakage.
This is also where imports are deduplicated against your original training corpus;
the web preview only knows about DB examples, not local CSV files.

Use the final language-scoped worker described in
`SENTIMENT_LANGUAGE_SCOPED_TRAINING.md`. Each selected language is evaluated
independently; passing candidates require explicit super-admin enabling. Approval
does not start training. The unsafe historical `retrain_all.py` repair-and-copy
wrapper was retired; it is not part of the supporting-model flow. Built-ins are
permanent, and old report sentiment is unchanged unless explicitly reanalyzed.

## Verification

```powershell
cd server
npm test
```

`../tests/server/SentimentDataset.test.ts` covers CSV parsing, normalization, validation,
duplicates/conflicts, permissions/errors, previews, version passing, and exports.
For real PostgreSQL transaction checks without touching Supabase, install
`@electric-sql/pglite@0.5.10` in a temporary folder, set `PGLITE_MODULE` to its
`dist/index.js` **file URL**, then run:

```powershell
node --test ../tests/database/sentimentDataset.postgres.mjs
```

These tests run the actual migration twice, verify atomic rollback, uniqueness,
ownership, role restrictions, immutable approved examples, history, and exports.

Optional browser smoke test: export the web app, install `playwright-core` in a
temporary folder, set `PLAYWRIGHT_MODULE` to its `index.mjs` file URL,
`WEB_EXPORT_DIR` to the export folder, and `CHROME_PATH` to a local Chrome
executable. From `server`, run:

```powershell
node --import tsx --test ../tests/browser/sentimentDataset.browser.mjs
```

This uses the real exported UI and CSV parser with a mocked API to verify manual
entry, file selection, invalid/duplicate preview rows, refresh, admin ownership
controls, and the super-admin approval confirmation. It does not use production
accounts or write to Supabase.
