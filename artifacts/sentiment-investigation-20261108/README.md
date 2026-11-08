# English / Filipino supporting-model investigation

This file records the initial investigation. Subsequent implementation and
isolated candidate results are in `PIPELINE_REPAIRS.md`; exact Filipino validation
diagnostics are in `FILIPINO_VALIDATION.md`.

Investigation only: no new fitting, worker claims, remote database calls, model
deployment, threshold changes, or source-dataset changes were performed.
Existing candidate files were checked with validation-only inference. Test numbers
below come from the runs' saved `evaluation.json`, not a new test evaluation.

## Runs examined

- `datasets/training-runs/b47d88e7-a5b8-427e-8822-9ddfe7f1f55c/`: continued,
  1,000 added examples (388 English, 386 Filipino, 226 Cebuano).
- `datasets/training-runs/cd0f7f05-4322-46d9-afca-a1ab9dc75e8e/`: fresh,
  1,000 added examples; matches the screenshot's 0.848 Cebuano precision.
- `datasets/training-runs/65104798-31a2-4d5d-9438-2265e794e775/`: fresh,
  Filipino only, 450 added examples.

## Observed rejection reasons

| Run / language | Saved result | Gate |
| --- | --- | --- |
| Continued / English | Accepted test precision 0.7027051398 on 11,090 predictions | Must be >= 0.75 |
| Fresh / English | Accepted test precision 0.7163113006 on 9,380 predictions | Must be >= 0.75 |
| Continued / Filipino | Test neutral precision 0.4650735294 | Every class must be >= 0.50 |
| Fresh / Filipino, both runs | All eight C/class-weight configurations failed validation offset selection | Exact failed metrics were not persisted |

Filipino's continued candidate did pass the acceptance-specific test gate:
0.7984873042 precision on 1,851 accepted predictions. It was correctly rejected
because the separate overall test neutral-precision requirement failed.

English's fresh accepted validation precision was 0.7871222076 (2,283 predictions,
confidence >= 0.5, margin >= 0.2), but test precision fell to 0.7163113006.
The threshold selector uses validation only; it must not be retuned on test data.
English's positive-class precision fell from 0.7656612529 on validation to
0.5949778434 on test. Positive-label prevalence also differs: 1,349/3,335 validation
examples versus 2,898/13,646 test examples. These demonstrate a generalization gap;
they do not by themselves establish its full cause or blame the uploaded labels.

## Confirmed historical-validation problem in continued training

The historical trainer refitted its chosen pipeline on `train + validation` before
exporting the built-ins (visible in `git show 6c76332:datasets/train_sentiment.py`).
The trusted backup metadata has matching combined counts:

- English: 59,712 = 56,377 training + 3,335 validation.
- Filipino: 23,237 = 19,963 training + 3,274 validation.

The continuation worker correctly starts from a fingerprint-matched copy, but the
copy has already seen those validation examples. Removing overlaps from the new
training snapshot cannot remove information already present in inherited weights.
`continue_sentiment.py` then selects update strength on the same validation split;
`independent_support.py` calibrates confidence/margin rules on that split too.
Consequently it cannot be treated as an independent validation set for this state.

Read-only inference reproduced the continued candidate's ONNX validation macro-F1:

- English: 0.9749712969, versus saved test macro-F1 0.6565943611.
- Filipino: 0.7765004391, versus saved test macro-F1 0.6517838339.

The unmodified trusted bootstrap states themselves score 0.9766169418 (English)
and 0.7797140798 (Filipino) on validation in Python. Their historical metadata
contains earlier selection-model validation scores, not the refitted states'
independent validation performance. The test gates prevented these candidates
from becoming eligible merely on the inflated validation results.

Fresh training fits training rows only, so this inherited-state problem does not
explain Filipino's fresh validation rejection or English's fresh test failure.

## Export differences exist but are not the only explanation

Validation-only Python/ONNX checks, without fitting or changing artifacts:

| Candidate | Label disagreements | Python macro-F1 | ONNX macro-F1 |
| --- | ---: | ---: | ---: |
| Continued English | 14 / 3,335 | 0.9760017457 | 0.9749712969 |
| Continued Filipino | 10 / 3,274 | 0.7747862123 | 0.7765004391 |
| Fresh English | 31 / 3,335 | 0.6918024207 | 0.6909533171 |

The worker evaluates exported ONNX probabilities, so the displayed admission
results are not mistakenly using Python scores. Export parity still deserves a
separate fix; these validation differences alone do not explain all failures.
Filipino's fresh rejection occurs before export and cannot be caused by ONNX.

## Missing diagnostics

`train_sentiment.py:select_validation_offsets` returns `None` if no setting meets
all class floors. `TrainingQualityError` and `training_failure.json` retain only a
generic message. The worker and independent evaluator consequently cannot display
the rejected configurations' class metrics. The log confirms all eight attempts,
but does not identify which metric blocked each one.

## Recommended next work (not performed)

1. Preserve safe, aggregate validation trial metrics and exact failed gates in the
   trainers, failure markers, worker receipts and UI. Never include private texts
   or reinterpret a failed candidate as passing.
2. Use an independently held-out calibration set never seen by the inherited
   training state, or explicitly provision a training-only continuation state with
   its own fingerprint/provenance. Never substitute an unrelated joblib state for
   the deployed built-in, or split out rows already learned and call them unseen.
3. If exact fresh Filipino failure metrics are required for these old runs, perform
   a separately approved offline, validation-only reproduction of their snapshots;
   rejected fitted candidates were not saved. Do not repeatedly tune against test.
4. Investigate feature/export parity separately. Keep current quality requirements,
   built-ins, source splits and already deployed models unchanged.
