import assert from "node:assert/strict";
import { test } from "node:test";
import { filterDashboardMapReports, DASHBOARD_MAP_PERIODS } from "../services/dashboardMap.js";

const now = new Date("2026-11-13T04:00:00Z");
const report = (overrides = {}) => ({ id: "report", is_verified: true, status: "Verified", latitude: 9.88, longitude: 123.59,
  severity: "High", created_at: now.toISOString(), ...overrides });
const filter = (rows, severity = "All", period = "All dates") => filterDashboardMapReports(rows, severity, period, now);

test("default includes all dates, but only verified or resolved reports with coordinates", () => {
  const rows = [report({ id: "old", created_at: "2020-01-01" }), report({ id: "flag", status: "Pending" }),
    report({ id: "status", is_verified: false }), report({ id: "resolved", status: "Resolved", is_verified: false }),
    report({ is_verified: false, status: "Pending" }), report({ status: "Rejected" }), report({ status: "Archived" }),
    report({ status: "Marked Fake" }), report({ status: "Fake" }), report({ latitude: null }), report({ longitude: "bad" }), report({ latitude: " " })];
  assert.deepEqual(filter(rows).map(row => row.id), ["old", "flag", "status", "resolved"]);
  assert.equal(rows.length, 12);
});

test("Today starts at midnight in Argao rather than UTC or the viewer's timezone", () => {
  const rows = [report({ id: "before", created_at: "2026-11-12T15:59:59.999Z" }),
    report({ id: "midnight", created_at: "2026-11-12T16:00:00Z" }), report({ id: "now" }),
    report({ created_at: "invalid" }), report({ created_at: "2026-11-13T04:00:00.001Z" })];
  assert.deepEqual(filter(rows, "All", "Today").map(row => row.id), ["midnight", "now"]);
});

for (const days of [7, 30]) {
  test(`Past ${days} days uses an inclusive rolling window and combines with severity`, () => {
    const start = now.getTime() - days * 86400000;
    const rows = [report({ id: "boundary", created_at: new Date(start).toISOString() }),
      report({ created_at: new Date(start - 1).toISOString() }), report({ id: "current" }),
      report({ severity: "Low" }), report({ is_verified: false, status: "Pending" }), report({ created_at: null })];
    assert.deepEqual(filter(rows, "High", `Past ${days} days`).map(row => row.id), ["boundary", "current"]);
  });
}

test("severity choices remain available alongside the requested dates", () => {
  assert.deepEqual(DASHBOARD_MAP_PERIODS, ["All dates", "Today", "Past 7 days", "Past 30 days"]);
  for (const severity of ["Critical", "High", "Medium", "Low"]) {
    assert.deepEqual(filter([report({ severity }), report({ severity: "Unknown" })], severity).map(row => row.severity), [severity]);
  }
});
