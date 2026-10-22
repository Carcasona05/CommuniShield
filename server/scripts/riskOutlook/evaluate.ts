import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { EVALUATION_SEED, syntheticOutlookEvaluation } from "./syntheticEvaluation.js";

async function main() {
  const { values } = parseArgs({ options: { seed: { type: "string", default: String(EVALUATION_SEED) }, out: { type: "string" } } });
  if (!/^\d+$/.test(values.seed)) throw new Error("Invalid seed.");
  const result = syntheticOutlookEvaluation(Number(values.seed));
  const out = values.out ? resolve(values.out) : fileURLToPath(new URL(`../../../datasets/synthetic-risk-outlook/generated/seed-${values.seed}/`, import.meta.url));
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out); // Preserve previous experiments; require a new --out on rerun.
  const engineSha256 = createHash("sha256").update(await readFile(new URL("../../src/services/riskOutlookService.ts", import.meta.url))).digest("hex");
  const number = (value: number | null) => value === null ? "N/A" : value.toFixed(3);
  const lines = ["# Synthetic 7-day submitted-report outlook", "", "> Not real-world crime prediction accuracy. No database was read or modified.", "",
    `Seed: ${result.seed}. Engine SHA-256: \`${engineSha256}\`.`, "", result.protocol, "",
    `Scored held-out weeks: ${result.summary.scoredWeeks}. Selected pipeline MAE: ${number(result.summary.selectedMae)} reports/week. Baseline MAE: ${number(result.summary.baselineMae)}. Weekday candidate MAE: ${number(result.summary.weekdayMae)}.`,
    `Observed historical-error-range coverage: ${number(result.summary.observedRangeCoverage)} (fraction of scored synthetic weeks, NOT a calibrated confidence level).`, "",
    "| Scenario | Target week start | Training end | Actual | Selected estimate | Method | Absolute error | Baseline error | Range contains actual |", "|---|---|---|---:|---:|---|---:|---:|---|",
    ...result.scenarios.flatMap((scenario) => scenario.folds.map((fold) => fold.status === "available"
      ? `| ${scenario.name} | ${fold.targetStartDate} | ${fold.trainingEndDate} | ${fold.actual} | ${fold.estimate} | ${fold.method} | ${number(fold.absoluteError!)} | ${number(fold.baselineError!)} | ${fold.rangeContainsActual ? "Yes" : "No"} |`
      : `| ${scenario.name} | ${fold.targetStartDate} | — | — | Insufficient data | — | — | — | — |`)), "",
    "## Final history gates", "",
    ...result.scenarios.map((scenario) => `- ${scenario.name}: ${scenario.series.counts.length} observed days → ${scenario.gateStatus}.`), "",
    "The late-shock scenario deliberately breaks historical continuity. Retain misses and large errors. Do not reinterpret synthetic results as validation for Argao residents or tune on these held-out results.", "", result.limitation, "",
  ];
  const csv = ["scenario,date,submitted_reports,is_synthetic", ...result.scenarios.flatMap((scenario) => scenario.series.counts.map((count, i) => `${scenario.name},${new Date(Date.parse(`${scenario.series.startDate}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10)},${count},true`))].join("\r\n") + "\r\n";
  await Promise.all([
    writeFile(resolve(out, "evaluation.json"), JSON.stringify({ ...result, engineSha256 }, null, 2) + "\n", { flag: "wx" }),
    writeFile(resolve(out, "series.csv"), csv, { flag: "wx" }),
    writeFile(resolve(out, "REPORT.md"), lines.join("\n"), { flag: "wx" }),
  ]);
  console.log(`${resolve(out, "REPORT.md")}\nSelected pipeline MAE: ${number(result.summary.selectedMae)}; baseline MAE: ${number(result.summary.baselineMae)}. Synthetic only; app settings unchanged.`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
