# Kaggle labeled replacement: English available, Filipino/Cebuano blocked

Use `artifacts/kaggle-sentiment-20261106-verified-labels/english_labeled.csv`
instead of the earlier unlabeled English review sheet. This batch contains 600
source-labeled sentences: 200 negative, 200 neutral, 200 positive. No blank or
machine-invented sentiment labels. Existing train/validation/test data and models
were NOT replaced. The old review collection is retained as history, not training.

## Verified source

- Kaggle: https://www.kaggle.com/datasets/crowdflower/twitter-airline-sentiment
- Dataset version 4, `Tweets.csv`.
- Kaggle card: contributors annotated positive/negative/neutral sentiment about US
  airlines. Labels are preserved unchanged; annotation confidence >= .8 retained.
- License declared on Kaggle: **CC BY-NC-SA 4.0**. Noncommercial and share-alike
  conditions matter. Preserve attribution to the source; check the complete terms
  and any platform requirements before research publication, redistribution or app
  training. Do not assume this is cleared for commercial deployment.
- Domain: airline service feedback, not Philippine community safety. Spot-check
  labels and domain relevance before use; annotated does not mean error-free.
- `manifest.json` records version, URLs, retrieval date, fingerprints, exclusions
  and transformations. `kaggle_source_metadata.json` preserves the dataset card.

Only text, labels and restricted provenance are retained. Account mentions are
replaced with `[account]`; personal fields are omitted. Common contact/URL/phone
patterns are excluded, but manual privacy review remains necessary.

The batch excludes exact case/whitespace-normalized text matches against the
existing three splits and duplicate/contradictory source texts. It is **training
candidate data only**, not an independent final research test set. Near-duplicates
and paraphrases still require screening. No new neutral labels were inferred from
ratings or emotion tags.

## Why only English was replaced

Searches used Kaggle's public datasets API for Cebuano sentiment, Cebuano labeled,
Bisaya sentiment, Cebu sentiment, Filipino sentiment, Tagalog sentiment, Filipino
reviews and Taglish. In these results no suitable, verified three-class labeled
Filipino/Cebuano sentence source was found. This is a search limitation, NOT a
claim that no such dataset exists anywhere.

Rejected candidates included:
- `abeperez/filipino-wordsentiment-dictionary`: isolated-word lexicon with unknown
  license, not sentence-level ground truth.
- `pratyushpuri/multilingual-mobile-app-reviews-dataset-2025`: explicitly synthetic,
  has ratings rather than verified three-way sentiment; not used as real labeled
  Filipino text.
- Cebuano translation, Wikipedia, speech and generated instruction data: no
  compatible sentence sentiment labels.
- Hate speech/fake news: different targets; their labels were not repurposed.

The old unlabeled Filipino/Cebuano sheets are **not replacements and must not be
imported as labeled data**. A specific Kaggle URL or manually downloaded source
with its documentation is needed to proceed safely for those languages. No paid
access, login bypass or credential collection was attempted.

## Reproduction

```powershell
.\.venv-data\Scripts\python.exe datasets/collect_kaggle_sentiment.py --output-dir artifacts/new-kaggle-batch --per-class 200
```

Choose a new output directory. The fixed source/version produces the same sample
unless source filtering changes; do not count repeated downloads as new examples.
No automatic retraining, approval, database import or deployment takes place.
