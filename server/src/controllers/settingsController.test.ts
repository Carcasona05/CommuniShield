import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSetting } from "./settingsController.js";

test("validateSetting accepts booleans and rejects other values", () => {
  assert.deepEqual(validateSetting("ai_scoring_enabled", "true"), {
    value: "true",
  });
  assert.deepEqual(validateSetting("notification_push", "false"), {
    value: "false",
  });
  assert.ok("error" in validateSetting("ai_scoring_enabled", "yes"));
});

test("validateSetting restricts cebuano mode and normalizes legacy local", () => {
  assert.deepEqual(validateSetting("sentiment_cebuano_mode", "gemini"), {
    value: "gemini",
  });
  assert.deepEqual(validateSetting("sentiment_cebuano_mode", "disabled"), {
    value: "disabled",
  });
  assert.deepEqual(validateSetting("sentiment_cebuano_mode", "local"), {
    value: "gemini",
  });
  assert.ok("error" in validateSetting("sentiment_cebuano_mode", "transformer"));
});

test("validateSetting enforces threshold bounds as integers", () => {
  assert.deepEqual(validateSetting("ai_high_threshold", "85"), { value: "85" });
  assert.deepEqual(validateSetting("ai_medium_threshold", "0"), { value: "0" });
  assert.ok("error" in validateSetting("ai_high_threshold", "101"));
  assert.ok("error" in validateSetting("ai_medium_threshold", "-1"));
  assert.ok("error" in validateSetting("ai_high_threshold", "85.5"));
});

test("validateSetting enforces temperature and timeout ranges", () => {
  assert.deepEqual(validateSetting("ai_temperature", "0.1"), { value: "0.1" });
  assert.ok("error" in validateSetting("ai_temperature", "1.5"));
  assert.ok("error" in validateSetting("ai_temperature", "-0.1"));
  assert.deepEqual(validateSetting("ai_timeout", "30000"), { value: "30000" });
  assert.ok("error" in validateSetting("ai_timeout", "500"));
  assert.ok("error" in validateSetting("ai_timeout", "200000"));
});

test("validateSetting enforces map zoom and center bounds", () => {
  assert.deepEqual(validateSetting("map_default_zoom", "13"), { value: "13" });
  assert.ok("error" in validateSetting("map_default_zoom", "0"));
  assert.ok("error" in validateSetting("map_default_zoom", "21"));
  assert.deepEqual(validateSetting("map_center", "Argao, Cebu"), {
    value: "Argao, Cebu",
  });
  assert.ok("error" in validateSetting("map_center", ""));
  assert.ok("error" in validateSetting("map_center", "x".repeat(201)));
});

test("validateSetting validates model names and API endpoints", () => {
  assert.deepEqual(validateSetting("ai_model_name", "models/gemini-2.5-flash"), {
    value: "gemini-2.5-flash",
  });
  assert.ok("error" in validateSetting("ai_model_name", "gpt-4o"));
  assert.deepEqual(validateSetting("ai_api_endpoint", ""), { value: "" });
  assert.deepEqual(
    validateSetting("ai_api_endpoint", "https://api.example.com/v1"),
    { value: "https://api.example.com/v1" }
  );
  assert.ok("error" in validateSetting("ai_api_endpoint", "not-a-url"));
  assert.ok("error" in validateSetting("ai_api_endpoint", "ftp://example.com"));
});
