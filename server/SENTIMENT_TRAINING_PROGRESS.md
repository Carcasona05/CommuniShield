# Completed-work training progress

## Deploy safely

1. Apply `DB_Schema/migrations/sentiment_training_progress.sql` after the existing
   language-scoped training migration. The finalized fresh-install schema also
   includes these definitions. Do not reinstall the full schema on an existing DB.
2. Deploy/restart the backend and reload/rebuild the client.
3. Restart the Python training worker **after its current run finishes**. Restarting
   it mid-run can interrupt training. Its startup log confirms whether completed-work
   reporting is available. Existing worker processes cannot retroactively report
   fitting steps they did not instrument.

No migration was applied automatically to a live database by this change.

## Meaning of the percentage

The progress bar measures completed planned work units, **not elapsed time, ETA,
accuracy or probability of passing**. Every run plans one preparation unit, one
fitting unit and one held-out checking unit per requested language, one artifact
upload unit and one final registration unit.

Within fitting, completed feature preparation/candidate-validation steps (fresh
training) or fitted binary classifiers/checked update strengths (continued
training) produce fractional work units. Artifact uploads report completed file
counts. An individual optimizer fit or ONNX check can be slow without advancing
the bar; there is no timer-based animation pretending work has completed.

Only a server-confirmed `ready` job displays 100%. A candidate remains disabled
until manual review and enablement. Expected quality rejection is still a failed
run, not successful registration; the bar stops at its last completed work unit.
Partial qualification retains its existing per-language evaluation results.

The progress RPC validates the current unexpired lease, monotonic sequence/counts,
bounded phases and language values. It neither renews the lease nor changes job
status, training data, quality gates, activation or artifacts. Only `service_role`
can call these RPCs. The status API returns no lease tokens or private training
text. Reclaimed jobs hide telemetry from a previous lease.

Updates during long fitting are throttled to at most one every five seconds;
completed milestones may report immediately. The focused UI checks active jobs
every ten seconds. Telemetry failures warn once without changing model-quality
decisions or disabling independent heartbeat/lease enforcement. Without the
migration, active jobs show stage-only progress rather than invented percentages.

## Worker shutdown and disconnection

The updated worker records a lease-fenced interruption on Ctrl+C, Ctrl+Break
(Windows), or SIGTERM where the OS permits cleanup. It uses the existing `fail`
RPC with `failure_stage: worker_shutdown`; no extra migration is needed for this
shutdown fix. The UI labels that outcome **Interrupted**, not a quality rejection.
Stop confirmation is written before waiting for a pending heartbeat request.
An already-registered candidate or another worker's lease cannot be overwritten.

Force-kill, closing a terminal forcibly, power loss or network loss cannot promise
an immediate stop message. Heartbeats renew the existing five-minute lease every
30 seconds. After 90 seconds without renewal, the focused UI shows **Worker
disconnected**, removes active-training cues, and retains the last percentage.
This is advisory: it can recover on a new heartbeat, and never revokes a still-valid
lease. Lease expiry shows **Interrupted**. An independent local display clock
keeps these warnings updating even if the status HTTP request is hung/offline.

Deploy the updated worker and reload the frontend to use this behavior. An older
worker that is already stopped cannot retroactively save a stop confirmation;
heartbeat/expiry detection still applies to its saved job.

## Design

### Queue eligibility

Apply `DB_Schema/migrations/sentiment_training_queue_eligibility.sql` to existing
databases, then restart the backend and reload the client. Normal queue buttons
require approved, untrained data from the versioned ready-to-queue summary, and
are disabled while another run is queued/running. The database rechecks this
under the training advisory lock; bypassing the UI cannot queue empty or already
trained data. The previous unguarded queue function is private to its wrapper.

With no ready data, the latest failed/interrupted run may offer a separate
**Retry training** button. The database requires unchanged data revision and the
original approved dataset versions, preserves its training mode and language
scope, and still applies all quality checks. No live migration is applied
automatically. The finalized schema includes this migration for fresh installs.

The current run appears near the top of Training. Buttons use a shared high-contrast
component with 46px minimum touch targets, clear primary/secondary/destructive
styles, visible keyboard focus, pressed feedback and readable disabled states.
Dataset and training tabs have a filled selected state. Model activation stays a
separate, confirmed action; no redesign changes permissions or quality thresholds.
