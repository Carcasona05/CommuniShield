# English accepted-precision diagnosis

Existing frozen English candidates from runs
`cd0f7f05-4322-46d9-afca-a1ab9dc75e8e` (fresh) and
`b47d88e7-a5b8-427e-8822-9ddfe7f1f55c` (continued) were re-examined.
No fitting, threshold search, deployment, database mutation or source changes.
This reuses their previously evaluated validation/test splits for error diagnosis;
it is not a new independent benchmark or a model-selection experiment.

## Fresh candidate

Frozen acceptance rule: confidence >= 0.5 and top-two margin >= 0.2.

| Split | Accepted | Correct | Accepted precision |
| --- | ---: | ---: | ---: |
| Validation | 2,283 | 1,797 | 78.7122% |
| Test | 9,380 | 6,719 | 71.6311% |

The required accepted test precision is 75%; rejection was correct.
The candidate passed the separate overall test macro-F1/class-quality gates.

### Accepted test predictions by predicted class

| Predicted label | Accepted predictions | Precision |
| --- | ---: | ---: |
| Negative | 3,600 | 69.4167% |
| Neutral | 3,314 | 77.0670% |
| Positive | 2,466 | 67.5588% |

These are explanatory per-predicted-class breakdowns, not additional admission
thresholds: the 75% acceptance requirement applies to the accepted set overall.

Accepted test confusion matrix, rows=stored actual label, columns=predicted label:

| Actual / predicted | Negative | Neutral | Positive |
| --- | ---: | ---: | ---: |
| Negative | 2,499 | 440 | 133 |
| Neutral | 962 | 2,554 | 667 |
| Positive | 139 | 320 | 1,666 |

There are 2,661 accepted errors. Of these, 1,629 (about 61.2%) are stored-neutral
examples predicted negative or positive. Positive accepted precision falls from
82.7902% on validation to 67.5588% on test; negative precision is weaker on both
(70.1220% validation, 69.4167% test).

Label prevalence also differs across splits: positive examples are 1,349/3,335
validation rows versus 2,898/13,646 test rows. This is evidence of a distribution/
generalization mismatch, not proof of any single cause or incorrect upload labels.
An annotation/domain audit is still needed before assigning causes to individual
mistakes or changing training data.

## Export is not the primary explanation for this failure

The saved Python pipeline at the SAME fixed rule has accepted test precision
71.5216% (6,703/9,372), versus ONNX 71.6311% (6,719/9,380). Both fail 75%.
There are 149 Python/ONNX test label disagreements out of 13,646 examples.
The export mismatch deserves repair, but fixing parity alone does not establish
that this candidate would pass. No thresholds were retuned on these test results.

## Continued candidate

Frozen rule: confidence >= 0.5, margin >= 0.05.

| Split | Accepted | Correct | Accepted precision |
| --- | ---: | ---: | ---: |
| Validation | 3,214 | 3,162 | 98.3821% |
| Test | 11,090 | 7,793 | 70.2705% |

Accepted test precision by predicted label: negative=67.7830%, neutral=74.4354%,
positive=67.3973%. Python accepted test precision is 70.1903%; ONNX is 70.2705%.

The original investigation found that the historical warm-start state had already
learned validation rows. That makes this validation calibration optimistic. The
new failure diagnostics do not fix that separate continuation-validation problem.

## Next steps

- Review label consistency and representative neutral-versus-emotional training
  examples; collect independently sourced contrastive examples as appropriate.
- Do not copy test mistakes into training while retaining them in the test set.
- Preserve passing/failing thresholds and diagnose the confidence-calibration gap
  using validation or a genuinely independent calibration set, never by searching
  the existing test results for a passing threshold.
- Fix the inherited-validation setup before relying on continued calibration.
- A model or data change must undergo separately planned evaluation; none was
  made or claimed to pass during this investigation.
