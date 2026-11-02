import assert from "node:assert/strict";
import { test } from "node:test";
import { sentimentCoverage } from "../../server/src/services/sentimentCoverage.js";

test("coverage partitions subjects without equating unclear or unavailable with neutral", () => {
  const coverage = sentimentCoverage([
    { status: "succeeded", label: "positive" }, { status: "succeeded", label: "mixed" },
    { status: "succeeded", label: "unclear" }, { status: "unavailable", label: "unclear" },
    { status: "pending", label: "neutral" }, { status: "failed", label: "negative" }, undefined,
    { status: "succeeded", label: "unknown" },
  ]);
  assert.deepEqual(coverage, { version: 1, total: 8, usable: 2, unclear: 1, unavailable: 2, pending: 1, failed: 1, missing: 1 });
});
