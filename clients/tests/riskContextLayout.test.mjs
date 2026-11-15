import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const page = readFileSync(new URL("../app/(admin)/Admin_Risk_Prediction.jsx", import.meta.url), "utf8");
const chart = readFileSync(new URL("../components/Admin_compo/SentimentEvidenceChart.jsx", import.meta.url), "utf8");
const stylesOf = source => vm.runInNewContext(source.slice(source.indexOf("const styles = StyleSheet.create")) + "\nstyles;", {
  StyleSheet: { create: value => value },
});

test("risk context uses short headings and one consolidated interpretation note", () => {
  assert.match(page, />Sentiment & verification<\/Text>/);
  assert.match(page, /styles.contextScope\}>\{selectedBarangay\}/);
  assert.match(page, />Spatial hotspots<\/Text>/);
  assert.match(page, /Reported activity only—not a measure of danger, proof of safety, or a forecast/);
  assert.doesNotMatch(page, /Successful multilingual analyses only|Intersecting spatial hotspots|selectedCurrent\?\.note \|\|/);
  assert.match(page, /Automated severity ratings need human review/);
});

test("analysis details are collapsed by default without dropping coverage or methodology", () => {
  assert.match(chart, /useState\(false\)/);
  assert.match(chart, /accessibilityState=\{\{ expanded: showDetails \}\}/);
  assert.match(chart, /\{showDetails && <View/);
  assert.match(chart, /setShowDetails\(value => !value\)/);
  assert.match(chart, /reports.usable\} of \{reports.total\} analyzed/);
  assert.match(chart, /comments.usable\} of \{comments.total\} analyzed/);
  assert.match(chart, /Equal weight per report/);
  assert.match(chart, /policy.minimumConfidence/);
  assert.match(chart, /languageText\(reports.languages\)/);
  assert.match(chart, /reports.total - reports.usable/);
  assert.match(chart, /at least 3 usable analyses/);
  assert.match(chart, /Bars show tone, not danger or forecast probability/);
});

test("key counts, legends and supporting copy are larger and use dark high-contrast text", () => {
  const pageStyles = stylesOf(page);
  const chartStyles = stylesOf(chart);
  assert.ok(pageStyles.statValue.fontSize >= 20);
  assert.ok(pageStyles.statLabel.fontSize >= 12);
  assert.ok(pageStyles.contextNote.fontSize >= 12);
  assert.ok(chartStyles.legendText.fontSize >= 12);
  assert.ok(chartStyles.detail.fontSize >= 12);
  assert.ok(chartStyles.barTrack.height >= 16);
  assert.ok(chartStyles.detailsToggle.minHeight >= 36);
  assert.equal(pageStyles.contextRow.flexWrap, "wrap");
  assert.equal(pageStyles.contextHeader.flexWrap, "wrap");
  assert.equal(pageStyles.contextNote.color, "#40516F");
  assert.equal(chartStyles.legendText.color, "#334155");
});

test("verification, severity, report/comment bars and activity retain their existing data sources", () => {
  assert.match(page, /evidence=\{selectedCurrent\?\.evidence\}/);
  assert.match(page, /selectedCurrent\?\.evidence\?\.verification\?\.verified/);
  assert.match(page, /selectedCurrent\?\.severity\?\.\[level\]/);
  assert.match(page, /selectedCurrent.clusters.map/);
  assert.match(chart, /testID="sentiment-report-bar" source=\{reports\} showCounts/);
  assert.match(chart, /testID="sentiment-comment-bar" source=\{comments\}/);
  assert.match(chart, /<ActivityBars activity=\{activity\}/);
});
