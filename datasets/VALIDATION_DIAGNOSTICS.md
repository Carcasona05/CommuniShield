# Validation failure diagnostics

Fresh and continued independent-quality training now preserve aggregate numeric
evidence when no candidate meets the existing validation requirements. Admission
thresholds, candidate selection, inference, and built-in artifacts are unchanged.

- Fresh: each C/class-weight configuration records how many class-offset settings
  were examined and qualified, plus its closest rejected setting's macro-F1,
  per-class precision/recall/F1/support, offsets, and failed checks.
- Continued: rejected update strengths record the same aggregate class metrics.
- The representative setting is chosen for explanation only: fewest failed gates,
  then highest macro-F1. It is not an eligible, exported or enabled model.
- `training_failure.json` contains `validation_diagnostics`. The worker bounds the
  file size and whitelists numeric fields, rebuilding reasons rather than exposing
  arbitrary marker text or private samples.
- A failed language's evaluation receipt contains `validation_metrics` and
  `validation_diagnostics`, with test evaluation explicitly marked not performed.
- The training UI displays the exact failed validation gates and rejected-trial
  summaries. Test/acceptance checks that were not reached are not shown as missing
  measurements. Older records without diagnostics remain honestly incomplete.

Restart the Python worker and deploy/reload the updated client to see these
diagnostics on subsequent runs. No SQL migration is required. Existing database
records are not rewritten and cannot acquire metrics they never recorded.

For a separate local reproduction, use a new private output directory:

```powershell
.\.venv-data\Scripts\python.exe datasets/train_sentiment.py --data-dir datasets/training-runs/<run-id>/data --output-dir <new-private-output-directory> --languages filipino --independent-quality --validation-only
```

This fits local diagnostic candidates using the saved training snapshot and scores
validation only. It neither reads test.csv nor claims jobs, uploads artifacts or
changes deployed models. A reproduced validation rejection exits nonzero normally;
inspect its `training_failure.json` instead of treating that exit as a crash.

Diagnostics alone do not fix inherited-validation leakage. The subsequent
continuation-validation and export repairs are documented in `TRAINING_REPAIRS.md`;
they reserve new examples rather than relaxing quality requirements.
