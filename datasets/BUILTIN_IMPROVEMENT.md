# Validation-only built-in improvement experiment

`improve_builtin_sentiment.py` trains private candidates, not supporting jobs or
deployed built-ins. It never loads credentials, calls Gemini/Supabase, mutates
the source CSVs, changes labels, or opens `test.csv`.

```powershell
.\.venv-data\Scripts\python.exe -u datasets/improve_builtin_sentiment.py --output-dir artifacts/my-new-validation-run --target 0.75
```

Use a new output folder for each experiment. The search compares two
word/character TF-IDF configurations, C in 0.5/2/8/32 and balanced/unweighted logistic
regression. It uses the existing validation-only offset selector and retains the
existing per-class quality floors. The highest eligible validation macro-F1 wins
per language. The 0.75 target is reported honestly, not imposed by changing labels,
test splits, evaluation code or reported scores. No eligible model is a reported
failure, not permission to lower the quality requirements.

Outputs include joblib/ONNX candidates and `validation_report.json`, with trials,
per-class metrics, source fingerprints and export checks. Feature vocabularies and
classifier weights fit train only; validation selects settings and intercepts.
The selected model is not refitted on train+validation. No language-ID changes.

The prior English experiment revealed material Python/ONNX feature discrepancies.
`--feature-kinds aligned-word` uses explicit ASCII word tokens without runtime
lowercasing; the other kinds remain available for experiments. Export compatibility
is checked across the full validation split. `onnx_validation_metrics` reports the
actual exported predictor; a mismatch is recorded and prevents review eligibility.
Do not substitute the Python validation score for ONNX performance.

## English/Filipino labeled-data experiment (0.70 validation target)

`prepare_labeled_experiment.py` makes a new snapshot from labeled CSV collections,
preserving original heldout bytes and excluding normalized duplicates, conflicts
and heldout overlaps. Test text is used only for exclusion, not label-guided tuning.
The snapshot is experimental, not an admin-approved production training export.

Current snapshot: `artifacts/en-fil-70-20261106-snapshot/` (600 added English,
600 added Filipino examples). Candidate output:
`artifacts/en-fil-70-20261106-candidates/`.

```powershell
.\.venv-data\Scripts\python.exe -u datasets/improve_builtin_sentiment.py --data-dir artifacts/en-fil-70-20261106-snapshot --output-dir artifacts/a-new-candidate-folder --languages english filipino --feature-kinds aligned-word standard --target 0.70
```

Cebuano is not retrained. The English source is CC BY-NC-SA 4.0, so these candidates
are for noncommercial research experiments; do not deploy without completing
license/domain/privacy review. Filipino source is CC BY 4.0. Source manifests and
split fingerprints are stored in the snapshot. Neither a 0.70 validation target
nor more data guarantees a 0.70 final test result. Existing built-ins stay intact.

Validation macro-F1 is **not final test macro-F1**. Existing test results have been
examined in development, so the old test set cannot be claimed as a newly blind
research benchmark. Freeze the selected candidates and predeclare final evaluation
on independent, human-reviewed examples before research performance claims. Do not
keep tuning against test results until a target is attained.

Promotion is deliberately separate: review the report, perform the agreed final
evaluation and ONNX contract checks, back up current artifacts, then explicitly
approve deployment. Existing supporting policies are bound to built-in hashes and
may require retraining/requalification if built-ins are replaced. Do not silently
reuse those policies against different built-ins.

Offline regression tests:

```powershell
$env:PYTHONPATH='datasets'
.\.venv-data\Scripts\python.exe -m unittest test_improve_builtin_sentiment
```
