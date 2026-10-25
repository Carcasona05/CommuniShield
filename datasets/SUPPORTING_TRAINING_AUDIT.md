# Supporting candidate training audit and validation-only repair

> Old trial upload CSVs and generated trial reports were removed during schema
> finalization. The findings below remain as historical diagnostic context, not
> recommendations to upload those failed examples. See `uploads/README.md`.

## Why another small CSV was not the solution

The 270 authored additions are only 90 per language, compared with 56,377 English,
19,963 Filipino and 26,785 Cebuano baseline training examples. Generic examples
cannot reliably repair weaknesses in those large, mixed-domain corpora.

The initial audit read **training and validation only**, not `test.csv`. It found:

- Filipino validation neutral precision was about 0.453. Of 1,097 predictions of
  neutral, only 497 were labelled neutral: 230 were labelled negative and 370
  positive. Neutral recall was 0.584, so simply predicting fewer neutral labels
  risks failing recall instead. This is a precision/recall problem, not a minimum
  upload-count problem.
- English selected accepted-prediction validation precision was 0.7585 on 2,642
  predictions: a marginal pass, not strong evidence of generalization.
- Training has many isolated words: 9,586 English, 7,162 Filipino, and 9,037
  Cebuano. Community sentences, tweets, shopping reviews and mined words are
  mixed. A shopping review's rating is not necessarily its expressed sentiment.
- `build_single_words.py` read raw validation/test rows when mining word labels.
  It also interpreted Filipino raw codes as 1–5 stars even though the raw files
  use 0–4, and processed sentence labels use 0/1 negative, 2 neutral, 3/4 positive.
  This is a provenance risk, **not proof every existing word is wrong**: later
  relabelling and handwritten lexicons also contributed. Do not mass-relabel the
  corpus or change the benchmark without an independent human review.
- Validation error inspection exposed apparent semantic label issues too: an
  explicitly happy product review is labelled negative, while an explicit scam
  complaint is labelled neutral. These are human-review candidates, not automatic
  corrections. Rating-derived review labels may conflict with the intended task
  of expressed sentiment, and mixed sentiment requires a written annotation rule.
- Training had one normalized duplicate key and zero conflicting keys; baseline
  train/validation overlap was zero. Existing worker overlap protections remain.

## Repairs under evaluation

1. New **independent fresh** fits select class offsets with the same absolute
   0.60 macro-F1, 0.50 per-class precision/recall, and 10 examples/class floors
   already required by admission. Selection never uses built-in metrics.
2. Evaluate balanced versus natural class weighting, C in the existing grid,
   and word trigrams for independent fresh fits. Features/classifiers fit only
   training rows; only validation chooses the exported candidate.
3. Accepted-prediction thresholds require a Wilson 95% lower precision bound
   of 0.75 on validation. This stricter *selection* safeguard avoids treating
   observed precision just above 0.75 as robust. Final test admission remains
   unchanged: precision ≥0.75, ≥10 accepted predictions and all class floors.
4. Independent continued updates now check per-class validation precision too.
5. Future word mining reads raw training only, uses the correct zero-based raw
   label mapping, restricts Cebuano worksheet sources to training assignments,
   and writes derived additions to training only. No existing CSV was rebuilt.

The old built-in/offline comparative path retains its default behavior. No
built-in model files, approved database data, benchmark labels or admission gates
are overwritten. Failing selection must stop, not relax floors.

## Reproduce without test access

### Observed validation-only run

The first revised full-snapshot run completed model selection for Cebuano
(validation macro-F1 0.7282) and English (0.6915), but **stopped at Filipino**.
None of the eight Filipino C/class-weight configurations had an offset setting
meeting all required validation class-quality floors. This is not a passing bundle:
no Filipino artifact was published, ONNX parity/acceptance was not confirmed for
the partial bundle, and no final test check was performed. The trainer correctly
failed instead of relaxing precision/recall requirements. The next blocker is a
human-reviewed training/benchmark label audit, not another generic upload CSV.

Run from the repository root using the training virtual environment:

```powershell
.\.venv-data\Scripts\python.exe datasets/audit_supporting_training.py --out <private-audit-directory>
.\.venv-data\Scripts\python.exe datasets/train_sentiment.py --data-dir <worker-snapshot-data> --output-dir <private-candidate-directory> --independent-quality --validation-only
.\.venv-data\Scripts\python.exe datasets/check_supporting_validation.py --data-dir <worker-snapshot-data> --candidate-dir <private-candidate-directory> --out <private-validation-report.json>
```

`--validation-only` never opens, hashes or scores `test.csv`. The validation checker
verifies exported ONNX/sklearn probability and prediction parity and records exact
candidate hashes. Only a frozen validation-qualified candidate should receive one
final untouched-test admission check; do not iterate on the test failures.

The current baseline test has already been used repeatedly in past development,
and the word-mining provenance limits its independence. Even a final pass would
not establish real-world accuracy: commission a new, human-reviewed domain
benchmark before making deployment-quality claims.

For human review, use at least two fluent reviewers, the same sentiment rubric,
and adjudication for disagreements. Keep original labels and provenance next to
proposed labels. Any benchmark correction must be a versioned, independently
reviewed dataset release, not an edit made because a candidate got it wrong.

Diagnostic `validation_errors_review.csv` is review-only: never upload its rows as
training examples. Do not infer "neutral" from the absence of emotional keywords,
or infer negative sentiment from an incident's danger/severity.
