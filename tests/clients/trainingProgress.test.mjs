import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { trainingProgress, WORKER_HEARTBEAT_STALE_MS } from "../../clients/services/trainingProgress.js";
const now = Date.parse("2026-11-03T12:00:00Z");
const job = (extra = {}) => ({ status: "training", lease_until: "2026-11-03T12:05:00Z",
  progress: { version: 1, completed: 2.5, total: 5, stage: "fitting", language: "cebuano", updatedAt: "2026-11-03T12:00:00Z" }, ...extra });
test("percentage reflects completed worker units, not clocks or accuracy", () => {
  assert.equal(trainingProgress(job(), now).percent, 50);
  assert.equal(trainingProgress(job(), now + 60000).percent, 50);
  assert.equal(trainingProgress(job(), now).language, "cebuano");
  assert.equal(trainingProgress(job({ metrics: { accuracy: 0.99 } }), now).percent, 50);
});
test("only successful registration reaches 100%; queued work is zero", () => {
  assert.equal(trainingProgress(job({ status: "ready", progress: null }), now).percent, 100);
  assert.equal(trainingProgress(job({ status: "queued" }), now).percent, 0);
  assert.equal(trainingProgress(job({ progress: { version: 1, completed: 4.999, total: 5, stage: "registering" } }), now).percent, 99);
});
test("failed and interrupted runs freeze at the last reported completed work", () => {
  for (const value of [job({ status: "failed" }), job({ lease_until: "2026-11-03T11:59:00Z" })]) {
    const result = trainingProgress(value, now);
    assert.equal(result.percent, 50);
    assert.equal(result.stopped, true);
  }
});
test("gracefully stopped workers show Interrupted immediately, even without progress telemetry", () => {
  const stopped = job({ status: "failed", lease_until: null, metrics: { failure_stage: "worker_shutdown", interrupted: true } });
  assert.equal(trainingProgress(stopped, now).operatorStopped, true);
  assert.equal(trainingProgress(stopped, now).interrupted, true);
  assert.equal(trainingProgress(stopped, now).label, "Interrupted — worker stopped");
  assert.equal(trainingProgress(stopped, now).percent, 50);
  assert.equal(trainingProgress({ ...stopped, progress: null }, now).percent, null);
  assert.equal(trainingProgress(job({ status: "failed", error: "Worker lease expired. Queue a retry." }), now).interrupted, true,
    "old-worker jobs also remain Interrupted after the server marks their expired lease failed");
});
test("missing heartbeats show disconnection before lease expiry, without changing the job or percentage", () => {
  const original = job();
  assert.equal(trainingProgress(original, now + WORKER_HEARTBEAT_STALE_MS - 1).disconnected, false);
  const stale = trainingProgress(original, now + WORKER_HEARTBEAT_STALE_MS);
  assert.equal(stale.disconnected, true);
  assert.equal(stale.stopped, false, "a stale heartbeat is advisory, not a terminal job decision");
  assert.equal(stale.percent, 50);
  assert.equal(original.status, "training");
  assert.equal(stale.lastHeartbeatAt, "2026-11-03T12:00:00.000Z");
  assert.equal(trainingProgress(original, now + 300000).interrupted, true);
});
test("a renewed heartbeat restores normal status; slow fitting alone does not imply disconnection", () => {
  const renewed = job({ lease_until: "2026-11-03T12:07:00Z" });
  assert.equal(trainingProgress(renewed, now + 120000).disconnected, false);
  assert.equal(trainingProgress(renewed, now + 120000).percent, 50);
  for (const status of ["ready", "failed", "queued"]) {
    assert.equal(trainingProgress(job({ status }), now + 120000).disconnected, false);
  }
});
test("worker liveness uses a focused local clock even when an HTTP status request hangs", () => {
  const panel = readFileSync(new URL("../../clients/components/Admin_compo/SentimentTrainingPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /useAutoRefresh\(\(\) => setNow\(Date\.now\(\)\)/);
  assert.match(panel, /trainingProgress\(job, now\)/);
  assert.match(panel, /!worker\.stopped && !worker\.disconnected/);
});
test("old workers and malformed telemetry never fabricate a percentage", () => {
  for (const progress of [null, {}, { version: 1, completed: NaN, total: 5, stage: "fitting" },
    { version: 1, completed: 8, total: 5, stage: "fitting" }, { version: 1, completed: 1, total: 0, stage: "fitting" }]) {
    assert.equal(trainingProgress(job({ progress }), now).percent, null);
  }
});
test("progress and buttons have accessible roles, clear contrast and keyboard feedback", () => {
  const button = readFileSync(new URL("../../clients/components/Admin_compo/SentimentActionButton.jsx", import.meta.url), "utf8");
  assert.match(button, /minHeight: 46/);
  assert.match(button, /accessibilityState=\{\{ disabled \}\}/);
  assert.match(button, /onFocus=/);
  assert.match(button, /variant === "danger"/);
  const bar = readFileSync(new URL("../../clients/components/Admin_compo/TrainingProgressBar.jsx", import.meta.url), "utf8");
  assert.match(bar, /accessibilityRole="progressbar"/);
  assert.match(bar, /not an accuracy score/);
});
