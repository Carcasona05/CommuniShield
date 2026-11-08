# Optional dataset archiving on supporting-model deletion

Apply (or reapply the updated) `sentiment_supporting_delete_datasets.sql` in Supabase
before using direct deletion of disabled models. Existing supporting-model pool
and dataset functions must already be installed. The migration is additive and rerunnable.

Disabled models now offer **Enable / Delete from pool**, without an intermediate
Archive step. Enabled models must be disabled first. Previously archived models
still offer Restore to disabled / Delete from pool. No rows or artifacts are
physically removed, and enabling/disabling/routing logic is unchanged.

The delete confirmation lists linked datasets, with **nothing selected by default**.
Datasets referenced by another nondeleted model (enabled, disabled or archived),
updated since the model's recorded version, or already archived cannot be selected.
They can be managed separately from the dataset library when appropriate.

All delete requests use the guarded deletion transaction, including **Delete from
pool only** with an empty dataset selection. It preserves active-Super-Admin,
generation and live-training/evaluation checks while allowing disabled or archived
models to be removed. It rechecks dataset versions, linkage and sharing, then
archives only explicitly selected datasets through the existing dataset mutation RPC.
Any failure rolls back the whole operation; there is no fallback partial deletion.
Samples/history/artifacts are retained. No training is queued by the new function.
Inference routing and existing results are unchanged; archived datasets are excluded
from future training selection. Existing models trained from those datasets remain.

If the preview cannot be loaded, the UI offers only deletion from the pool and
explicitly says no datasets will be archived. The deletion migration is still
required; there is no unsafe fallback or automatic archive step.
