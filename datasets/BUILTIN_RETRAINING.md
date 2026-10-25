# Safely rebuild the built-in sentiment models

This is a separate full vocabulary/model rebuild, not the deferred supporting
model design and not an automatic continued-training job.

From the project root:

```powershell
.\.venv-data\Scripts\python.exe -u datasets/retrain_builtin_models.py
```

The command stages candidates for Cebuano, English and Filipino under
`datasets/training-runs/builtin-retrain-<timestamp>-<id>/`. It does not change
served models, the active registry pointer, stored analyses or canonical data.
Language identification is preserved unchanged.

## Recipe and review

- Original training data plus balanced, authored contrastive examples from
  `builtin_sentiment_examples.py`. These draft labels need fluent-speaker review;
  they are not collected real reports or independently annotated ground truth.
- Shared incident topics and places occur in every sentiment class. Appreciation
  about a helpful fire report is not automatically negative; explicit fear is
  not neutral merely because the text describes an incident.
- Word uni/bi/trigrams plus character features provide more local context for
  negation. C and bounded intercept adjustments are selected on validation only.
- Feature/classifier fitting uses training rows only. Validation/test files are
  copied byte-for-byte. Normalized overlaps, contradictory training duplicates,
  duplicate rows and the three exact reported examples are excluded from the
  new training snapshot, without editing canonical files.
- The reported examples and targeted contrastive checks are **regression checks,
  not an independent generalization benchmark**. Broader evaluation still uses
  the unchanged test set. Do not repeatedly tune parameters against its results.

Inspect `report.json`, `data/authored_additions.csv` and the before/after checks.
Per-language installation eligibility requires:

1. ONNX test macro-F1 improvement of at least 0.001.
2. No test accuracy loss greater than 0.005.
3. No sentiment class recall loss greater than 0.02.
4. No previously correct targeted regression becoming incorrect.
5. For Cebuano, all three reported cases must be correct.

Candidates that fail are retained for inspection, but the staged `selected/`
bundle keeps that language's existing built-in model. It is possible that no
candidate qualifies. No threshold is weakened to manufacture success.

## Installation is a separate deliberate step

Only after reviewing an accepted run:

1. Ensure **Currently in use** is the built-in model. A remote registry model
   remains active regardless of which built-in files are installed locally.
2. Stop the backend and **all** training workers. The script cannot safely switch
   a multi-file bundle while another process is reading it.
3. Run, substituting the actual staging directory:

```powershell
.\.venv-data\Scripts\python.exe datasets/retrain_builtin_models.py --install "datasets/training-runs/builtin-retrain-<timestamp>-<id>" --services-stopped
```

The installer refuses changed source files or a modified staged bundle. It
backs up the originals during staging, installs matching ONNX/joblib states and
metadata, and restores previous files if a replacement fails. Backups remain in
that run's `backup/` directory. Installation is offline maintenance, not a claim
of an atomic hot-swap across running services.

Restart the backend and worker afterward; deploy/redeploy the updated model files
if your backend runs remotely. Built-in sessions are cached, so restarting is
necessary. Existing saved sentiment labels require an explicit reanalysis to
reflect new weights; installation never rewrites them silently.

Because training data and model binaries are private/large, all staging files
live under the already git-ignored `datasets/training-runs/` path.
