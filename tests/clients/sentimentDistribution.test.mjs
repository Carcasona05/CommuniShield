import assert from "node:assert/strict";
import { test } from "node:test";
import { sentimentDistribution } from "../../clients/services/sentimentDistribution.js";

test("distribution percentages exclude unclear and no-data without losing coverage", () => {
  const model = sentimentDistribution({ sentimentTotal: 130, sentimentDistribution: [
    { label: "positive", count: 50 }, { label: "neutral", count: 30 }, { label: "negative", count: 20 },
    { label: "unclear", count: 10 }, { label: "none", count: 20 },
  ] });
  assert.equal(model.usable, 100);
  assert.deepEqual(model.rows.map(row => row.percent), [50, 30, 20]);
  assert.equal(model.coverage[0].count, 10);
  assert.equal(model.coverage[1].count, 20);
});
test("mixed stays visible when present; empty results never fabricate full bars", () => {
  const model = sentimentDistribution({ sentimentDistribution: [{ label: "mixed", count: 5 }, { label: "positive", count: 5 }] });
  assert.equal(model.rows.find(row => row.key === "mixed").percent, 50);
  assert.ok(sentimentDistribution({}).rows.every(row => row.percent === 0));
});
test("precise status coverage uses authoritative buckets instead of calling all missing results pending", () => {
  const model = sentimentDistribution({ sentimentCoverage: { version: 1, unclear: 5, unavailable: 3, pending: 2, failed: 1, missing: 4 } });
  assert.deepEqual(model.coverage.map(row => row.count), [5, 3, 2, 1, 4]);
});
