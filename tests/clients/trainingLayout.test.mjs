import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { trainingProgress } from "../../clients/services/trainingProgress.js";

const source = readFileSync(new URL("../../clients/components/Admin_compo/SentimentTrainingPanel.jsx", import.meta.url), "utf8");
const selection = source.slice(source.indexOf("  const focus ="), source.indexOf("  const renderJob ="));
const now = Date.parse("2026-11-03T12:00:00Z");
const running = { id: "running", status: "training", lease_until: "2026-11-03T12:05:00Z" };
function layout(jobs, summary = {}) {
  return vm.runInNewContext(`${selection}\n({ focus, showCurrentTraining, otherJobs, queueDisabled, canRetry });`, { jobs, summary, now, trainingProgress, setupReady: true, state: { data_revision: 1 } });
}
test("ready-to-queue precedes conditional current training, followed by supporting models and history", () => {
  const ready = source.indexOf('testID="ready-to-queue-pool"');
  const current = source.indexOf('testID="current-training-section"');
  const supporting = source.indexOf("<SupportingModelsPanel");
  const history = source.indexOf("Previous runs (");
  assert.ok(ready < current && current < supporting && supporting < history);
  assert.match(source, /showCurrentTraining \? <View/);
});
test("current training is hidden when there is neither ready data nor an active job", () => {
  const jobs = [{ id: "done", status: "ready" }, { id: "failed", status: "failed" }];
  const result = layout(jobs);
  assert.equal(result.showCurrentTraining, false);
  assert.equal(result.focus, undefined);
  assert.equal(result.otherJobs.length, 2);
});
test("approved untrained datasets show a ready-to-start state without reusing a historical run", () => {
  const result = layout([{ id: "done", status: "ready" }], { queueSummaryVersion: 1, readyToQueueExamples: 20, readyToQueueDatasets: 1 });
  assert.equal(result.showCurrentTraining, true);
  assert.equal(result.focus, undefined);
  assert.equal(result.otherJobs.length, 1);
  assert.equal(layout([], { approvedExamples: 500 }).showCurrentTraining, false, "old cumulative totals are not pending data");
});
test("queued and running jobs show current training, while disconnected runs retain their warning", () => {
  for (const job of [running, { id: "queue", status: "queued" }, { ...running, status: "evaluating" },
    { ...running, lease_until: "2026-11-03T12:03:00Z" }]) {
    const result = layout([job]);
    assert.equal(result.showCurrentTraining, true);
    assert.equal(result.focus.id, job.id);
  }
});
test("expired and operator-stopped jobs move to history rather than masquerading as active training", () => {
  const result = layout([{ ...running, lease_until: "2026-11-03T11:59:00Z" },
    { id: "stopped", status: "failed", metrics: { failure_stage: "worker_shutdown", interrupted: true } }]);
  assert.equal(result.showCurrentTraining, false);
  assert.equal(result.otherJobs.length, 2);
});
test("queue requires ready data, not cumulative approvals; retries are separate", () => {
  assert.equal(layout([], { approvedExamples: 100 }).queueDisabled, true);
  const ready = { queueSummaryVersion: 1, readyToQueueExamples: 10, readyToQueueDatasets: 1 };
  assert.equal(layout([], ready).queueDisabled, false);
  assert.equal(layout([running], ready).queueDisabled, true);
  const retry = layout([{ id: "failed", status: "failed", data_revision: 1 }], { approvedExamples: 100 });
  assert.equal(retry.queueDisabled, true);
  assert.equal(retry.canRetry, true);
  assert.equal(layout([{ status: "failed", data_revision: 0 }], { approvedExamples: 100 }).canRetry, false);
});
