import { clusterHotspots } from "../../src/services/hotspotClusteringService.js";
import { hasReportCoordinates, barangaysAtCoordinates } from "../../src/utils/argaoLocation.js";
import { boundarySha256, fingerprint, type Dataset, type GroundTruth, type Scenario, type ScenarioTruth, type Split } from "./syntheticDataset.js";

export type Parameters = { epsMeters: number; minLocations: number };
export const PARAMETER_GRID: Parameters[] = [100, 150, 300, 500].flatMap((epsMeters) =>
  [3, 4, 5, 6].map((minLocations) => ({ epsMeters, minLocations })));

export function validateDataset(dataset: Dataset, truth: GroundTruth) {
  if (dataset?.metadata?.schemaVersion !== 1 || truth?.schemaVersion !== 1 || dataset.metadata.dataMode !== "synthetic") throw new Error("Unsupported synthetic dataset schema.");
  if (dataset.metadata.boundarySha256 !== boundarySha256) throw new Error("Boundary fingerprint changed; regenerate this dataset or use the recorded boundary version.");
  if (truth.datasetSha256 !== fingerprint(dataset)) throw new Error("Dataset fingerprint does not match ground truth.");
  if (!Number.isFinite(Date.parse(dataset.metadata.asOf)) || dataset.metadata.windowDays !== 30) throw new Error("Invalid reference time/window.");
  if (!Array.isArray(dataset.scenarios) || !dataset.scenarios.length || !Array.isArray(truth.scenarios) || dataset.scenarios.length !== truth.scenarios.length) throw new Error("Missing scenarios or ground truth.");
  const sceneIds = new Set<string>();
  const reportIds = new Set<string>();
  for (const scenario of dataset.scenarios) {
    if (sceneIds.has(scenario.id) || !["tuning", "holdout"].includes(scenario.split)) throw new Error("Duplicate scenario ID or invalid split.");
    sceneIds.add(scenario.id);
    const matches = truth.scenarios.filter((item) => item.scenarioId === scenario.id);
    if (matches.length !== 1 || matches[0]!.split !== scenario.split) throw new Error(`Missing/duplicate truth for ${scenario.id}.`);
    const expected = matches[0]!;
    const rows = new Map(scenario.reports.map((report) => [report.id, report]));
    for (const report of scenario.reports) {
      if (!report.id || reportIds.has(report.id) || report.is_synthetic !== true) throw new Error("Duplicate report ID or non-synthetic source row.");
      reportIds.add(report.id);
      if ("cluster" in report || "expectedCluster" in report) throw new Error("Ground-truth labels must not appear in input reports.");
    }
    const covered = new Set<string>();
    const coordinateKeys = new Set<string>();
    const locationIds = new Set<string>();
    for (const location of expected.locations) {
      const coords = location.coordinates;
      const key = `${coords.latitude},${coords.longitude}`;
      if (!hasReportCoordinates(coords) || !barangaysAtCoordinates(coords.latitude, coords.longitude).length) throw new Error("Eligible ground-truth location must be inside Argao.");
      if (coordinateKeys.has(key) || locationIds.has(location.id) || !location.reportIds.length || !(location.cluster === null || typeof location.cluster === "string" && location.cluster.length > 0)) throw new Error("Invalid or duplicate truth location.");
      coordinateKeys.add(key); locationIds.add(location.id);
      for (const id of location.reportIds) {
        const report = rows.get(id);
        if (!report || covered.has(id) || Number(report.latitude) !== coords.latitude || Number(report.longitude) !== coords.longitude) throw new Error("Truth location/report coordinates or IDs disagree.");
        covered.add(id);
      }
    }
    for (const { reportId, reason } of expected.excluded) {
      if (!rows.has(reportId) || covered.has(reportId) || !reason) throw new Error("Invalid exclusion ground truth.");
      covered.add(reportId);
    }
    if (covered.size !== rows.size) throw new Error("Ground truth must account for every report exactly once.");
    if (new Set(expected.locations.map((item) => item.cluster).filter((label) => label !== null)).size !== expected.expectedClusterCount) throw new Error("Expected cluster count disagrees with labels.");
  }
  for (const split of ["tuning", "holdout"]) if (!dataset.scenarios.some((scene) => scene.split === split)) throw new Error("Both tuning and held-out scenarios are required.");
}

export type Counts = {
  pairTruePositive: number;
  pairFalsePositive: number;
  pairFalseNegative: number;
  noiseTruePositive: number;
  noiseFalsePositive: number;
  noiseFalseNegative: number;
  falseIncludedReports: number;
  missingEligibleReports: number;
  inconsistentDuplicateLocations: number;
};
const emptyCounts = (): Counts => ({ pairTruePositive: 0, pairFalsePositive: 0, pairFalseNegative: 0,
  noiseTruePositive: 0, noiseFalsePositive: 0, noiseFalseNegative: 0,
  falseIncludedReports: 0, missingEligibleReports: 0, inconsistentDuplicateLocations: 0 });
const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
export function metrics(counts: Counts) {
  return {
    pairPrecision: ratio(counts.pairTruePositive, counts.pairTruePositive + counts.pairFalsePositive),
    pairRecall: ratio(counts.pairTruePositive, counts.pairTruePositive + counts.pairFalseNegative),
    pairF1: ratio(2 * counts.pairTruePositive, 2 * counts.pairTruePositive + counts.pairFalsePositive + counts.pairFalseNegative),
    noisePrecision: ratio(counts.noiseTruePositive, counts.noiseTruePositive + counts.noiseFalsePositive),
    noiseRecall: ratio(counts.noiseTruePositive, counts.noiseTruePositive + counts.noiseFalseNegative),
  };
}

/** Compare unique spatial locations, not duplicated report pairs. All isolated
 * locations are distinct singletons; noise is never counted as a big cluster.
 */
export function scoreScenario(scenario: Scenario, expected: ScenarioTruth, parameters: Parameters, asOf: string) {
  const result = clusterHotspots(scenario.reports, { ...parameters, now: Date.parse(asOf), windowDays: 30 });
  const counts = emptyCounts();
  const assignments = new Map<string, string | null>();
  for (const cluster of result.clusters) for (const id of cluster.reportIds) {
    if (assignments.has(id)) throw new Error("Engine assigned a report multiple times.");
    assignments.set(id, cluster.key);
  }
  for (const id of result.noiseReportIds) {
    if (assignments.has(id)) throw new Error("Engine assigned a report to both noise and a cluster.");
    assignments.set(id, null);
  }
  const sourceIds = new Set(scenario.reports.map((report) => report.id));
  for (const id of assignments.keys()) if (!sourceIds.has(id)) throw new Error("Engine returned an unknown report ID.");
  for (const { reportId } of expected.excluded) if (assignments.has(reportId)) counts.falseIncludedReports++;
  const predictions = expected.locations.map((location) => {
    const labels = new Set<string | null | undefined>();
    for (const id of location.reportIds) {
      if (!assignments.has(id)) counts.missingEligibleReports++;
      labels.add(assignments.get(id));
    }
    if (labels.size !== 1) counts.inconsistentDuplicateLocations++;
    const predicted = labels.size === 1 ? labels.values().next().value : undefined;
    const actualNoise = location.cluster === null;
    const predictedNoise = predicted === null;
    if (actualNoise && predictedNoise) counts.noiseTruePositive++;
    if (!actualNoise && predictedNoise) counts.noiseFalsePositive++;
    if (actualNoise && !predictedNoise) counts.noiseFalseNegative++;
    return { locationId: location.id, expected: location.cluster, predicted: predicted ?? null, missing: predicted === undefined };
  });
  for (let i = 0; i < predictions.length; i++) {
    for (let j = i + 1; j < predictions.length; j++) {
      const a = predictions[i]!;
      const b = predictions[j]!;
      const trueSame = a.expected !== null && a.expected === b.expected;
      const predictedSame = !a.missing && !b.missing && a.predicted !== null && a.predicted === b.predicted;
      if (trueSame && predictedSame) counts.pairTruePositive++;
      if (!trueSame && predictedSame) counts.pairFalsePositive++;
      if (trueSame && !predictedSame) counts.pairFalseNegative++;
    }
  }
  const exactMatch = counts.pairFalsePositive === 0 && counts.pairFalseNegative === 0 &&
    counts.noiseFalsePositive === 0 && counts.noiseFalseNegative === 0 &&
    counts.falseIncludedReports === 0 && counts.missingEligibleReports === 0 && counts.inconsistentDuplicateLocations === 0 &&
    result.clusters.length === expected.expectedClusterCount;
  return {
    scenarioId: scenario.id, split: scenario.split,
    expectedClusterCount: expected.expectedClusterCount, detectedClusterCount: result.clusters.length,
    eligibleLocationCount: expected.locations.length, reportCount: scenario.reports.length,
    counts, metrics: metrics(counts), exactMatch, assignments: predictions,
    engineSummary: result.summary,
  };
}

export function scoreSplit(dataset: Dataset, truth: GroundTruth, split: Split, parameters: Parameters) {
  const byId = new Map(truth.scenarios.map((scene) => [scene.scenarioId, scene]));
  const scenes = dataset.scenarios.filter((scene) => scene.split === split).map((scene) =>
    scoreScenario(scene, byId.get(scene.id)!, parameters, dataset.metadata.asOf));
  const counts = emptyCounts();
  for (const scene of scenes) for (const key of Object.keys(counts) as (keyof Counts)[]) counts[key] += scene.counts[key];
  return { parameters, counts, metrics: metrics(counts), exactScenarios: scenes.filter((scene) => scene.exactMatch).length, scenarioCount: scenes.length, scenarios: scenes };
}

export function evaluateDataset(dataset: Dataset, truth: GroundTruth, grid: Parameters[] = PARAMETER_GRID) {
  validateDataset(dataset, truth);
  if (!grid.length) throw new Error("Parameter grid must not be empty.");
  // Only tuning scenarios participate in selection; no sweep of holdout scores.
  const tuningGrid = grid.map((parameters) => scoreSplit(dataset, truth, "tuning", parameters));
  const ranked = [...tuningGrid].sort((a, b) =>
    (b.metrics.pairF1 ?? -1) - (a.metrics.pairF1 ?? -1) ||
    b.exactScenarios - a.exactScenarios ||
    a.counts.falseIncludedReports - b.counts.falseIncludedReports ||
    a.counts.noiseFalseNegative - b.counts.noiseFalseNegative ||
    a.parameters.epsMeters - b.parameters.epsMeters || b.parameters.minLocations - a.parameters.minLocations);
  const selected = { ...ranked[0]!.parameters };
  const holdout = scoreSplit(dataset, truth, "holdout", selected);
  return {
    schemaVersion: 1,
    datasetSha256: fingerprint(dataset),
    dataMode: "synthetic",
    selectionRule: "Tuning micro pair-F1 descending; exact scenarios descending; false included reports ascending; falsely clustered noise locations ascending; epsilon ascending; minimum locations descending. Holdout evaluated once after selection.",
    selectedParameters: selected,
    parametersChangedInApplication: false,
    tuningGrid,
    holdout,
    limitation: "Synthetic scenario recovery only, not real-world incident prediction accuracy. Settings are suggestions for this generator, not validated Argao patrol thresholds.",
  };
}

const display = (value: number | null) => value === null ? "N/A" : value.toFixed(4);
export function evaluationMarkdown(evaluation: ReturnType<typeof evaluateDataset>, dataset: Dataset) {
  const { holdout, selectedParameters } = evaluation;
  return [
    "# Synthetic hotspot clustering evaluation", "",
    "> FICTIONAL TEST DATA ONLY. This is cluster recovery, not forecast accuracy or evidence of policing effectiveness.", "",
    `- Seed: ${dataset.metadata.seed}; reference time: ${dataset.metadata.asOf}; window: 30 days.`,
    `- Generator: ${dataset.metadata.generatorVersion}.`,
    `- Dataset SHA-256: \`${evaluation.datasetSha256}\`.`,
    `- Boundary SHA-256: \`${dataset.metadata.boundarySha256}\`.`,
    `- Selected using tuning scenarios only: **${selectedParameters.epsMeters} m / ${selectedParameters.minLocations} distinct locations** (including self).`,
    "- Application parameters were NOT changed. Ground truth is never sent to the clustering engine.",
    `- Selection: ${evaluation.selectionRule}`, "",
    "## Parameter sensitivity — tuning split only", "",
    "| Radius (m) | Min locations | Pair precision | Pair recall | Pair F1 | Exact scenarios | Noise recall | Wrongly included excluded reports |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...evaluation.tuningGrid.map((run) => `| ${run.parameters.epsMeters} | ${run.parameters.minLocations} | ${display(run.metrics.pairPrecision)} | ${display(run.metrics.pairRecall)} | ${display(run.metrics.pairF1)} | ${run.exactScenarios}/${run.scenarioCount} | ${display(run.metrics.noiseRecall)} | ${run.counts.falseIncludedReports} |`),
    "", "## Held-out scenarios — selected parameters only", "",
    `Micro pair F1: **${display(holdout.metrics.pairF1)}**. Exact scenarios: **${holdout.exactScenarios}/${holdout.scenarioCount}**.`, "",
    "| Scenario | Expected clusters | Detected | Pair F1 | Noise recall | Exclusion errors | Missing eligible reports | Exact |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
    ...holdout.scenarios.map((scene) => `| ${scene.scenarioId} | ${scene.expectedClusterCount} | ${scene.detectedClusterCount} | ${display(scene.metrics.pairF1)} | ${display(scene.metrics.noiseRecall)} | ${scene.counts.falseIncludedReports} | ${scene.counts.missingEligibleReports} | ${scene.exactMatch ? "Yes" : "No"} |`),
    "", "## Interpretation", "",
    "Metrics use distinct locations, so forty reports at one pin do not inflate cluster-recovery accuracy. A pair is positive only when two locations belong to the same non-noise cluster. Isolated points are separate singletons, never one big noise cluster. N/A means there are no applicable positive/predicted-positive pairs, not an automatic perfect score.", "",
    "Exact requires the correct partition AND noise labels, report eligibility, duplicate consistency, and cluster count. Exclusion errors count excluded records that the engine returned as either clustered or noise. Raw counts and per-location predictions are retained in evaluation.json.", "",
    "Tuning and holdout have independent random streams but share designed scenario families; this tests new synthetic realizations, not generalization to police data. The scenarios deliberately plant clusters and do not reproduce street networks, population density, actual incident frequencies or reporting bias. Do not tune again on the held-out results; design a new untouched evaluation if the generator or method changes.", "",
    evaluation.limitation, "",
  ].join("\n");
}
