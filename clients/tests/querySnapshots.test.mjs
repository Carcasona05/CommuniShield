import assert from "node:assert/strict";
import { test } from "node:test";
import { querySnapshotKey, QUERY_SNAPSHOT_TTL_MS, retainUnchangedQueryData, usableQuerySnapshot } from "../services/querySnapshots.js";

test("snapshot keys distinguish every endpoint/filter without depending on property order", () => {
  assert.equal(querySnapshotKey("/admin/clusters", { period: "7d", category: undefined }), querySnapshotKey("/admin/clusters", { period: "7d" }));
  assert.equal(querySnapshotKey("/admin/clusters", { period: "7d", category: "Theft" }), querySnapshotKey("/admin/clusters", { category: "Theft", period: "7d" }));
  assert.notEqual(querySnapshotKey("/admin/clusters", { period: "7d" }), querySnapshotKey("/admin/clusters", { period: "30d" }));
  assert.notEqual(querySnapshotKey("/admin/risk-outlook", { barangay: "Lamacan" }), querySnapshotKey("/admin/risk-outlook", { barangay: "Tulic" }));
});

test("cache expiry, future clocks and UTC rollover never preserve an expired outlook", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  assert.equal(usableQuerySnapshot({ data: {}, checkedAt: now - 1000 }, now), true);
  assert.equal(usableQuerySnapshot({ data: {}, checkedAt: now - QUERY_SNAPSHOT_TTL_MS }, now), false);
  assert.equal(usableQuerySnapshot({ data: {}, checkedAt: now + 1 }, now), false);
  assert.equal(usableQuerySnapshot({ data: {}, checkedAt: Date.parse("2026-10-21T23:59:59Z") }, Date.parse("2026-10-22T00:00:01Z")), false);
  assert.equal(usableQuerySnapshot(null, now), false);
});

test("clock-only refreshes preserve map/data references; actual evidence or targets replace them", () => {
  const first = { asOf: "a", reports: [{ id: "one" }], clustering: { generatedAt: "a", clusters: [] }, forecast: { asOf: "a", targetStartDate: "2026-10-23", expectedReports: 5 } };
  const clocks = { ...structuredClone(first), asOf: "b" };
  clocks.clustering.generatedAt = "b";
  clocks.forecast.asOf = "b";
  assert.equal(retainUnchangedQueryData(first, clocks), first);
  const changed = structuredClone(clocks);
  changed.forecast.expectedReports = 6;
  assert.equal(retainUnchangedQueryData(first, changed), changed);
  const rollover = structuredClone(clocks);
  rollover.forecast.targetStartDate = "2026-10-24";
  assert.equal(retainUnchangedQueryData(first, rollover), rollover);
  const archived = structuredClone(clocks);
  archived.reports = [];
  assert.equal(retainUnchangedQueryData(first, archived), archived);
});
