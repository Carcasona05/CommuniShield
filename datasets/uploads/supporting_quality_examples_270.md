# Supporting quality examples: 270-row upload

Upload file: `supporting_quality_examples_270.csv`

## What this file is

These are newly authored **synthetic training examples**, not collected resident
reports, human-review evidence, or proof that a candidate will qualify. Review
the wording and labels with fluent speakers before approval, especially Cebuano.
There are no real names, addresses, telephone numbers, or account identifiers.

| Language | Positive | Negative | Neutral | Total |
|---|---:|---:|---:|---:|
| English | 30 | 30 | 30 | 90 |
| Filipino | 30 | 30 | 30 | 90 |
| Cebuano | 30 | 30 | 30 | 90 |
| Total | 90 | 90 | 90 | 270 |

The examples contrast explicit satisfaction/dissatisfaction with factual notices.
They include negation and complaints that must not be labelled neutral, and
factual incident descriptions that must not automatically be labelled negative.
Sentiment describes expressed attitude, not incident severity or danger.

## Validation and limits

- Headers: `text,language,label`.
- All 270 rows pass the app's actual `parseDatasetCsv` / `validateDatasetRows`.
- No normalized duplicate text/language keys or conflicting upload labels.
- No overlap with baseline training, validation or test split keys.
- This file is small compared with the existing baseline training corpus.
  It may help with these patterns but cannot guarantee improved held-out quality.
- No held-out examples were copied into it. Evaluation thresholds and built-in
  models are unchanged. Do not modify labels or weaken gates just to force a pass.

## How to use

1. Add data → Import datasets → choose the CSV.
2. Validate and preview all 270 examples. Review language/label quality and privacy.
3. Submit for super-admin review; approve only after reviewing the labels.
4. Start the worker when ready, then explicitly queue a **fresh challenger**.
5. Inspect all required checks. Passing import validation does not mean passing
   model evaluation. A quality-passing candidate still requires manual enabling.

## Offline result: failed quality checks

One fresh-training evaluation completed with the file fixed in advance, in
335.5 seconds. All 270 examples entered training, with no duplicates, conflicts,
or held-out overlaps. The candidate **did not qualify**:

- English accepted test precision remained below 0.75.
- Filipino neutral precision remained below 0.50 on validation and test.

Full measurements: `supporting_quality_examples_270_check.json`.
Do not use this CSV expecting a passing model: it is valid training input, not a
successful qualification result. No artifacts were uploaded, no live database
records were added, no model was enabled, and built-in fingerprints were verified
unchanged. Further work needs a training-data/model-selection investigation, not
repeatedly rewriting examples to fit the test labels or weakening the gates.
