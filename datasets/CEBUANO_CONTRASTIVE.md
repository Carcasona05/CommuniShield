# Cebuano praise, negation and incident-topic correction

The reported comment praises responsible reporting, but the active TF-IDF model
classifies it as negative. `cebuano_contrastive_examples.py` contains explicitly
authored positive, negative and neutral stems, shared incident/location contexts,
and curated one-word labels. These are synthetic linguistic training examples,
not downloaded data, verified incidents, user experiences or model predictions.

`train_cebuano_contrastive.py` stages training additions under
`artifacts/cebuano-contrastive/<timestamp>/`. It does not modify canonical splits,
served models, database analyses or the active model registry. Validation and test
CSV files are copied byte-for-byte. Normalized held-out texts are excluded from
the additions. The train/validation combination used for the final model follows
the existing trainer's approach; parameter selection uses validation only.

Small per-class logit offsets are selected on validation data alongside C to
preserve positive/negative recall after augmentation. They are exported into the
ONNX classifier, not applied as application-level phrase or keyword overrides.

The 38 challenge examples are targeted regression checks, **not an independent
benchmark**: they deliberately exercise concepts in the authored training stems.
The ordinary unchanged held-out dataset remains the broader performance check.
Not every sentiment mistake is resolved; inspect `report.json` for misses and
per-class tradeoffs before activation. Do not repeatedly tune against test labels.

```powershell
python datasets/test_cebuano_contrastive_examples.py
python -u datasets/train_cebuano_contrastive.py
cd server
node --import tsx scripts/seed/checkContrastiveCandidate.ts ../artifacts/cebuano-contrastive/<timestamp>
```

The ONNX check reads the app's actual active registry bundle and compares it with
the candidate on both targeted examples and the unchanged Cebuano test set. It
does not call Gemini or change the active pointer. English, Filipino and language
identification models are not retrained by this correction.

Activation must use a **new immutable version** in the registry with the existing
English/Filipino/language-ID artifacts preserved. Never overwrite an active
version's objects or manually change a comment's label to hide a model error.
After activation, stored comments require local reanalysis to reflect new weights.
