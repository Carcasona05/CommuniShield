const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const path = require("node:path");

function setup(access, options = {}) {
  const notices = [];
  const requests = [];
  let token = "current-session";
  const source = readFileSync(path.join(__dirname, "profileCompletion.js"), "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/export async function /g, "async function ");
  const guards = runInNewContext(`${source}\n({ ensureNotSuspended, ensureCompleteProfile });`, {
    AsyncStorage: { getItem: async () => token },
    apiClient: { get: async (url, config) => {
      requests.push({ url, config });
      if (options.fail) throw new Error("offline");
      if (options.switchSession) token = "new-session";
      return { data: url === "/credibility/access" ? access : { complete: options.complete !== false, missing: ["First name"] } };
    } },
    notifyCredibilityNotice: notice => notices.push(notice),
    notifyProfileRequirement: missing => notices.push({ missing }),
  });
  return { ...guards, notices, requests };
}

test("each suspended entry-point tap is blocked and shows the disclaimer", async () => {
  const gate = setup({ suspended: true, suspension: { endsAt: "2026-12-01T00:00:00Z" } });
  for (let i = 0; i < 3; i++) assert.equal(await gate.ensureNotSuspended(), false);
  assert.equal(gate.notices.length, 3);
  assert.equal(gate.requests.length, 3);
  assert.equal(gate.notices[0].title, "Account suspended");
  assert.match(gate.notices[0].message, /cannot post reports or add comments/);
  assert.match(gate.notices[0].message, /suspension ends on/);
  assert.ok(gate.requests.every(({ config }) => config.cacheMode === "network"));
});

test("suspension takes priority over incomplete profiles and write permission flags", async () => {
  for (const action of ["report", "comment", "edit"]) {
    const gate = setup({ suspended: true, reportAllowed: true, commentAllowed: true, editAllowed: true }, { complete: false });
    assert.equal(await gate.ensureCompleteProfile(action), false);
    assert.equal(gate.notices[0].title, "Account suspended");
    assert.equal(gate.requests.length, 1);
  }
});

test("unsuspended users can open comments even if their daily allowance is exhausted", async () => {
  const gate = setup({ suspended: false, commentAllowed: false });
  assert.equal(await gate.ensureNotSuspended(), true);
  assert.equal(await gate.ensureCompleteProfile("comment"), false);
  assert.match(gate.notices[0], /daily allowance/);
});

test("eligible users can still post and comment", async () => {
  const gate = setup({ suspended: false, reportAllowed: true, commentAllowed: true });
  assert.equal(await gate.ensureCompleteProfile("report"), true);
  assert.equal(await gate.ensureCompleteProfile("comment"), true);
  assert.equal(gate.notices.length, 0);
});

test("failed access checks block entry and allow another attempt", async () => {
  const gate = setup(null, { fail: true });
  assert.equal(await gate.ensureNotSuspended(), false);
  assert.match(gate.notices[0], /could not verify/);
});

test("stale access responses cannot affect another session", async () => {
  const gate = setup({ suspended: true }, { switchSession: true });
  assert.equal(await gate.ensureNotSuspended(), false);
  assert.equal(gate.notices.length, 0);
});
