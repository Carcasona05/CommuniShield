import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dashboardAiStatus } from "../services/dashboardAiStatus.js";

test("dashboard uses saved switches and Cebuano mode, not placeholder thresholds", () => {
  const rows = dashboardAiStatus({ ai_scoring_enabled: "false", sentiment_local_model_enabled: "true", sentiment_gemini_enabled: "false", sentiment_cebuano_mode: "gemini" });
  assert.deepEqual(rows.map(row => row.value), ["Off", "Enabled", "Off", "Gemini only", "CommuniShield-AI v1.0"]);
  assert.equal(rows[1].status, "active");
  assert.equal(rows[0].status, "normal");
  assert.equal(rows.length, 5);
});

test("unknown values never imply enabled and loading does not hide the static version", () => {
  assert.deepEqual(dashboardAiStatus().slice(0, 4).map(row => row.value), Array(4).fill("Unavailable"));
  assert.deepEqual(dashboardAiStatus(undefined, true).slice(0, 4).map(row => row.value), Array(4).fill("Loading…"));
  assert.equal(dashboardAiStatus(undefined, true)[4].value, "CommuniShield-AI v1.0");
  assert.equal(dashboardAiStatus({ ai_scoring_enabled: "unknown", sentiment_cebuano_mode: "unknown" })[0].value, "Unavailable");
});

test("Cebuano modes are displayed as configured", () => {
  for (const [mode, expected] of Object.entries({ local: "Local", gemini: "Gemini only", disabled: "Disabled" })) {
    assert.equal(dashboardAiStatus({ sentiment_cebuano_mode: mode })[3].value, expected);
  }
});

test("database model metadata never changes the fixed display version", () => {
  assert.equal(dashboardAiStatus({ ai_model_version: "database-version", ai_model_name: "database-model" })[4].value, "CommuniShield-AI v1.0");
});

test("dashboard has independently loaded settings, retry and a read-only settings link", () => {
  const ui = readFileSync(new URL("../app/(sadmin)/SAdmin_Dashboard.jsx", import.meta.url), "utf8");
  assert.match(ui, /endpoint: "\/admin\/settings", validate: validSettings/);
  assert.match(ui, /onRetry=\{settingsQuery.reload\}/);
  assert.match(ui, /router.push\("\/\(sadmin\)\/SAdmin_Settings"\)/);
  assert.doesNotMatch(ui, /High Credibility Threshold|Medium Credibility Threshold|ai_model_version|ai_model_name/);
});

test("View Reports links to Report Management, not Record Management", () => {
  const ui = readFileSync(new URL("../app/(sadmin)/SAdmin_Dashboard.jsx", import.meta.url), "utf8");
  assert.match(ui, /router.push\("\/\(sadmin\)\/SAdmin_Validation"\)/);
  assert.doesNotMatch(ui, /router.push\("\/\(sadmin\)\/SAdmin_ReportManagement"\)/);
  assert.doesNotMatch(ui, /\/\(admin\)\/Admin_Reports/);
  const page = readFileSync(new URL("../app/(sadmin)/SAdmin_Validation.jsx", import.meta.url), "utf8");
  assert.match(page, /<ValidationPage/);
});
