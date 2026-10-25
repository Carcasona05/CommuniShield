import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { evaluateDataset, evaluationMarkdown } from "./evaluation.js";
import { DEFAULT_SEED, type Dataset, type GroundTruth } from "./syntheticDataset.js";

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: "string" }, out: { type: "string" }, help: { type: "boolean", default: false },
  } });
  if (values.help) {
    console.log("npm run hotspots:evaluate -- [--input DATASET_DIRECTORY] [--out NEW_DIRECTORY]\nTunes on tuning scenarios only, freezes settings, then evaluates held-out scenarios. Never changes application parameters.");
    return;
  }
  const input = values.input ? resolve(values.input) : fileURLToPath(new URL(`../../../datasets/synthetic-hotspots/generated/seed-${DEFAULT_SEED}/`, import.meta.url));
  const dataset = JSON.parse(await readFile(resolve(input, "reports.json"), "utf8")) as Dataset;
  const truth = JSON.parse(await readFile(resolve(input, "ground-truth.json"), "utf8")) as GroundTruth;
  const results = evaluateDataset(dataset, truth);
  const engineSha256 = createHash("sha256").update(await readFile(new URL("../../src/services/hotspotClusteringService.ts", import.meta.url))).digest("hex");
  const out = values.out ? resolve(values.out) : resolve(input, "evaluation");
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out); // Preserve prior results, including imperfect results.
  const lines = ["eps_meters,min_locations,pair_precision,pair_recall,pair_f1,exact_scenarios,scenario_count,noise_recall,false_included_reports",
    ...results.tuningGrid.map((run) => [run.parameters.epsMeters, run.parameters.minLocations, run.metrics.pairPrecision ?? "", run.metrics.pairRecall ?? "", run.metrics.pairF1 ?? "", run.exactScenarios, run.scenarioCount, run.metrics.noiseRecall ?? "", run.counts.falseIncludedReports].join(",")),
  ];
  await Promise.all([
    writeFile(resolve(out, "evaluation.json"), `${JSON.stringify({ ...results, engineSha256 }, null, 2)}\n`, { flag: "wx" }),
    writeFile(resolve(out, "tuning-grid.csv"), lines.join("\r\n") + "\r\n", { flag: "wx" }),
    writeFile(resolve(out, "REPORT.md"), `${evaluationMarkdown(results, dataset)}\nEngine SHA-256: \`${engineSha256}\`.\n`, { flag: "wx" }),
  ]);
  console.log(`Selected on tuning split: ${results.selectedParameters.epsMeters} m / ${results.selectedParameters.minLocations} distinct locations.\nHeld-out exact scenarios: ${results.holdout.exactScenarios}/${results.holdout.scenarioCount}; micro pair F1: ${results.holdout.metrics.pairF1?.toFixed(4) ?? "N/A"}.\n${resolve(out, "REPORT.md")}\nSynthetic scenario recovery only. Application parameters and database were not changed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
