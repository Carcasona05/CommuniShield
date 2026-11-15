import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createSystemSettingsSave } from "../services/systemSettingsSave.js";

const initialSettings = { ai_scoring_enabled: "true", sentiment_local_model_enabled: "true", sentiment_gemini_enabled: "true", sentiment_cebuano_mode: "gemini" };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test("a switch changes immediately while persistence runs asynchronously", async () => {
  const gate = deferred(), commits = [];
  const control = createSystemSettingsSave({ initialSettings, persist: () => gate.promise, onCommit: (...args) => commits.push(args) });
  const task = control.save("ai_scoring_enabled", false);
  assert.equal(control.snapshot().values.ai_scoring_enabled, "false");
  assert.equal(control.snapshot().status.ai_scoring_enabled, "saving");
  assert.equal(commits.length, 0);
  gate.resolve();
  assert.equal(await task, true);
  assert.equal(control.snapshot().status.ai_scoring_enabled, "saved");
  assert.equal(commits[0][2].ai_scoring_enabled, "false");
});

test("failed saves roll back only the changed setting and surface an error", async () => {
  const gate = deferred(), errors = [];
  const control = createSystemSettingsSave({ initialSettings, persist: () => gate.promise, onError: error => errors.push(error.message) });
  const task = control.save("sentiment_cebuano_mode", "local");
  gate.reject(new Error("Database unavailable"));
  assert.equal(await task, false);
  assert.equal(control.snapshot().values.sentiment_cebuano_mode, "gemini");
  assert.equal(control.snapshot().values.ai_scoring_enabled, "true");
  assert.equal(control.snapshot().status.sentiment_cebuano_mode, "error");
  assert.deepEqual(errors, ["Database unavailable"]);
});

test("repeated clicks share one pending save while independent controls remain usable", async () => {
  const gates = { ai_scoring_enabled: deferred(), sentiment_gemini_enabled: deferred() }, writes = [], commits = [];
  const control = createSystemSettingsSave({ initialSettings, persist: (key, value) => { writes.push([key, value]); return gates[key].promise; },
    onCommit: (_key, _value, confirmed) => commits.push(confirmed) });
  const first = control.save("ai_scoring_enabled", false);
  assert.equal(control.save("ai_scoring_enabled", true), first);
  const second = control.save("sentiment_gemini_enabled", false);
  gates.sentiment_gemini_enabled.resolve(); await second;
  assert.equal(commits[0].ai_scoring_enabled, "true", "Never cache another control's unconfirmed optimistic value");
  gates.ai_scoring_enabled.resolve(); await first;
  assert.equal(writes.length, 2);
  assert.equal(commits[1].ai_scoring_enabled, "false");
  assert.equal(commits[1].sentiment_gemini_enabled, "false");
  assert.equal(control.snapshot().values.sentiment_cebuano_mode, "gemini", "Turning Gemini off must not silently change Cebuano routing");
});

test("old background refreshes cannot overwrite a pending or completed edit", async () => {
  const gate = deferred();
  const control = createSystemSettingsSave({ initialSettings, persist: () => gate.promise });
  const before = control.revision();
  const task = control.save("ai_scoring_enabled", false);
  const during = control.revision();
  assert.equal(control.hydrate(initialSettings, before), false);
  assert.equal(control.hydrate(initialSettings, during), false);
  gate.resolve(); await task;
  assert.equal(control.hydrate(initialSettings, before), false);
  assert.equal(control.hydrate(initialSettings, during), false);
  assert.equal(control.snapshot().values.ai_scoring_enabled, "false");
  assert.equal(control.hydrate({ sentiment_cebuano_mode: "local" }, control.revision()), true);
  assert.equal(control.snapshot().values.ai_scoring_enabled, "false", "Partial cache hydration does not reset unrelated settings");
});

test("late saves after logout/unmount cannot update cache or notify a new session", async () => {
  let active = true, commits = 0, emissions = 0;
  const gate = deferred();
  const control = createSystemSettingsSave({ initialSettings, active: () => active, persist: () => gate.promise, onCommit: () => commits++ });
  control.subscribe(() => emissions++);
  const task = control.save("ai_scoring_enabled", false);
  assert.equal(emissions, 1);
  active = false; gate.resolve();
  assert.equal(await task, false);
  assert.equal(commits, 0);
  assert.equal(emissions, 1);
});

test("unloaded settings and retired keys cannot be saved", async () => {
  let calls = 0;
  const control = createSystemSettingsSave({ persist: async () => calls++ });
  assert.equal(control.snapshot().ready, false);
  assert.equal(await control.save("ai_scoring_enabled", false), false);
  assert.equal(control.hydrate(initialSettings), true);
  assert.equal(await control.save("map_default_zoom", "12"), false);
  assert.equal(await control.save("sentiment_cebuano_mode", "invalid"), false);
  assert.equal(calls, 0);
});

test("settings UI keeps account and Cebuano controls, with per-control save feedback and no retired sections", () => {
  const ui = readFileSync(new URL("../app/(sadmin)/SAdmin_Settings.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /Map Settings|High Credibility Threshold|Medium Credibility Threshold|Notification Preferences|Email Notifications|Push Notifications|Enable AI Credibility Scoring/);
  assert.match(ui, /Enable AI Credibility Analysis/);
  assert.match(ui, /title="Cebuano Handling"/);
  assert.match(ui, /onPress=\{handleSaveProfile\}/);
  assert.match(ui, /onPress=\{handleChangePassword\}/);
  assert.match(ui, /saveState === "saving" \? "Saving…"/);
  assert.equal((ui.match(/disabled=\{!settingsReady \|\| saveStates\./g) || []).length, 4);
  assert.doesNotMatch(ui, /setCebuanoMode|on-device sentiment/);
});
