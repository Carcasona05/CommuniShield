import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createSessionData, isPageRequest, pageRequestKey } from "../../clients/services/sessionData.js";

const text = path => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");
const strip = code => code.replace(/^import .*;\r?\n/gm, "").replace(/export const /g, "const ").replace(/export function /g, "function ");

test("page failure notices distinguish actual failures from cancellations, background reads and old accounts", () => {
  const sessionData = createSessionData();
  sessionData.begin("a", "admin");
  const context = vm.createContext({ sessionData, isPageRequest, pageRequestKey });
  vm.runInContext(strip(text("services/pageLoadStatus.js")) + "\nglobalThis.status = { recordPageFailure, clearPageFailure, getPageFailures };", context);
  const status = context.status;
  const config = { url: "/admin/dashboard", sessionToken: "a", sessionEpoch: sessionData.epoch() };
  for (const [cfg, error] of [[config, { code: "ERR_CANCELED" }], [{ ...config, background: true }, {}],
    [{ ...config, url: "/login", method: "post" }, {}], [config, { response: { status: 401 } }]]) status.recordPageFailure(cfg, error);
  assert.equal(status.getPageFailures().length, 0);
  status.recordPageFailure(config, { response: { status: 503 } });
  assert.equal(status.getPageFailures().length, 1);
  status.clearPageFailure(config);
  assert.equal(status.getPageFailures().length, 0);
  status.recordPageFailure(config, {});
  sessionData.begin("b", "super_admin");
  assert.equal(status.getPageFailures().length, 0);
  status.recordPageFailure(config, {});
  assert.equal(status.getPageFailures().length, 0);
});

test("map readiness keeps a loading state until the map signals ready and supports timeout/retry", () => {
  const slots = [], effects = [];
  let cursor = 0, effectCursor = 0, timerId = 0;
  const timers = new Map();
  const context = vm.createContext({
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useCallback: fn => fn,
    useEffect: (fn, deps) => {
      const index = effectCursor++, previous = effects[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        previous?.cleanup?.(); effects[index] = { deps, cleanup: fn() };
      }
    },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(strip(text("hooks/useMapReadiness.js")).replace("export default function", "function") + "\nglobalThis.hook = useMapReadiness;", context);
  const render = () => { cursor = 0; effectCursor = 0; return context.hook(); };
  let state = render();
  assert.equal(state.ready, false);
  state.markLoaded(); state = render();
  assert.equal(state.loaded, true);
  assert.equal(state.ready, false, "Document load is not the same as a usable map");
  [...timers.values()][0](); state = render();
  assert.match(state.error, /retry/);
  state.retry(); state = render();
  assert.equal(state.revision, 1);
  assert.equal(state.loaded, false);
  assert.equal(state.error, "");
  state.markReady(); state = render();
  assert.equal(state.ready, true);
  assert.equal(timers.size, 0);
});

for (const path of ["components/MapView.jsx", "components/Admin_compo/AdminHeatMap.jsx"]) {
  test(`${path} has valid embedded map scripts and a readiness/retry overlay`, () => {
    const source = text(path);
    const declaration = source.match(/const MAP_HTML = (`[\s\S]*?`);/)[0];
    const html = vm.runInNewContext(declaration + "\nMAP_HTML;");
    new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
    assert.match(source, /<MapLoadingOverlay/);
    assert.match(source, /key=\{revision\}/);
    assert.match(html, /map-ready/);
    assert.match(source, /onError=\{markError\}/);
  });
}

test("the shared page cache is the transport cache, with no persisted private payloads", () => {
  const source = text("services/dataStore.js");
  assert.match(source, /setCache = \(key, value\) => sessionData\.set/);
  assert.match(source, /getCache = \(key\) => sessionData\.get/);
  assert.doesNotMatch(source, /AsyncStorage\.setItem|localStorage\.setItem|JSON\.parse/);
  assert.match(source, /sessionData\.reset\("logout"\)/);
});
