import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { hasReportCoordinates } from "../../src/utils/argaoLocation.js";
import { DEFAULT_AS_OF, DEFAULT_SEED, generateSyntheticDataset } from "./syntheticDataset.js";

async function main() {
  const { values } = parseArgs({ options: {
    seed: { type: "string", default: String(DEFAULT_SEED) },
    "as-of": { type: "string", default: DEFAULT_AS_OF },
    out: { type: "string" }, help: { type: "boolean", default: false },
  } });
  if (values.help) {
    console.log("npm run hotspots:generate -- [--seed 20261021] [--as-of 2026-10-21T12:00:00Z] [--out NEW_DIRECTORY]\nOffline only. Creates a new directory; never imports reports or overwrites an existing run.");
    return;
  }
  if (!/^\d+$/.test(values.seed)) throw new Error("--seed must be a uint32 integer.");
  const seed = Number(values.seed);
  const { dataset, truth } = generateSyntheticDataset(seed, values["as-of"]);
  const out = values.out ? resolve(values.out) : fileURLToPath(new URL(`../../../datasets/synthetic-hotspots/generated/seed-${seed}/`, import.meta.url));
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out); // EEXIST is intentional: never overwrite a previous experiment.
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    ["scenario_id", "split", "id", "latitude", "longitude", "created_at", "status", "incident_category", "incident_type", "severity", "is_synthetic", "details"].map(escape).join(","),
    ...dataset.scenarios.flatMap((scenario) => scenario.reports.map((report) =>
      [scenario.id, scenario.split, report.id, report.latitude, report.longitude, report.created_at, report.status, report.incident_category, report.incident_type, report.severity, true, report.details].map(escape).join(","))),
  ].join("\r\n") + "\r\n";
  const features = dataset.scenarios.flatMap((scenario) => scenario.reports.filter(hasReportCoordinates).map((report) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [Number(report.longitude), Number(report.latitude)] },
    properties: { reportId: report.id, scenarioId: scenario.id, split: scenario.split, is_synthetic: true, status: report.status },
  })));
  const readme = [
    "# SYNTHETIC DATA — not police reports", "",
    `Seed: ${seed}. Reference time: ${dataset.metadata.asOf}. Generator: ${dataset.metadata.generatorVersion}.`,
    `Dataset payload SHA-256: ${truth.datasetSha256}.`, "",
    "reports.json is the source dataset. Ground-truth labels are separate in ground-truth.json and must NOT be passed into the clustering algorithm.",
    "reports.csv is a spreadsheet-friendly export. reports.geojson is for visualization; it includes deliberate outside-Argao decoys, omits invalid-coordinate rows and repeats shared pins for each report.",
    "Each scenario is evaluated independently. Do not combine overlapping scenarios into one citywide corpus. Only synthetic data, no people, police records, credentials, or database connection are used.", "",
    "| Scenario | Split | Reports | Distinct eligible locations | Expected clusters | Excluded decoys |", "|---|---|---:|---:|---:|---:|",
    ...dataset.scenarios.map((scenario) => {
      const expected = truth.scenarios.find((item) => item.scenarioId === scenario.id)!;
      return `| ${scenario.id} | ${scenario.split} | ${scenario.reports.length} | ${expected.locations.length} | ${expected.expectedClusterCount} | ${expected.excluded.length} |`;
    }), "", "## Scenario definitions", "",
    ...truth.scenarios.filter((scenario) => scenario.split === "tuning").map((scenario) => `- **${scenario.scenarioId.replace("tuning-", "")}**: ${scenario.description}`), "",
    dataset.metadata.sampling, "", dataset.metadata.limitation, "",
  ].join("\n");
  await Promise.all([
    writeFile(resolve(out, "reports.json"), json(dataset), { flag: "wx" }),
    writeFile(resolve(out, "ground-truth.json"), json(truth), { flag: "wx" }),
    writeFile(resolve(out, "reports.csv"), csv, { flag: "wx" }),
    writeFile(resolve(out, "reports.geojson"), json({ type: "FeatureCollection", features }), { flag: "wx" }),
    writeFile(resolve(out, "README.md"), readme, { flag: "wx" }),
  ]);
  console.log(`Created ${dataset.scenarios.length} independent synthetic scenarios (${dataset.scenarios.reduce((sum, scenario) => sum + scenario.reports.length, 0)} reports).\n${out}\nNo application database was read or modified.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
