const STAGES = {
  preparing: "Preparing reviewed data", fitting: "Fitting and validating candidates",
  checking: "Checking held-out quality", uploading: "Uploading verified artifacts",
  registering: "Registering candidate for review",
};
// The existing database protocol renews a five-minute lease every 30 seconds.
// A missed heartbeat is advisory, not a reason to revoke a still-valid lease.
const LEASE_MS = 5 * 60 * 1000;
export const WORKER_HEARTBEAT_STALE_MS = 90 * 1000;

export function trainingProgress(job, now = Date.now()) {
  const active = ["training", "evaluating"].includes(job?.status);
  const leaseUntil = Date.parse(job?.lease_until);
  const operatorStopped = job?.status === "failed" && job?.metrics?.failure_stage === "worker_shutdown" && job.metrics.interrupted === true;
  const expiredByServer = job?.status === "failed" && job?.error === "Worker lease expired. Queue a retry.";
  const interrupted = operatorStopped || expiredByServer || (active && leaseUntil <= now);
  const disconnected = active && !interrupted && Number.isFinite(leaseUntil) && now - (leaseUntil - LEASE_MS) >= WORKER_HEARTBEAT_STALE_MS;
  const stopped = interrupted || job?.status === "failed";
  const value = job?.progress;
  const valid = value?.version === 1 && Number.isFinite(value.completed) && Number.isInteger(value.total) &&
    value.total > 0 && value.completed >= 0 && value.completed < value.total && Boolean(STAGES[value.stage]);
  const percent = job?.status === "ready" ? 100 : job?.status === "queued" ? 0 : valid ? Math.min(99, Math.floor(value.completed / value.total * 100)) : null;
  const label = operatorStopped ? "Interrupted — worker stopped" : interrupted ? "Interrupted — worker lease expired"
    : disconnected ? "Worker disconnected — heartbeat not received" : job?.status === "failed" ? "Stopped — run did not qualify or failed"
    : job?.status === "ready" ? "Candidate registered — manual review required" : job?.status === "queued" ? "Queued — waiting for a worker"
    : valid ? STAGES[value.stage] : "Waiting for worker progress";
  return { percent, label, stopped, interrupted, disconnected, operatorStopped,
    lastHeartbeatAt: active && Number.isFinite(leaseUntil) ? new Date(leaseUntil - LEASE_MS).toISOString() : null,
    language: valid && ["english", "filipino", "cebuano"].includes(value.language) ? value.language : null,
    updatedAt: valid && Number.isFinite(Date.parse(value.updatedAt)) ? value.updatedAt : null };
}
