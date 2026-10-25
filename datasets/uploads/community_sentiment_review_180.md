# Community sentiment review set

Upload **`community_sentiment_review_180.csv`** in Sentiment Datasets → CSV upload.
The CSV uses exactly `text,language,label`, matching the app's import format.

## Contents

- 180 authored examples, not collected reports or personal data.
- Cebuano, Filipino and English: 60 examples each.
- Each language: 20 negative, 20 neutral and 20 positive examples.
- Community-service contexts, explicit worry/disappointment, straightforward
  factual observations, gratitude and relief. Neutral statements do not become
  negative merely because they mention a missing item or an incident report.

These are **AI-authored draft labels**, not independently human-annotated ground
truth. Review the texts and labels, ideally with fluent speakers, before approval.
The language groups include parallel/translated situations; do not treat all rows
as independent evidence of broad real-world coverage.

This is supplementary **training data**, not a test benchmark. Do not add these
rows to validation/test splits or change evaluation gates to obtain a passing
result. Passing evaluation or improving Cebuano negative recall is not guaranteed.
The previous failed candidate also retrained the full baseline, so these 180 rows
alone may not resolve the regression.

## Checks performed

At creation, all 180 rows passed the app's actual CSV parser and row validation.
The live read-only dataset preview reported no duplicates or label conflicts.
The worker's language-aware normalized text keys found zero exact overlaps with
the local baseline train, validation and test files. This is an exact normalized
text check, not a guarantee against semantic similarity or annotation mistakes.

## Import

1. Open Sentiment Datasets and choose the CSV import tab.
2. Upload the CSV and inspect the preview. Resolve any duplicate/conflict warnings.
3. Give the dataset a descriptive name such as `Community sentiment review 180`.
4. Complete the privacy review and submit.
5. Have a super admin review and approve the dataset.
6. Keep the Python worker running. Approval queues retraining automatically;
   use Queue retraining if a fresh job is needed for already-approved data.
7. Review evaluation results. With the continued-training migration installed,
   a complete, passing and up-to-date update activates automatically. A failed
   evaluation keeps the current active model.

No upload, approval, retraining or model activation is performed by creating
these files. There are deliberately no simulation prefixes in training texts:
such repeated tokens would be spurious features. The synthetic provenance is
documented here instead of adding unsupported CSV metadata columns.
