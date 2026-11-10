import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { mapPayload } from "../../clients/services/mapPayload.js";
import { createSessionData, mutationInvalidationPaths, prefetchPlan } from "../../clients/services/sessionData.js";
import { querySnapshotKey } from "../../clients/services/querySnapshots.js";

const text = path => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");
const pin = (id, latitude = 9.88) => ({ id, latitude, longitude: 123.59, severity: "High", status: "Pending Review", location: "Lamacan", incident_type: "Theft", ai_score: 80 });

test("map bridge excludes bulky/private detail fields without losing severity weights", () => {
  const report = { ...pin("one"), comments: [{ text: "Long comment" }], images: ["image.jpg"], details: "Narrative", credibility_review: "Analysis" };
  const payload = mapPayload([report]);
  assert.deepEqual(payload, [pin("one")]);
  for (const key of ["comments", "images", "details", "credibility_review"]) assert.equal(key in payload[0], false);
});

function heatMap() {
  const calls = { markers: [], heat: [], heatUpdates: [], removed: [], fly: [], messages: [] };
  const panes = {};
  const map = { attributionControl: { setPrefix() {} }, on() {}, flyTo: (...args) => calls.fly.push(args),
    createPane: name => { panes[name] = { style: {} }; }, getPane: name => panes[name] };
  const layer = { addTo() { return this; }, addLayer() {}, removeLayer: marker => calls.removed.push(marker) };
  const tiles = { addTo() { return this; }, on() {}, isLoading: () => false };
  const window = { addEventListener() {} };
  window.parent = window;
  window.ReactNativeWebView = { postMessage: value => calls.messages.push(JSON.parse(value)) };
  const L = {
    map: () => map, tileLayer: () => tiles, layerGroup: () => layer, control: { scale: () => ({ addTo() {} }) },
    circleMarker(coords, options) {
      const marker = { coords, options, handlers: {}, setLatLng(value) { this.coords = value; }, setRadius() {}, setStyle() {}, bindPopup() {}, setPopupContent() {}, on(name, fn) { this.handlers[name] = fn; } };
      calls.markers.push(marker); return marker;
    },
    heatLayer(points, options) {
      const heat = { addTo() { return this; }, setLatLngs: updated => calls.heatUpdates.push(updated) };
      calls.heat.push({ points, options, heat }); return heat;
    },
  };
  const declaration = text("components/Admin_compo/AdminHeatMap.jsx").match(/const MAP_HTML = (`[\s\S]*?`);/)[0];
  const html = vm.runInNewContext(`${declaration}\nMAP_HTML;`);
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], { L, window, document: { addEventListener() {}, getElementById: () => ({ addEventListener() {} }) } });
  return { calls, panes, render: reports => window.__communishieldInit({ reports, resetView: true }), init: window.__communishieldInit };
}

test("SVG pins keep the original styling and sit above the non-interactive heat canvas", () => {
  const f = heatMap();
  f.render([pin("a")]);
  assert.equal(f.panes["report-pins"].style.zIndex, "450");
  const options = f.calls.markers[0].options;
  assert.equal(options.pane, "report-pins");
  assert.equal(options.className, "cs-dot");
  assert.equal(options.radius, 9);
  assert.equal(options.color, "#FFFFFF");
  assert.equal(options.weight, 2.5);
  assert.equal(options.fillOpacity, .95);
  assert.equal(options.fillColor, "#F29A2E");
  const source = text("components/Admin_compo/AdminHeatMap.jsx");
  assert.doesNotMatch(source, /preferCanvas:\s*true/);
  assert.match(source, /\.cs-dot\{filter:drop-shadow/);
  assert.match(source, /\.cs-dot:hover\{stroke-width:4;\}/);
  assert.match(source, /\.leaflet-heatmap-layer\{pointer-events:none;\}/);
});

test("unchanged heatmap refreshes reuse markers/canvas and do not reset a user's viewport", () => {
  const f = heatMap();
  const reports = [pin("a"), pin("b", 9.89)];
  f.render(reports);
  assert.equal(f.calls.markers.length, 2); assert.equal(f.calls.heat.length, 1); assert.equal(f.calls.fly.length, 1);
  assert.deepEqual(Array.from(f.calls.heat[0].points, point => point[2]), [.75, .75]);
  f.render(JSON.parse(JSON.stringify(reports)));
  assert.equal(f.calls.markers.length, 2); assert.equal(f.calls.heat.length, 1); assert.equal(f.calls.heatUpdates.length, 0);
  assert.equal(f.calls.fly.length, 1);
  f.render([{ ...reports[0], severity: "Critical", status: "Under Verification" }, reports[1]]);
  assert.equal(f.calls.markers.length, 2); assert.equal(f.calls.heatUpdates.length, 1);
  f.calls.markers[0].handlers.click();
  assert.equal(f.calls.messages.at(-1).report.status, "Under Verification", "reused markers resolve current data, not captured stale data");
  f.render([{ ...reports[0], latitude: 9.88001 }, reports[1]]);
  assert.equal(f.calls.markers[0].coords[0], 9.88001, "a reused rounded-coordinate group must still track its exact pin");
  f.render([reports[1]]);
  assert.equal(f.calls.removed.length, 1);
  f.render([]);
  assert.equal(f.calls.removed.length, 2); assert.equal(f.calls.heatUpdates.at(-1).length, 0);
  assert.equal(f.calls.heat.length, 1);
});

test("focus changes fly once, while report-only updates keep the same focus", () => {
  const f = heatMap();
  const cfg = { reports: [pin("a")], focusTarget: { latitude: 9.88, longitude: 123.59, zoom: 16 } };
  f.init(cfg); f.init({ ...cfg, reports: [pin("b")] });
  assert.equal(f.calls.fly.length, 1);
  f.init({ ...cfg, focusTarget: { ...cfg.focusTarget, latitude: 9.89 } });
  assert.equal(f.calls.fly.length, 2);
});

function detailFetcher(get) {
  const store = createSessionData(); store.begin("a", "admin");
  const context = vm.createContext({ sessionData: store, apiClient: { get } });
  vm.runInContext(text("services/adminReportDetails.js").replace(/^import .*;\r?\n/gm, "").replace("export async function", "async function") +
    "\nglobalThis.fetchDetails = fetchAdminReportDetails;", context);
  return { store, fetch: ids => context.fetchDetails("/admin/report-details", { params: { ids: ids.join(",") } }) };
}

test("large compiled groups hydrate with sequential fifty-ID batches, not one request per report", async () => {
  const calls = [];
  let active = 0, maximum = 0;
  const f = detailFetcher(async (_path, config) => {
    active++; maximum = Math.max(maximum, active);
    await Promise.resolve();
    const ids = config.params.ids.split(","); calls.push(ids); active--;
    return { data: { reports: ids.map(id => ({ id })) } };
  });
  const result = await f.fetch(Array.from({ length: 121 }, (_, i) => String(i)));
  assert.equal(result.data.reports.length, 121);
  assert.deepEqual(calls.map(ids => ids.length), [50, 50, 21]);
  assert.equal(maximum, 1);
});

test("detail hydration stops between batches after logout and refuses missing reports", async () => {
  let calls = 0;
  const f = detailFetcher(async (_path, config) => {
    calls++; f.store.reset();
    return { data: { reports: config.params.ids.split(",").map(id => ({ id })) } };
  });
  await assert.rejects(f.fetch(Array.from({ length: 60 }, (_, i) => String(i))), { code: "ERR_CANCELED" });
  assert.equal(calls, 1);
  const missing = detailFetcher(async () => ({ data: { reports: [] } }));
  await assert.rejects(missing.fetch(["deleted"]), /no longer available/);
});

test("complete exports bypass both response and snapshot caches", async () => {
  const store = createSessionData(); store.begin("a", "admin");
  const config = { url: "/admin/validation-groups", params: { exportAll: "1" }, cacheMode: "no-store", sessionToken: "a", sessionEpoch: store.epoch() };
  let calls = 0;
  const transport = async () => ({ data: { groups: [], generation: ++calls }, status: 200 });
  await store.run(config, transport); await store.run(config, transport);
  assert.equal(calls, 2);
  assert.equal(store.get(querySnapshotKey(config.url, config.params)), undefined);
});

test("report writes invalidate every new representation without warming heavy hidden pages", () => {
  for (const path of ["/reports/a/status", "/reports/a/comments", "/ai/analyze/a"]) {
    const affected = mutationInvalidationPaths(path);
    for (const endpoint of ["/admin/overview", "/admin/map-reports", "/admin/validation-groups", "/admin/report-details"]) assert.ok(affected.includes(endpoint));
  }
  for (const role of ["admin", "super_admin"]) {
    const plan = prefetchPlan(role);
    assert.equal(plan[0], "/admin/overview");
    for (const heavy of ["/admin/dashboard", "/admin/map-reports", "/admin/accounts", "/admin/analytics", "/admin/risk-outlook", "/sentiment/datasets"]) assert.equal(plan.includes(heavy), false);
  }
});

test("both role routes share the same paginated validation implementation", () => {
  for (const role of ["admin", "sadmin"]) {
    const source = text(`app/(${role})/${role === "admin" ? "Admin" : "SAdmin"}_Validation.jsx`);
    assert.match(source, /<ValidationPage Layout=/);
  }
  const source = text("components/Admin_compo/ValidationPage.jsx");
  assert.match(source, /endpoint: "\/admin\/validation-groups"/);
  assert.match(source, /exportAll: "1"/);
  assert.match(source, /cacheMode: "no-store"/);
  assert.match(source, /data\?\.stats.totalReports/);
  assert.match(source, /data\?\.focusedGroup/);
});
