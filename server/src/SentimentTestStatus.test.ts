import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { getSentimentTestModels, benchmarkMetrics, sentimentTestStatusDependencies as deps } from "./services/sentimentTestStatus.js";

test("status reports recorded macro-F1 only for matching artifacts and never invents Gemini F1", async t => {
  t.mock.method(deps, "directory", () => "/fixture/server/models");
  t.mock.method(deps, "settings", async () => ({ sentiment_gemini_enabled: "false" }));
  t.mock.method(deps, "supports", (async () => ({ data: [], error: null })) as never);
  t.mock.method(deps, "readFile", (async (path: string) => {
    if (path.replaceAll("\\", "/").includes("server/models") && path.endsWith("baseline_metrics.json")) throw new Error("missing");
    if (path.endsWith("baseline_metrics.json")) return JSON.stringify({ models: [
      { language: "cebuano", test_metrics: { macro_f1: .72 } },
      { language: "english", test_metrics: { macro_f1: .88 } },
    ] });
    if (path.includes("datasets") && path.endsWith("sentiment_cebuano.onnx")) return Buffer.from("different");
    return Buffer.from("paired");
  }) as never);
  const result = await getSentimentTestModels();
  const builtin = result.models.find(model => model.source === "builtin")!;
  assert.equal(builtin.status, "active");
  assert.equal(builtin.metrics.find(metric => metric.language === "english")?.macroF1, .88);
  assert.equal(builtin.metrics.find(metric => metric.language === "cebuano")?.macroF1, null);
  assert.deepEqual(result.models.find(model => model.source === "gemini")?.metrics, []);
});

test("precision and recall are unweighted three-class macro averages; accuracy uses supports", () => {
  const result = benchmarkMetrics({ macro_f1: .7, per_class: {
    negative: { precision: .6, recall: .5, support: 10 },
    neutral: { precision: .8, recall: .9, support: 20 },
    positive: { precision: 1, recall: .7, support: 10 },
  } });
  assert.equal(result.macroF1, .7);
  assert.ok(Math.abs(result.precision! - .8) < 1e-12);
  assert.ok(Math.abs(result.recall! - .7) < 1e-12);
  assert.equal(result.accuracy, .75);
  assert.equal(benchmarkMetrics({ accuracy: .9 }).accuracy, .9);
  assert.deepEqual(benchmarkMetrics(), { macroF1: null, accuracy: null, precision: null, recall: null });
});

test("portable manifest restores the deployed Cebuano benchmark without requiring the backup folder", async t => {
  t.mock.method(deps, "settings", async () => ({ sentiment_gemini_enabled: "false" }));
  t.mock.method(deps, "supports", (async () => ({ data: [], error: null })) as never);
  const result = await getSentimentTestModels();
  const cebuano = result.models[0]!.metrics.find(metric => metric.language === "cebuano")!;
  assert.equal(cebuano.macroF1, .7220659399470538);
  assert.equal(cebuano.accuracy, .7693114295700804);
  assert.ok(cebuano.precision! > 0);
  assert.ok(cebuano.recall! > 0);
});

test("missing benchmark metadata is shown as unavailable, and disabled local models stay disabled", async t => {
  t.mock.method(deps, "directory", () => "/missing/models");
  t.mock.method(deps, "settings", async () => ({ sentiment_local_model_enabled: "false" }));
  t.mock.method(deps, "supports", (async () => ({ data: [], error: { code: "offline" } })) as never);
  t.mock.method(deps, "readFile", (async () => { throw new Error("missing"); }) as never);
  const result = await getSentimentTestModels();
  assert.equal(result.models[0]?.status, "disabled");
  assert.ok(result.models[0]?.metrics.every(metric => metric.macroF1 === null));
  assert.ok(result.warning);
});
