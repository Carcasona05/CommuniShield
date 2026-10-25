import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRiskZones, isActiveRiskReport, RISK_ZONE_LIMIT } from "../../clients/services/riskZones.js";

test("risk zones are limited to five and retain report-count ranking", () => {
  const reports = [];
  for (let zone = 1; zone <= 8; zone++) {
    for (let count = 0; count < zone; count++) reports.push({ barangay: `Zone ${zone}`, severity: "Low" });
  }
  const zones = buildRiskZones(reports);
  assert.equal(zones.length, RISK_ZONE_LIMIT);
  assert.deepEqual(zones.map(({ location }) => location), ["Zone 8", "Zone 7", "Zone 6", "Zone 5", "Zone 4"]);
  assert.deepEqual(zones.map(({ count }) => count), [8, 7, 6, 5, 4]);
  const allZones = buildRiskZones(reports, Infinity);
  assert.equal(allZones.length, 8);
  assert.deepEqual(allZones.slice(0, 5), zones);
  assert.equal(allZones.slice(0, 10).length, 8);
});

test("zone severity is the highest known severity among active reports", () => {
  const zones = buildRiskZones([
    { barangay: "Lamacan", severity: "low" },
    { barangay: "lamacan", severity: " HIGH " },
    { barangay: "Lamacan", severity: "Critical", status: "Resolved" },
    { barangay: "Canbanua", severity: "Moderate" },
    { barangay: "Canbanua", severity: "critical" },
  ]);
  assert.equal(zones[0].location, "Lamacan");
  assert.equal(zones[0].count, 2);
  assert.equal(zones[0].severity, "High");
  assert.equal(zones[1].severity, "Critical");
});

test("unknown severity is not fabricated and moderate is normalized", () => {
  const zones = buildRiskZones([{ barangay: "A", severity: "unrated" }, { barangay: "B", severity: "Moderate" }]);
  assert.equal(zones[0].severity, "Unknown");
  assert.equal(zones[1].severity, "Medium");
});

test("inactive reports never inflate zone counts or severity", () => {
  for (const status of ["rejected", "Marked Fake", "FAKE", " Archived ", "Resolved"]) {
    assert.equal(isActiveRiskReport({ status }), false);
    assert.deepEqual(buildRiskZones([{ barangay: "Lamacan", severity: "Critical", status }]), []);
  }
  assert.deepEqual(buildRiskZones([]), []);
});
