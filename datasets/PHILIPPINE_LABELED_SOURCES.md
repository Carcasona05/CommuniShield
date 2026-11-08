# Filipino and Cebuano source findings (2026-11-06)

## Filipino: collected, human sentiment labels

**SentiTaglish: Products and Services**, original public repository:
https://huggingface.co/datasets/ccosme/SentiTaglishProductsAndServices

Original published file: `SentiTaglish_ProductsAndServices.csv` (10,510 reviews).
Source card says two annotators labeled all reviews, and a third adjudicated
disagreements; reported agreement 0.82/0.83. These are source claims, not our own
independent annotation audit. Text is Tagalog/Taglish, not necessarily monolingual
Filipino. The source includes products and services, not exclusively safety reports.

Declared license: **CC BY 4.0**. Attribute the original dataset, link its card and
license, retain source version, and disclose any filtering/transformation. Do not
confuse the `ccosme` source with inaccessible/deleted mirrors or the machine-labeled
and generated TagaSenti compilation.

Original encoding: 1 negative, 2 neutral, 3 positive, 4 mixed. Only 1–3 are
collected, with labels mapped verbatim. Mixed is excluded, never converted into
positive or neutral. Original labels are retained in a provenance column.

Collection folder: `artifacts/filipino-sentitaglish-20261106-labeled/`.
Contains `filipino_labeled.csv`, upstream card and a revision/hash manifest.
Text exact matches against all existing splits and conflicting source labels are
excluded. No existing split is changed, and source holdout status cannot be
established from a single corpus file: use these as training candidates only.

## Cebuano: labeled source found, reuse not yet cleared

**Binisaya Sentiment Analysis — Cabiso & Valdehuesa**
https://github.com/alcrownll/Binisaya-Sentiment-Analysis

Dataset location:
https://github.com/alcrownll/Binisaya-Sentiment-Analysis/blob/main/data/CabisoValdehuesa.csv

README (`ReadME.md`) describes Cebuano sentences with positive/negative labels.
It has **no neutral class**. A public repository is not by itself a reuse license;
no clear dataset license was found during this inspection. Ask the authors for
permission and the original annotation/collection method before importing,
redistributing, citing performance as independently verified, or training for
deployment. No Cebuano rows were imported into this project from this source.

Another lead:
https://github.com/GeneralSmoked/Cebuano-Sentiment-Analysis

Its README says binary manual labels plus a small synthetic portion; no neutral
category and no clear reuse license was found. Do not present the synthetic portion
as naturally collected or every row as independently human-labeled.

## Next steps

Filipino labels already exist: spot-check suitability/privacy, retain attribution,
then validate any import before training. Cebuano remains blocked by permissions
and lack of a neutral class. A licensed binary source could supplement training
once approved but cannot supply all three sentiment classes by itself. Do not
invent neutral labels or treat translation/news-topic labels as sentiment.

Scripts do not alter built-ins, upload datasets to Supabase, trigger training or
guarantee a 0.75 macro-F1 result. All collected data remains separate.
