# Collected text candidates — not yet training data

Initial batch: `artifacts/sentiment-collection-20261106-review/`.

Files: `english_review.csv`, `filipino_review.csv`, `cebuano_review.csv` and
`manifest.json`, plus snapshots of upstream dataset cards. Each CSV has 200
candidate texts. No existing training/validation/test CSVs or models were changed.

## Sources and limits

- English: `google-research-datasets/go_emotions`, simplified **train** split.
  The upstream card declares Apache-2.0. Source labels are emotions, NOT the
  app's three-way sentiment labels. They have deliberately not been mapped.
  Cite Demszky et al. (2020), *GoEmotions: A Dataset of Fine-Grained Emotions*.
  Preserve the license, attribution and applicable upstream notices.
- Filipino/Cebuano: `jfernandez/cebuano-filipino-sentences`, **train** split.
  The upstream card declares CC0-1.0 but provides little provenance information.
  These are translation pairs, NOT a human-labeled sentiment benchmark. Native
  speakers must check the language and translation quality; exclude bad pairs.
  The uploader's declaration is not an independent rights/consent audit.

Dataset cards, revision IDs, retrieval time and response fingerprints are in the
collection folder. No raw usernames, author fields or comment IDs were collected.
Text itself may still contain names, sensitive claims, profanity or other personal
information; regex checks cannot replace manual privacy review. Respect source
terms and institutional requirements; do not assume public availability is consent.

TweetEval and Shopee were investigated but already exist in this project's raw
data. Hate-speech, fake-news and dengue-topic labels were NOT relabeled as sentiment.
Financial investor sentiment and unverified-license sources were not added.

## Human review before use

1. Open a CSV as UTF-8. Keep `candidate_id`, source/revision and `source_group`.
2. Review privacy and suitability for community safety. Remove sensitive personal
   information or reject the row. Mark `privacy_review` and `domain_review` only
   after checking. Much of this batch is general language, not safety-domain text.
3. Two fluent reviewers independently label the text without seeing each other's
   answers, existing model predictions or original emotion IDs. Use separate copies
   if needed; the combined sheet is for recording the completed decisions.
4. Agree on an annotation policy BEFORE labeling. Define treatment of factual
   adverse events (illness/crime), sarcasm, positive recovery, neutral questions,
   hypothetical/quoted events and mixed/insufficient-context text. Do not equate
   any mention of illness with negative sentiment regardless of context.
5. Resolve disagreements with adjudication. Fill `label` only after resolution;
   use `positive`, `neutral` or `negative`. Reject unresolved/mixed/context-dependent
   rows rather than force them into an arbitrary three-class label.
6. Check near-duplicates and translations against existing splits. This collector
   only excludes exact case/whitespace-normalized text matches across all existing
   splits, without using their labels. Paraphrases are not automatically detected.
7. Treat paired/translated texts as the SAME group. Never put related versions in
   different training/validation/test sets. This batch is intended as training
   candidates, not a new independent research test set.
8. Only after review, create a separately validated `text,language,label,split`
   import. These review sheets intentionally are NOT automatically importable.

Do not claim these are expert-verified labels, independently collected community
reports, a balanced sentiment dataset or evidence of 75% performance. Collection
does not guarantee improvement; measure independent performance after curation.

## Reproduce or extend

From the repo root, choose a NEW output directory:

```powershell
.\.venv-data\Scripts\python.exe datasets/collect_sentiment_review.py --output-dir artifacts/my-review-batch --per-language 200
```

The bounded initial collector samples deterministic train offsets, not a random
representative population or sentiment-balanced sample. Re-running it unchanged
will mostly repeat this same batch. Expand source offsets/sources deliberately,
record provenance and compare against prior collection files before collecting
more. No API keys or paid Gemini calls are used.
