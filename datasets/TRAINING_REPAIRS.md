# English / Filipino training-pipeline repairs

These changes repair training/evaluation correctness. They do not guarantee that
a candidate meets the existing quality gates, and they do not replace built-ins.

## Export contract: portable-v1

New independent English/Filipino fresh candidates use a versioned portable feature
profile. Continued English/Filipino candidates adapt a deep copy of their existing
features, retaining the vocabulary, IDF and initial weights before updating.

The profile/exporter fixes four incompatibilities:

1. Explicit ASCII case folding and Unicode word tokenization match ONNX's C locale
   rather than assuming its normalizer matches Python's Unicode lowercasing.
2. Character ngrams preserve whitespace in both implementations.
3. The installed skl2onnx TF-IDF converter uses `log(1+count)` for sublinear TF;
   sklearn uses `1+log(count)` for nonzero counts. The new converter implements
   sklearn's formula exactly, including zeros.
4. Internal-only unigram columns allow ONNX to count ngrams whose standalone words
   were pruned. They are sliced away before IDF/classification. A padding sentinel
   absent from every atomic token prevents padded batches from inventing character
   ngrams involving `#`.

No global sklearn converter is replaced. Only the versioned feature subclass uses
the repaired converter. New English/Filipino exports must have zero validation
label disagreements and maximum probability error <= 0.00002. A parity failure
stops the job before any upload/registration. Legacy built-in files and Cebuano's
feature recipe are not modified. `--feature-profile legacy` is available for
historical diagnostic reproduction, not a claim that legacy parity is repaired.

## Independent continuation validation

Historical built-in states learned train+validation rows. A copied historical
state therefore cannot use the original validation split for independent update
selection or confidence calibration.

The updated independent worker reserves a deterministic stratified portion of
newly admitted approved examples in its NEW local snapshot:

- About 25% per language/class, with at least 10 reserved per class.
- At least 11 usable new examples per class/language are needed, leaving training
  examples after reservation; sparse selections fail with an explicit explanation.
- Reserved texts are excluded from training, replay and the admitted fitting list.
- Approved additions must not overlap recorded original train/validation/test
  texts after normalization. Duplicate additions are rejected.
- The original source files, selected dataset receipts and original test split
  remain unchanged. Only the worker-owned snapshot's validation file is replaced.
- A provenance receipt binds the resulting train/validation/test files and fitting
  additions by hash. Direct continuation without this receipt fails closed.

The new validation set is disjoint by normalized text. This does not prove
semantic independence of paraphrases, annotation accuracy, representativeness, or
generalization beyond the uploaded data. Small, templated in-domain additions may
score highly yet perform poorly on the broader benchmark. Final test gates remain.

## Deployment / operation

Restart the Python worker when no job is running and deploy/reload the updated
client. No SQL migration is needed for these repairs. Existing jobs/models/results
are not rewritten or enabled. Continue training no longer legitimately works with
only a handful of new single-label examples; use fresh training or add sufficient
reviewed examples rather than reusing contaminated validation.

Checks and reproduction results are recorded in
`artifacts/sentiment-investigation-20261108/PIPELINE_REPAIRS.md`.
