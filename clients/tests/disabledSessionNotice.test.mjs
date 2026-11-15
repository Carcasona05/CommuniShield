import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createSessionData } from "../services/sessionData.js";
import { createDisabledSessionNotice } from "../services/disabledSessionNotice.js";

test("disabled notice survives session reset, credential cleanup and page remounts", () => {
  const sessions = createSessionData();
  const notice = createDisabledSessionNotice(sessions);
  sessions.begin("disabled-admin", "admin");
  sessions.set("api:/profile", { name: "Private data" });
  sessions.reset("disabled");
  assert.equal(sessions.session(), null);
  assert.equal(sessions.get("api:/profile"), undefined);
  assert.equal(notice.snapshot(), true);
  sessions.reset("logout");
  assert.equal(notice.snapshot(), true, "restoreAuth cleanup must not dismiss the notice");
  const unsubscribe = notice.subscribe(() => {});
  unsubscribe();
  const remountedRead = notice.snapshot;
  assert.equal(remountedRead(), true, "a new gate reads the latched state without needing the old event");
  sessions.begin("new-admin", "admin");
  assert.equal(notice.snapshot(), false, "a new account must not inherit the notice");
  notice.dispose();
});

test("expired tokens, normal logout and cache invalidation never show disabled notice", () => {
  const sessions = createSessionData();
  const notice = createDisabledSessionNotice(sessions);
  sessions.begin("active-admin", "admin");
  sessions.invalidate();
  assert.equal(notice.snapshot(), false);
  sessions.reset("logout");
  assert.equal(notice.snapshot(), false);
  sessions.reset("expired");
  assert.equal(notice.snapshot(), false);
  notice.dispose();
});

test("subscribers are notified and can safely unmount during a disabled transition", () => {
  const sessions = createSessionData();
  const notice = createDisabledSessionNotice(sessions);
  let renders = 0;
  const unsubscribe = notice.subscribe(() => renders++);
  sessions.reset("disabled");
  assert.equal(renders, 1);
  unsubscribe();
  sessions.reset("logout");
  assert.equal(notice.snapshot(), true);
  notice.dispose();
});

test("gate suppresses restore redirects and protected children while disabled", () => {
  const gate = readFileSync(new URL("../components/BrowserSessionGate.jsx", import.meta.url), "utf8");
  assert.match(gate, /disabledSessionNotice.snapshot\(\) \|\| leaving.current/);
  assert.ok(gate.indexOf("if (disabled) return") < gate.indexOf("if (nonBlocking) return"));
  assert.match(gate, /AccountDisabledNotice visible onConfirm=\{returnToSignIn\} signOut/);
  assert.match(gate, /await clearAuth\(\);\s+router.replace/);
  assert.match(gate, /if \(!auth\) router.replace/);
  const client = readFileSync(new URL("../services/apiClient.js", import.meta.url), "utf8");
  assert.match(client, /if \(disabledSessionNotice.snapshot\(\)\) throw cancelled\(\)/);
  assert.ok(client.indexOf("if (disabledSessionNotice.snapshot()) throw cancelled()") < client.indexOf("sessionData.begin(token, role)"));
});
