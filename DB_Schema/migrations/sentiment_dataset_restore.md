# Dataset restoration

Apply `sentiment_dataset_restore.sql` in the Supabase SQL Editor before deploying
the Restore action. It requires the existing sentiment dataset tables. It adds a
service-role-only RPC without replacing the existing mutation function or data.
The migration can be applied again safely.

- Only an enabled Super Admin can restore an archived dataset.
- The current version is required; stale requests fail without changes.
- Restoration preserves sample IDs/text/labels and audit history, records the old
  review metadata, increments the version and returns the dataset to pending review.
- Samples remain inactive. Restoration neither approves data nor queues training.
- Approval remains a separate action; duplicate active examples cause approval to
  roll back rather than silently overwrite another dataset.

The list API adds `status=current` (all nonarchived datasets) and full-library
`counts.current` / `counts.archived`. Legacy `status=all` still includes archives.
