import assert from "node:assert/strict";
import { test } from "node:test";
import { barangaysAtCoordinates } from "../../server/src/utils/argaoLocation.js";
import { evaluateDataset, metrics, PARAMETER_GRID, scoreScenario, validateDataset } from "../../server/scripts/hotspot/evaluation.js";
import { DEFAULT_AS_OF, fingerprint, generateSyntheticDataset, type Scenario, type ScenarioTruth, type SyntheticReport } from "../../server/scripts/hotspot/syntheticDataset.js";

const generated = generateSyntheticDataset();

test("same seed/time generates byte-identical synthetic reports and ground truth", () => {
  assert.deepEqual(generateSyntheticDataset(), generated);
  const other = generateSyntheticDataset(42);
  assert.notEqual(fingerprint(other.dataset), fingerprint(generated.dataset));
  assert.equal(other.truth.scenarios.length, 14);
});

test("all scenarios have complete independent truth and eligible pins inside Argao", () => {
  validateDataset(generated.dataset, generated.truth);
  assert.equal(generated.dataset.scenarios.length, 14);
  assert.equal(generated.dataset.scenarios.filter((scene) => scene.split === "tuning").length, 7);
  assert.equal(generated.dataset.scenarios.filter((scene) => scene.split === "holdout").length, 7);
  for (const scene of generated.truth.scenarios) {
    for (const location of scene.locations) {
      assert.ok(barangaysAtCoordinates(location.coordinates.latitude, location.coordinates.longitude).length > 0);
    }
  }
  for (const scene of generated.dataset.scenarios) {
    for (const report of scene.reports) {
      assert.equal(report.is_synthetic, true);
      assert.equal("cluster" in report, false);
      assert.equal("expectedCluster" in report, false);
    }
  }
  const tuning = new Set(generated.dataset.scenarios.filter((scene) => scene.split === "tuning").flatMap((scene) => scene.reports.map((report) => `${report.latitude},${report.longitude}`)));
  const holdout = generated.dataset.scenarios.filter((scene) => scene.split === "holdout").flatMap((scene) => scene.reports);
  // Outside-boundary quality-decoys are intentionally fixed, not real locations.
  for (const report of holdout.filter((report) => Number(report.latitude) < 11)) {
    assert.equal(tuning.has(`${report.latitude},${report.longitude}`), false);
  }
});

test("source fingerprints and label integrity prevent accidental data/truth mismatches", () => {
  const copy = structuredClone(generated);
  copy.dataset.scenarios[0]!.reports[0]!.status = "Archived";
  assert.throws(() => validateDataset(copy.dataset, copy.truth), /fingerprint/);
  const bad = structuredClone(generated);
  bad.truth.scenarios[0]!.locations[0]!.reportIds.push("nonexistent");
  assert.throws(() => validateDataset(bad.dataset, bad.truth), /coordinates or IDs disagree/);
  const boundary = structuredClone(generated);
  boundary.dataset.metadata.boundarySha256 = "changed";
  assert.throws(() => validateDataset(boundary.dataset, boundary.truth), /Boundary fingerprint/);
});

test("different seeds remain valid; reference dates are explicit rather than wall-clock driven", () => {
  for (const seed of [0, 1, 7, 0xFFFFFFFF]) {
    const fixture = generateSyntheticDataset(seed, "2025-06-01T00:00:00Z");
    validateDataset(fixture.dataset, fixture.truth);
    assert.equal(fixture.dataset.metadata.asOf, "2025-06-01T00:00:00.000Z");
  }
  assert.throws(() => generateSyntheticDataset(-1), /Seed/);
  assert.throws(() => generateSyntheticDataset(1.5), /Seed/);
  assert.throws(() => generateSyntheticDataset(1, "invalid"), /timestamp/);
});

test("known duplicate-only and scattered scenarios never become hotspots on the declared grid", () => {
  for (const scene of generated.dataset.scenarios.filter((scene) => /repeated-pin|scattered/.test(scene.id))) {
    const expected = generated.truth.scenarios.find((truth) => truth.scenarioId === scene.id)!;
    for (const settings of PARAMETER_GRID) {
      const score = scoreScenario(scene, expected, settings, DEFAULT_AS_OF);
      assert.equal(score.exactMatch, true, `${scene.id} ${JSON.stringify(settings)}`);
      assert.equal(score.metrics.pairF1, null, "no positive pairs is N/A, not fabricated 100% F1");
    }
  }
});

const report = (id: string, latitude: number, longitude = 123.5953): SyntheticReport => ({
  id, latitude, longitude, created_at: "2026-10-20T00:00:00Z", status: "Pending Review", is_synthetic: true, severity: "Low", details: "Synthetic test",
});
const simple: Scenario = { id: "simple", split: "tuning", reports: [report("a", 9.8816), report("b", 9.8818), report("c", 9.8816, 123.6059)] };
const simpleTruth: ScenarioTruth = {
  scenarioId: "simple", split: "tuning", description: "Two close locations, one isolated location.",
  locations: simple.reports.map((row, i) => ({ id: `point-${i}`, coordinates: { latitude: Number(row.latitude), longitude: Number(row.longitude) }, reportIds: [row.id], cluster: i < 2 ? "A" : null })),
  excluded: [], expectedClusterCount: 1,
};

test("pairwise metrics are label-invariant and penalize merges with noise", () => {
  const correct = scoreScenario(simple, simpleTruth, { epsMeters: 100, minLocations: 2 }, DEFAULT_AS_OF);
  assert.equal(correct.metrics.pairF1, 1);
  assert.equal(correct.exactMatch, true);
  const renamed = structuredClone(simpleTruth);
  for (const location of renamed.locations) if (location.cluster) location.cluster = "renamed";
  assert.deepEqual(scoreScenario(simple, renamed, { epsMeters: 100, minLocations: 2 }, DEFAULT_AS_OF).metrics, correct.metrics);
  const merged = scoreScenario(simple, simpleTruth, { epsMeters: 2000, minLocations: 2 }, DEFAULT_AS_OF);
  assert.equal(merged.counts.pairTruePositive, 1);
  assert.equal(merged.counts.pairFalsePositive, 2);
  assert.equal(merged.metrics.pairF1, 0.5);
  assert.equal(merged.metrics.noiseRecall, 0);
  assert.equal(merged.exactMatch, false);
});

test("duplicating a pin changes counts but not location-weighted evaluation metrics", () => {
  const duplicated = structuredClone(simple);
  const expected = structuredClone(simpleTruth);
  for (let i = 0; i < 40; i++) {
    const id = `copy-${i}`;
    duplicated.reports.push({ ...simple.reports[0]!, id });
    expected.locations[0]!.reportIds.push(id);
  }
  const original = scoreScenario(simple, simpleTruth, { epsMeters: 100, minLocations: 2 }, DEFAULT_AS_OF);
  const repeated = scoreScenario(duplicated, expected, { epsMeters: 100, minLocations: 2 }, DEFAULT_AS_OF);
  assert.deepEqual(original.counts, repeated.counts);
  assert.equal(repeated.exactMatch, true);
  assert.equal(repeated.engineSummary.repeatedPinReports, 40);
});

test("exclusion mistakes and missing eligible records cannot be hidden by high pair F1", () => {
  const missing = structuredClone(simple);
  missing.reports[2]!.created_at = "2020-01-01T00:00:00Z";
  const score = scoreScenario(missing, simpleTruth, { epsMeters: 100, minLocations: 2 }, DEFAULT_AS_OF);
  assert.equal(score.metrics.pairF1, 1);
  assert.equal(score.counts.missingEligibleReports, 1);
  assert.equal(score.exactMatch, false);
  const badTruth = structuredClone(simpleTruth);
  badTruth.locations.pop();
  badTruth.excluded.push({ reportId: "c", reason: "deliberately incorrect expected exclusion to test scorer" });
  const included = scoreScenario(simple, badTruth, { epsMeters: 100, minLocations: 2 }, DEFAULT_AS_OF);
  assert.equal(included.counts.falseIncludedReports, 1);
  assert.equal(included.exactMatch, false);
});

test("undefined metric denominators remain N/A", () => {
  const values = metrics({ pairTruePositive: 0, pairFalsePositive: 0, pairFalseNegative: 0, noiseTruePositive: 0, noiseFalsePositive: 0, noiseFalseNegative: 0, falseIncludedReports: 0, missingEligibleReports: 0, inconsistentDuplicateLocations: 0 });
  assert.equal(values.pairPrecision, null);
  assert.equal(values.pairRecall, null);
  assert.equal(values.pairF1, null);
});

test("parameter selection never uses held-out labels and does not change application settings", () => {
  // Small grid for this invariance test; full grid is exercised by the CLI run.
  const grid = [{ epsMeters: 100, minLocations: 3 }, { epsMeters: 300, minLocations: 4 }, { epsMeters: 500, minLocations: 6 }];
  const first = evaluateDataset(generated.dataset, generated.truth, grid);
  const changed = structuredClone(generated.truth);
  for (const scene of changed.scenarios.filter((scene) => scene.split === "holdout")) {
    for (const location of scene.locations) location.cluster = null;
    scene.expectedClusterCount = 0;
  }
  const second = evaluateDataset(generated.dataset, changed, grid);
  assert.deepEqual(first.selectedParameters, second.selectedParameters);
  assert.deepEqual(first.tuningGrid, second.tuningGrid);
  assert.notDeepEqual(first.holdout.metrics, second.holdout.metrics);
  assert.equal(first.parametersChangedInApplication, false);
  assert.equal(first.holdout.scenarioCount, 7);
  assert.throws(() => evaluateDataset(generated.dataset, generated.truth, []), /must not be empty/);
});
