import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createSessionData, mutationInvalidationPaths } from "../../clients/services/sessionData.js";
const source = readFileSync(new URL("../../clients/hooks/useAnalysisJobs.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
function fixture() {
  const store = createSessionData(); store.begin("token", "admin");
  const slots = [], effects = [], calls = [], invalidations = [];
  let cursor, jobs, poll, states = {}, postCount = 0, transport = null;
  const context = vm.createContext({ sessionData: { ...store, invalidate: value => { invalidations.push(value); store.invalidate(value); } },
    getCache: key => store.get(key), setCache: (key, value) => store.set(key, value), useSessionEpoch: () => store.epoch(),
    apiClient: {
      get: async (path, config) => { calls.push({ path, config }); if (transport) return transport(path); return { data: path.endsWith("/active") ? { batches: [] } : states[path.split("/").at(-1)] }; },
      post: async (path, body) => { calls.push({ path, body }); return { data: { batchId: `batch-${++postCount}` } }; },
    },
    useState(init) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === "function" ? init() : init; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(current) { return slots[cursor++] ||= { current }; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) { const i = cursor++; if (!effects[i] || deps.some((value, j) => value !== effects[i].deps[j])) jobs.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
    useAutoRefresh: fn => { poll = fn; },
  });
  vm.runInContext(source + "\nglobalThis.hook = useAnalysisJobs;", context);
  const render = () => { cursor = 0; jobs = []; const result = context.hook(); jobs.forEach(fn => fn()); return result; };
  return { render, calls, store, states, invalidations, poll: () => poll(), transport: fn => { transport = fn; }, unmount: () => effects.forEach(effect => effect?.cleanup?.()) };
}
test("enqueue uses bounded batches and does not invalidate results or wait for AI", async () => {
  const f = fixture(); f.render(); await f.poll();
  await f.render().enqueue(Array.from({ length: 53 }, (_, i) => `report-${i}`));
  const posts = f.calls.filter(call => call.body);
  assert.deepEqual(posts.map(call => call.body.reportIds.length), [50, 3]);
  assert.equal(f.invalidations.length, 0); assert.equal(f.render().batches.length, 2);
  assert.equal(f.render().isActive(["report-52"]), true);
  assert.deepEqual(mutationInvalidationPaths("/ai/analysis-jobs"), []);
  f.unmount();
});
test("completion invalidates result read models once, failed tasks remain explicitly failed", async () => {
  const f = fixture(); f.render(); await f.poll(); await f.render().enqueue(["report-1"]);
  f.states["batch-1"] = { id: "batch-1", state: "running", total: 4, done: 1, reports: [{ id: "report-1", total: 4, done: 1 }] };
  await f.poll(); assert.equal(f.render().isActive(["report-1"]), true); assert.equal(f.invalidations.length, 0);
  f.states["batch-1"] = { ...f.states["batch-1"], state: "failed", done: 4, failed: 1 };
  await f.poll(); assert.equal(f.render().batches[0].state, "failed"); assert.equal(f.render().isActive(["report-1"]), false);
  assert.equal(f.invalidations.length, 1); assert.ok(f.invalidations[0].paths.includes("/admin/report-details"));
  await f.poll(); assert.equal(f.invalidations.length, 1); f.unmount();
});
test("progress failure retains queued work and can recover without restarting analysis", async () => {
  const f = fixture(); f.render(); await f.poll(); await f.render().enqueue(["report-1"]);
  f.transport(async () => { throw new Error("Connection lost"); });
  await f.poll(); assert.match(f.render().error, /Connection lost/); assert.equal(f.render().isActive(["report-1"]), true);
  f.transport(null); f.states["batch-1"] = { id: "batch-1", state: "succeeded", total: 2, done: 2, reports: [{ id: "report-1", total: 2, done: 2 }] };
  await f.poll(); assert.equal(f.render().error, ""); assert.equal(f.calls.filter(call => call.body).length, 1); f.unmount();
});
test("logout fences late job results and does not leak the previous account's progress", async () => {
  const f = fixture(); f.render(); await f.poll(); await f.render().enqueue(["report-1"]);
  let finish;
  f.transport(() => new Promise(done => { finish = done; }));
  const loading = f.poll(); await Promise.resolve();
  f.store.begin("new-token", "super_admin"); f.render();
  finish({ data: { id: "batch-1", state: "succeeded", total: 2, done: 2, reports: [] } }); await loading;
  assert.equal(f.render().batches.length, 0); assert.equal(f.invalidations.length, 0); f.unmount();
});
