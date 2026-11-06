import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { DEFAULT_HOTSPOT_SEVERITY, HOTSPOT_SEVERITY_OPTIONS, hotspotReportSeverity, matchesHotspotSeverity } from "../../clients/services/hotspotSeverity.js";

const source = readFileSync(new URL("../../clients/app/(admin)/Admin_Hotspot_Detection.jsx", import.meta.url), "utf8");
const reports = ["Critical", "High", "Medium", "Low"].map((severity, i) => ({ id: String(i), severity, ai_score: 80, latitude: 9.88, longitude: 123.59 }));
const unrated = { id: "unrated", severity: "Medium", ai_score: null };

test("the initial severity filter displays High and Critical only", () => {
  assert.deepEqual(reports.filter(report => matchesHotspotSeverity(report, DEFAULT_HOTSPOT_SEVERITY)).map(report => report.severity), ["Critical", "High"]);
  assert.equal(matchesHotspotSeverity(unrated, DEFAULT_HOTSPOT_SEVERITY), false);
  assert.match(source, /useState\(DEFAULT_HOTSPOT_SEVERITY\)/);
  assert.match(source, /setSelectedSeverity\(DEFAULT_HOTSPOT_SEVERITY\)/);
});

test("reviewers can explicitly view every severity, including unrated reports", () => {
  const input = [...reports, unrated];
  assert.equal(input.filter(report => matchesHotspotSeverity(report, "All")).length, 5);
  for (const severity of ["Critical", "High", "Medium", "Low", "Unknown"]) {
    assert.equal(input.filter(report => matchesHotspotSeverity(report, severity)).length, 1);
    assert.ok(HOTSPOT_SEVERITY_OPTIONS.some(option => option.value === severity));
  }
});

test("severity normalization never manufactures a rating from a missing credibility analysis", () => {
  for (const ai_score of [null, undefined, "", " ", NaN, Infinity]) assert.equal(hotspotReportSeverity({ ai_score, severity: "High" }), "Unknown");
  assert.equal(hotspotReportSeverity({ ai_score: 0, severity: "HIGH" }), "High");
  assert.equal(hotspotReportSeverity({ ai_score: "50", severity: "Moderate" }), "Medium");
});

function project(severity) {
  const body = source.match(/const hotspots = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[filteredReports, clustering, selectedSeverity\]\)/)[1];
  return vm.runInNewContext(`(() => {${body}})()`, {
    filteredReports: reports, selectedSeverity: severity, matchesHotspotSeverity,
    clustering: { clusters: [{ key: "cluster", reportIds: reports.map(report => report.id), uniqueLocationCount: 4 }] },
    getDate: () => null, getIncidentType: () => "Incident", getLevel: count => `count-${count}`,
  });
}

test("severity changes displayed members without changing DBSCAN membership or concentration counts", () => {
  const high = project(DEFAULT_HOTSPOT_SEVERITY)[0];
  const all = project("All")[0];
  assert.equal(high.count, 4);
  assert.equal(all.count, 4);
  assert.equal(high.level, all.level);
  assert.equal(high.uniqueLocationCount, 4);
  assert.deepEqual(high.reportIds, all.reportIds);
  assert.equal(high.reports.length, 4);
  assert.equal(high.displayedReports.length, 2);
  assert.equal(all.displayedReports.length, 4);
});

test("severity is a display filter, not a backend clustering parameter", () => {
  const query = source.match(/useRetainedApiQuery\(\{([\s\S]*?)\}\);/)[1];
  assert.doesNotMatch(query, /selectedSeverity|severity:/);
  assert.match(source, /selectedHotspot\.displayedReports\.filter/);
  assert.match(source, /hotspot\.displayedReports\.map/);
  assert.match(source, /hotspot\.displayedReports\.length > 0 &&/);
  assert.match(source, /High & Critical reports/);
});
