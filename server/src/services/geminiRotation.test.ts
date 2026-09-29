import assert from "node:assert/strict";
import { test } from "node:test";
import {
  __testing,
  candidateModels,
  clearModelExhaustion,
  markModelExhausted,
} from "./geminiRotation.js";

test("candidateModels puts the primary model first and never duplicates it", () => {
  clearModelExhaustion();
  const models = candidateModels("gemini-3.6-flash");
  assert.equal(models[0], "gemini-3.6-flash");
  assert.equal(new Set(models).size, models.length);
  assert.equal(models.length, 1 + __testing.ROTATION_POOL.length);
});

test("candidateModels deduplicates a primary that is also in the pool", () => {
  clearModelExhaustion();
  const models = candidateModels("gemini-3.8-flash");
  assert.equal(models[0], "gemini-3.8-flash");
  assert.equal(models.filter((m) => m === "gemini-3.8-flash").length, 1);
});

test("exhausted models are skipped until the cooldown passes", () => {
  clearModelExhaustion();
  markModelExhausted("gemini-3.6-flash");
  const models = candidateModels("gemini-3.6-flash");
  assert.ok(!models.includes("gemini-3.6-flash"));
  assert.equal(models[0], "gemini-3.8-flash");
});

test("escalating cooldowns cap at the maximum", () => {
  clearModelExhaustion();
  for (let i = 0; i < 10; i++) markModelExhausted("gemini-3.5-flash");
  const until = __testing.exhaustedUntil.get("gemini-3.5-flash") ?? 0;
  const remaining = until - Date.now();
  assert.ok(remaining > 0);
  assert.ok(remaining <= __testing.MAX_COOLDOWN_MS);
});

test("a successful model clears its exhaustion memory", () => {
  clearModelExhaustion();
  markModelExhausted("gemini-3.7-flash");
  clearModelExhaustion("gemini-3.7-flash");
  const models = candidateModels("gemini-3.6-flash");
  assert.ok(models.includes("gemini-3.7-flash"));
});

test("when every model is cooling down the full list is still returned", () => {
  clearModelExhaustion();
  const all = ["gemini-3.6-flash", ...__testing.ROTATION_POOL];
  all.forEach(markModelExhausted);
  const models = candidateModels("gemini-3.6-flash");
  assert.equal(models.length, all.length);
  clearModelExhaustion();
});
