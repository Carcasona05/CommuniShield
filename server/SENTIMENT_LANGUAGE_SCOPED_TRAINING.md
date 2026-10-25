# Language-scoped supporting candidates

Apply **`DB_Schema/migrations/sentiment_language_scoped_training.sql`** after
`sentiment_pending_training_summary.sql`, then restart the backend and worker.
The migration is transactional and rerunnable. It changes no built-in file,
baseline CSV, existing model activation, saved report, or historical result.
The updated API and worker pause new training until the migration is installed;
old worker claims are rejected after installation.

## Scope comes from approved row labels

All seven nonempty combinations of `cebuano`, `english`, and `filipino` work.
Row order does not matter. The system uses the declared `language` column, not
automatic text detection. A mixed-language sentence still needs one reviewed
language label; this feature does not invent cross-language labels for it.

The Training tab optionally lets a super-admin select recently approved datasets.
Their active row languages determine the scope. Without explicit selection,
new approved dataset versions not referenced by a finished attempt determine it.
If there are no such versions, a deliberate retry keeps the last recorded scope
(or all approved languages when no scoped run exists yet).
The queue response and run card record the chosen languages. Choosing datasets
selects languages, not an exclusive training corpus: baseline training rows and
all approved examples **within those languages** remain available for fitting.
Therefore older English/Filipino approvals do not force a *new Cebuano-only*
dataset to train those languages. Explicit dataset selection removes ambiguity
when multiple new datasets are waiting.

The service-only `manage_sentiment_training` accepts an optional
`p_payload.dataset_ids` list; IDs must refer to approved datasets with active
examples. Queue/claim transactions freeze `training_languages` and snapshot
`requested_languages`, `scope_version: 1`. Workers cannot broaden scope through
a completion payload. Empty and unsupported scopes are rejected.

## Independent outcomes

Each requested language runs in its own subprocess and private output directory.
Known validation-quality rejections are captured without discarding another
language's work. Unexpected crashes, lease failures and corrupt artifacts still
fail closed; they are not reclassified as quality passes.

Both fresh and continued training accept explicit language scope. Each candidate
uses the same validation/test precision, recall, macro-F1 and evidence gates as
before. No gate is removed. A language that fails selection is not scored using
its built-in as a substitute. A language that fails final test is not qualified.

- All requested languages fail → failed job, no registration or upload.
- Some pass → ready job with `partial_pass: true`, named failures and **only the
  passing language artifacts**. Unincluded languages are explicitly "Not included"
  in the UI, not fabricated failures or missing measurements.
- All requested languages pass → ready job, qualified for those languages only.

Ready candidates always register **disabled**. The super-admin's Enable action
enables only the listed qualified languages; failed languages are not part of the
serving policy or artifact bundle. English + Filipino can therefore yield an
English-only support without falsely claiming Filipino passed. To enable those
two independently after both pass, train them as separate candidates.

Bundle manifests explicitly list `languages`, contain `language_id.onnx`, and
contain ONNX + trusted training state only for qualified languages. SQL verifies
scope, per-language evidence, fingerprints, lease/revision fencing and exact
artifact names. Backend checksums/downloads support partial bundles. The fixed
1–3 pool limit counts candidate bundles, not individual languages.

The permanent built-in and language router remain primary. Supports are only
proposed for their qualified matching language in the primary's uncertainty
region; qualified disagreement returns `unclear`, no voting. Other languages use
their built-ins or separately enabled matching supports. Independent eligibility
does not prove improved combined-system quality.

## Verification

- `server/tests/sentimentLanguageScope.postgres.mjs`: all seven combinations,
  reverse input order, partial qualification, explicit dataset selection, old
  mixed uploads followed by new Cebuano data, zero-qualified rejection,
  weak/missing evidence, malformed manifests and stale-worker rejection.
- Python: scoped artifact production for both fitting modes, no scoring of
  unincluded or selection-failed languages, independent partial success and
  full-failure publication safety.
- Backend: partial manifest validation, language-subset policy validation and
  role/quality checks; UI: partial outcome, skipped languages and dataset choices.

No fixture test is proof that a user's next training run passes. A real offline
check of the Cebuano artifact from failed job `aef98977…` qualified Cebuano alone
with test macro-F1 about 0.7222 and accepted-test precision about 0.8483. That
check registered/enabled nothing and verified built-in hashes unchanged; the
old failed job is not silently converted into a new ready result.
