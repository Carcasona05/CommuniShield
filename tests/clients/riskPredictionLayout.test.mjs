import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../clients/app/(admin)/Admin_Risk_Prediction.jsx", import.meta.url), "utf8");
const styles = vm.runInNewContext(source.slice(source.indexOf("const styles = StyleSheet.create")) + "\nstyles;", {
  StyleSheet: { create: value => value },
});

test("removed risk summary cards and concentration table are no longer rendered", () => {
  assert.doesNotMatch(source, /Current risk indicators|Current report concentrations by barangay|<Metric|current-report-zone/);
  assert.doesNotMatch(source, /buildRiskZones|handleZoneSelect/);
});

test("map and observed evidence have equal fixed heights, with evidence scrolling inside its card", () => {
  assert.equal(styles.leftBox60.height, styles.rightBox40.height);
  assert.ok(styles.leftBox60.height > 0);
  assert.equal(styles.evidenceScroll.flex, 1);
  assert.equal(styles.evidenceScroll.minHeight, 0);
  assert.match(source, /<ScrollView testID="risk-evidence-scroll"[^>]*nestedScrollEnabled/);
  assert.equal(styles.mapFrame.flex, 1);
});

test("barangay changes use one current snapshot instead of creating scoped network requests", () => {
  const query = source.match(/useRetainedApiQuery\(\{([\s\S]*?)\}\);/)[1];
  assert.match(query, /params: \{ view: "current" \}/);
  assert.doesNotMatch(query, /selectedBarangay/);
  assert.match(source, /reportsByBarangay\.get\(selectedBarangay\)/);
  assert.match(source, /outlook\?\.currentByBarangay\?\.\[selectedBarangay\]/);
});

test("the map stays mounted for empty barangays instead of recreating the iframe", () => {
  assert.equal((source.match(/<AdminHeatMap\b/g) || []).length, 1);
  assert.doesNotMatch(source, /currentMapReports\.length\s*\?\s*\(/);
  assert.match(source, /pointerEvents="none" style=\{styles\.mapNotice\}/);
});
