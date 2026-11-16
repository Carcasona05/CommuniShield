import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { getSettings, updateSettings, validateSetting } from "./controllers/settingsController.js";
import { supabaseAdmin } from "./config/supabaseAdmin.js";
import { profileService } from "./services/authService.js";
import { aiService } from "./services/aiService.js";
import { readFileSync } from "node:fs";

const request = (settings = {}) => ({ user: { id: "super-admin" }, body: { settings } }) as unknown as Request;
function response() {
  const output = { status: 200, body: {} as any };
  const res = { status(value: number) { output.status = value; return this; },
    json(body: unknown) { output.body = body; return this; } } as unknown as Response;
  return { res, output };
}

test("retired endpoint overrides are rejected while model metadata remains supported", () => {
  for (const value of ["", "https://example.com/models", "invalid"]) {
    assert.ok("error" in validateSetting("ai_api_endpoint", value));
  }
  assert.deepEqual(validateSetting("ai_model_version", "gemini-2.5-flash"), { value: "gemini-2.5-flash" });
});

test("settings reads hide a leftover retired endpoint even before the cleanup SQL is run", async t => {
  t.mock.method(profileService, "getProfile", (async () => ({ data: { role: "super_admin" } })) as never);
  t.mock.method(supabaseAdmin, "from", (() => ({ select: async () => ({ data: [
    { key: "ai_api_endpoint", value: "https://old.example/models" },
    { key: "ai_model_version", value: "gemini-2.5-flash" },
  ], error: null }) })) as never);
  const { res, output } = response();
  await getSettings(request(), res);
  assert.equal(output.status, 200);
  assert.equal("ai_api_endpoint" in output.body.settings, false);
  assert.equal(output.body.settings.ai_model_version, "gemini-2.5-flash");
});

test("settings updates cannot recreate the endpoint row", async t => {
  t.mock.method(profileService, "getProfile", (async () => ({ data: { role: "super_admin" } })) as never);
  const writes: unknown[] = [];
  t.mock.method(supabaseAdmin, "from", (() => ({ upsert: async (rows: unknown) => { writes.push(rows); return { error: null }; } })) as never);
  let result = response();
  await updateSettings(request({ ai_api_endpoint: "https://old.example/models" }), result.res);
  assert.equal(result.output.status, 400);
  assert.equal(writes.length, 0);
  result = response();
  await updateSettings(request({ ai_api_endpoint: "https://old.example/models", sentiment_local_model_enabled: "true" }), result.res);
  assert.equal(result.output.status, 200);
  assert.deepEqual(writes, [[{ key: "sentiment_local_model_enabled", value: "true" }]]);
});

test("AI config uses the built-in Gemini URL and never loads a database endpoint override", async t => {
  let selectedKeys: string[] = [];
  t.mock.method(supabaseAdmin, "from", (() => ({ select() { return this; }, async in(_column: string, keys: string[]) {
    selectedKeys = keys;
    return { data: [{ key: "ai_model_name", value: "gemini-2.5-flash" },
      { key: "ai_api_endpoint", value: "https://old.example/models" }], error: null };
  } })) as never);
  t.mock.method(console, "log", () => {});
  t.mock.method(globalThis, "fetch", async (input: unknown) => {
    assert.ok(String(input).startsWith("https://generativelanguage.googleapis.com/v1beta/models?"));
    return new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 });
  });
  const config = await aiService.getConfig();
  assert.equal(selectedKeys.includes("ai_api_endpoint"), false);
  assert.equal(config.api_endpoint, "https://generativelanguage.googleapis.com/v1beta/models");
  assert.equal(config.model_name, "gemini-2.5-flash");
});

test("Super Admin removes only the obsolete section and seeds no longer recreate its endpoint", () => {
  const ui = readFileSync(new URL("../../clients/app/(sadmin)/SAdmin_Settings.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /API and Model Settings|API or model settings|Test Connection|modelVersion|apiEndpoint|setApiEndpoint|setModelVersion/);
  assert.match(ui, /Local Sentiment Model/);
  assert.match(ui, /Gemini Sentiment/);
  assert.doesNotMatch(ui, /Map Settings/);
  for (const file of ["../../DB_Schema/admins_schema.sql", "../../DB_Schema/finalized/02_reference_data.sql"]) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /\('ai_api_endpoint'/);
  }
});
