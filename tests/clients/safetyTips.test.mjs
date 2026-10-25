import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNearbySafety, formatSafetyReportAge, normalizeSeverity, tipsForIncident } from "../../clients/services/safetyTips.js";

const now = Date.parse("2026-10-19T12:00:00Z");
const position = [9.8816, 123.5953];
const report = (overrides = {}) => ({
  id: "report-1",
  latitude: position[0] + 0.001,
  longitude: position[1],
  incidentType: "Theft",
  severity: "Low",
  status: "Under Verification",
  datePosted: "2026-10-19T11:00:00Z",
  verified: false,
  ...overrides,
});

test("requires an actual valid location", () => {
  for (const pos of [null, [], [null, 123], [NaN, 123], [91, 123]]) {
    assert.equal(buildNearbySafety([report()], pos, now), null);
  }
});

test("only includes reports within 2 km", () => {
  const result = buildNearbySafety([report(), report({ id: "far", latitude: 10.5 })], position, now);
  assert.equal(result.count, 1);
  assert.ok(result.incidents[0].distanceKm < 0.2);
  assert.equal(buildNearbySafety([report()], [10.5, 123.6], now), null);
});

test("moving into and out of a reported area updates the tips", () => {
  const reports = [report()];
  assert.equal(buildNearbySafety(reports, [11, 124], now), null);
  assert.equal(buildNearbySafety(reports, position, now).count, 1);
  assert.equal(buildNearbySafety(reports, [11, 124], now), null);
});

test("excludes inactive reports regardless of casing", () => {
  for (const status of ["Resolved", "Rejected", "Archived", "Marked Fake", "FAKE"]) {
    assert.equal(buildNearbySafety([report({ status })], position, now), null);
  }
});

test("rejects old, future, undated, and invalid reports", () => {
  for (const datePosted of ["2026-10-01", "2026-10-20", undefined, "bad date"]) {
    assert.equal(buildNearbySafety([report({ datePosted })], position, now), null);
  }
  for (const latitude of [undefined, null, "", "bad", Infinity, 91]) {
    assert.equal(buildNearbySafety([report({ latitude })], position, now), null);
  }
});

test("prioritizes severity before proximity and deduplicates incident types", () => {
  const result = buildNearbySafety([
    report(),
    report({ id: "fire", incidentType: "Fire Incident", severity: "Critical", latitude: position[0] + 0.005 }),
    report({ id: "theft-high", severity: "High" }),
  ], position, now);
  assert.equal(result.count, 3);
  assert.equal(result.highestSeverity, "Critical");
  assert.equal(result.incidents.length, 2);
  assert.equal(result.incidents[0].id, "fire");
  assert.equal(result.incidents[1].id, "theft-high");
});

test("advice depends on incident type and severity", () => {
  const theft = tipsForIncident("Theft", "Low");
  const fire = tipsForIncident("Fire Incident", "Critical");
  assert.match(theft[0], /valuables/);
  assert.match(fire[0], /smoke/);
  assert.match(fire[1], /Avoid entering/);
  assert.notEqual(theft[1], fire[1]);
  assert.match(tipsForIncident("Flooding", "High")[0], /floodwater/);
  assert.match(tipsForIncident("Vehicular Accident", "Medium")[0], /roadway/);
  assert.match(tipsForIncident("Harassment", "High")[0], /Avoid confrontation/);
  assert.match(tipsForIncident("Unattended / Abandoned Object", "High")[0], /Do not touch/);
});

test("does not invent a severity for missing or unrecognized values", () => {
  assert.equal(normalizeSeverity("HIGH"), "High");
  assert.equal(normalizeSeverity("Moderate"), "Medium");
  assert.equal(normalizeSeverity(null), "Unknown");
  const result = buildNearbySafety([report({ severity: undefined })], position, now);
  assert.equal(result.highestSeverity, "Unknown");
  assert.match(result.incidents[0].tips[1], /check official updates/);
});

test("keeps unverified reports labeled and limits the card to three incident types", () => {
  const result = buildNearbySafety(["Theft", "Flooding", "Fire Incident", "Harassment"].map((incidentType, index) =>
    report({ id: `report-${index}`, incidentType })
  ), position, now);
  assert.equal(result.count, 4);
  assert.equal(result.incidents.length, 3);
  assert.equal(result.incidents[0].verified, false);
});

test("reports expire even when the user has not moved", () => {
  assert.ok(buildNearbySafety([report()], position, now));
  assert.equal(buildNearbySafety([report()], position, now + 8 * 86400000), null);
});

test("formats actual report ages in minutes, hours, and days", () => {
  assert.equal(formatSafetyReportAge(now - 10000, now), "Just now");
  assert.equal(formatSafetyReportAge(now - 60000, now), "1 minute ago");
  assert.equal(formatSafetyReportAge(now - 3 * 60000, now), "3 minutes ago");
  assert.equal(formatSafetyReportAge(now - 3600000, now), "1 hour ago");
  assert.equal(formatSafetyReportAge(now - 5 * 3600000, now), "5 hours ago");
  assert.equal(formatSafetyReportAge(now - 86400000, now), "1 day ago");
  assert.equal(formatSafetyReportAge(now - 3 * 86400000, now), "3 days ago");
  assert.equal(formatSafetyReportAge("invalid", now), "Time unavailable");
});

test("latest report time includes all nearby reports regardless of severity or deduplication", () => {
  const result = buildNearbySafety([
    report({ id: "old-critical", severity: "Critical", datePosted: "2026-10-16T12:00:00Z" }),
    report({ id: "new-low", severity: "Low", datePosted: "2026-10-19T11:00:00Z" }),
  ], position, now);
  assert.equal(result.incidents[0].id, "old-critical");
  assert.equal(formatSafetyReportAge(result.latestReportedAt, now), "1 hour ago");
});
