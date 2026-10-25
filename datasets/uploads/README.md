# Dataset uploads

Place your reviewed training CSVs here if you want local copies. The application
also accepts a CSV from any location through **Sentiment Datasets → Add data**.
No CSV in this folder is automatically imported, approved, or trained.

Required headers: `text,language,label`.

- Languages: `cebuano`, `english`, `filipino` (any combination).
- Labels: `positive`, `neutral`, `negative`.
- One row is allowed. Single words need context review, not automatic labelling.
- Remove personal information and duplicate/conflicting rows before submission.
- Super-admin approval, explicit training and quality checks remain separate.

Old trial uploads and their failed evaluation reports were removed during schema
finalization. They were not proven passing datasets and should not be reused as
recommended training inputs. No replacement file can guarantee a model pass.

Keep validation/test material out of training uploads. See
`../SUPPORTING_TRAINING_AUDIT.md` for quality/provenance limitations and
`../../server/SENTIMENT_LANGUAGE_SCOPED_TRAINING.md` for the final workflow.
