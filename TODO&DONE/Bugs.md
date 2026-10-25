# ======== USERS FEATURE ======= #

### BACKEND ###

# BUGS
- [RESOLVED] Cebuano praise misclassified as negative (e.g. "gwapo", "ka gwapo jud
  aning jobert oy" returned label=negative at ~0.78 confidence).

  Root cause (three compounding defects, not a single missing dataset):
  1. `datasets/build_single_words.py` mined single words and inherited the label of
     the sentence they appeared in. Praise words only ever occurred inside negative
     crime/fake-news headlines ("gipatay tungod sa ka-gwapo"), so "gwapo", "gwapa",
     "nindot", "maayo", "kaayo" were written into the splits as NEGATIVE samples.
     MIN_OCCURRENCES was 1 and MIN_DOMINANCE 0.5, so a word seen twice, both times in
     negative news, passed as a confident negative.
  2. Class imbalance: Cebuano splits were ~46% negative / 39% neutral / 14% positive,
     and the classifier had no class weighting, so positive recall collapsed to 0.12
     (87% of real positives misclassified).
  3. Ensemble fusion in `server/src/services/sentimentService.ts` let the local model
     overrule Gemini at only 0.45 confidence, so a confidently-wrong local prediction
     was never corrected.

  Fixes applied:
  - `datasets/build_single_words.py`: MIN_OCCURRENCES 1->4, MIN_DOMINANCE 0.5->0.75,
    and added the missing compliment vocabulary (gwapo, gwapa, pogi, astig, lupet...)
    to the curated Cebuano positive lexicon.
  - `datasets/repair_cebuano_splits.py` (new): removes the context-mined praise poison
    rows already baked into train/validation/test.
  - `datasets/build_compliments.py` (new): generates 5000 authentic Cebuano compliments
    (priority) plus Filipino via Gemini, and downloads real English praise.
  - `datasets/merge_compliments.py` (new): folds the compliments into the splits.
  - `datasets/train_sentiment.py`: LogisticRegression now uses class_weight="balanced".
  - `datasets/retrain_all.py` (new): runs repair -> merge -> retrain -> copy to server/models.
  - `sentimentService.ts`: short inputs (<=3 tokens) now require the local model to be
    >= 0.75 confident before it may overrule Gemini; otherwise Gemini rescues.




