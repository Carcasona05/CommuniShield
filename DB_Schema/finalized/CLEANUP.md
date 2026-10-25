# Finalization cleanup

The following were removed because they are not required by the running app,
current training worker, schema generator, or test suite:

| Removed | Reason |
|---|---|
| `datasets/uploads/community_sentiment_review_180.csv` and `.md` | Old trial upload, not a verified qualification dataset. |
| `datasets/uploads/fallback_uncertain_dataset.csv` | Old comparative-cascade trial upload, not a final runtime dependency. |
| `datasets/uploads/fallback_feasibility.json` | Generated feasibility output for an earlier admission experiment. |
| `datasets/uploads/supporting_quality_examples_270.csv`, `.md`, `_check.json` | Failed trial upload and machine-specific generated report; not a recommended dataset. |
| `datasets/progress.py` | Retired word/compliment-generation progress display; current worker monitoring uses `worker_progress.py`. |
| `datasets/retrain_all.py` | Unsafe historical repair/refit/copy wrapper that overwrote built-ins; not used by final supporting-model training. |
| `artifacts/expressive-comments/progress.json` | Disposable, generated seed progress checkpoint. The script recreates it. |
| `artifacts/private-test-analysis/progress.json` | Disposable, generated private-test checkpoint. The script recreates it. |
| Empty `New folder/` | Unused local placeholder directory. |

The two seed-checkpoint directories are now ignored. No runtime script was
removed from the app, and no seed script was executed by this cleanup.

## Deliberately preserved

- All built-in ONNX models and matching trusted training state.
- Baseline training/validation/test data, raw-source data, and private local runs.
- Historical model-evaluation/provenance artifacts and dataset-merge manifests.
- Database base schema sources and ordered migrations (used by the finalized
  generator and migration regression tests).
- Test fixtures and optional synthetic/demo seeding tools; these are useful for
  regression tests and are explicitly excluded from the production install.
- Offline audit/retraining/import tools and their tests. "Not imported by the
  server" does not mean a maintenance tool is unnecessary.
- Private `_legacy` SQL functions: the current wrapper protocol still calls them.
- `.env` files, dependencies, the virtual environment, running-app assets and
  existing database contents.

Historical work logs can still mention removed experimental filenames. Those
mentions describe past work, not executable runtime dependencies or current
setup instructions.
