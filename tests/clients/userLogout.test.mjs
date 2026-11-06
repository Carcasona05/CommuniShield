import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const settings = readFileSync(new URL("../../clients/app/(tabs)/User_Settings.jsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../../clients/app/(auth)/User_Login.jsx", import.meta.url), "utf8");
function logout(clearAuth) {
  const events = [];
  const context = vm.createContext({
    clearAuth, logoutInProgress: { current: false },
    setShowLogoutModal: value => events.push({ modal: value }),
    router: { replace: route => events.push({ route }) },
    toast: { error: message => events.push({ error: message }) },
    setTimeout: () => assert.fail("Logout must not delay navigation for a toast"),
  });
  const declaration = settings.match(/const handleLogout = async \(\) => \{[\s\S]*?\n  \};/)[0];
  vm.runInContext(declaration + "\nglobalThis.logout = handleLogout;", context);
  return { run: context.logout, events };
}

test("user logout immediately replaces Settings with Login once credentials are cleared", async () => {
  let cleared = false;
  const f = logout(async () => { cleared = true; });
  await f.run();
  assert.equal(cleared, true);
  const route = f.events.find(event => event.route).route;
  assert.equal(route.pathname, "/(auth)/User_Login");
  assert.equal(route.params.loggedOut, "1");
  assert.equal(f.events[0].modal, false);
});

test("duplicate taps do not run logout twice or navigate before secure cleanup", async () => {
  let release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const f = logout(async () => { calls++; await gate; });
  const first = f.run();
  await f.run();
  assert.equal(calls, 1);
  assert.equal(f.events.some(event => event.route), false);
  release(); await first;
  assert.equal(f.events.filter(event => event.route).length, 1);
});

test("failed logout does not falsely claim success and permits a retry", async () => {
  let fail = true;
  const f = logout(async () => { if (fail) throw new Error("Storage unavailable"); });
  await f.run();
  assert.equal(f.events.some(event => event.route), false);
  assert.match(f.events.find(event => event.error).error, /try again/);
  fail = false; await f.run();
  assert.equal(f.events.filter(event => event.route).length, 1);
});

test("the success toast appears once on Login and its navigation flag is consumed", () => {
  const messages = [], params = [];
  const context = vm.createContext({ loggedOut: "1", logoutToastShown: { current: false },
    useEffect: fn => fn(), toast: { success: message => messages.push(message) }, router: { setParams: value => params.push(value) } });
  const effect = login.match(/useEffect\(\(\) => \{\s*if \(loggedOut[\s\S]*?\}, \[loggedOut, toast.success\]\);/)[0];
  vm.runInContext(effect, context);
  vm.runInContext(effect, context);
  assert.deepEqual(messages, ["You have been logged out successfully."]);
  assert.equal(params.length, 1);
  assert.equal(params[0].loggedOut, undefined);
});
