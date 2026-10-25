import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

// Exercise the actual embedded map script without network tiles or a browser.
const source = readFileSync(new URL("../../clients/components/Admin_compo/AdminHeatMap.jsx", import.meta.url), "utf8");
const template = source.match(/const MAP_HTML = (`[\s\S]*?`);/)[1];
const html = vm.runInNewContext(template);
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function createMap(native = false) {
  const messages = [];
  const markers = [];
  const handlers = {};
  let resize;
  let invalidations = 0;
  const map = {
    on(event, handler) { handlers[event] = handler; },
    latLngToContainerPoint([x, y]) {
      return { distanceTo: (point) => Math.hypot(x - point.x, y - point.y) };
    },
    invalidateSize() { invalidations++; },
    removeLayer() {},
    flyTo() {},
  };
  const window = {
    parent: { postMessage: (message) => messages.push(JSON.parse(message)) },
    addEventListener() {},
    ...(native ? { ReactNativeWebView: { postMessage: (message) => messages.push(JSON.parse(message)) } } : {}),
  };
  const L = {
    map: () => map,
    tileLayer: () => ({ addTo() {} }),
    control: { scale: () => ({ addTo() {} }) },
    layerGroup: () => ({
      addTo() { return this; },
      clearLayers() { markers.length = 0; },
      addLayer(marker) { markers.push(marker); },
    }),
    heatLayer: () => ({ addTo() { return this; } }),
    circleMarker(coordinates, options) {
      return {
        coordinates, options, handlers: {}, open: false,
        bindPopup(content) { this.content = content; },
        on(event, handler) { this.handlers[event] = handler; },
        getLatLng() { return coordinates; },
        setPopupContent(content) { this.content = content; },
        isPopupOpen() { return this.open; },
        openPopup() { this.open = true; },
      };
    },
  };
  vm.runInNewContext(script, {
    window, L,
    document: { getElementById: () => ({ addEventListener() {} }) },
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe() {}
    },
  });
  return {
    window, markers, messages,
    init: (reports) => window.__communishieldInit({ reports }),
    clickHeat: (x, y) => handlers.click({ containerPoint: { x, y } }),
    resize: () => resize(),
    invalidations: () => invalidations,
  };
}

const report = (id, latitude, longitude) => ({ id, latitude, longitude, incident_type: id, severity: "High" });

test("web pins emit the exact clicked report, never auto-select on load", () => {
  const map = createMap();
  map.init([report("first", 10, 20), report("second", 100, 120)]);
  assert.equal(map.messages.length, 0);
  map.markers[1].handlers.click();
  assert.equal(map.messages.at(-1).report.id, "second");
  assert.equal(map.markers[1].options.bubblingMouseEvents, false);
});

test("heat clicks choose the nearest report and ignore empty map space", () => {
  const map = createMap();
  map.init([report("first", 10, 20), report("second", 100, 120)]);
  map.clickHeat(95, 110);
  assert.equal(map.messages.at(-1).report.id, "second");
  assert.equal(map.markers[1].open, true);
  map.clickHeat(1000, 1000);
  assert.equal(map.messages.length, 1);
});

test("overlapping reports keep popup navigation and selection synchronized", () => {
  const map = createMap();
  map.init([report("first", 10, 20), report("second", 10, 20)]);
  assert.equal(map.markers.length, 1);
  map.markers[0].handlers.click();
  assert.equal(map.messages.at(-1).report.id, "first");
  map.window.__csShift("10.0000,20.0000", 1);
  assert.equal(map.messages.at(-1).report.id, "second");
  assert.match(map.markers[0].content, /second/);
  map.clickHeat(11, 21);
  assert.equal(map.messages.at(-1).report.id, "second");
  map.window.__csShift("10.0000,20.0000", -1);
  assert.equal(map.messages.at(-1).report.id, "first");
});

test("filtered-out reports are removed from heat hit testing", () => {
  const map = createMap();
  map.init([report("removed", 10, 20)]);
  map.init([report("current", 100, 120)]);
  map.clickHeat(10, 20);
  assert.equal(map.messages.length, 0);
  map.clickHeat(100, 120);
  assert.equal(map.messages.at(-1).report.id, "current");
});

test("native map emits selections and resizes with the panel", () => {
  const map = createMap(true);
  map.init([report("native", 10, 20)]);
  map.markers[0].handlers.click();
  assert.equal(map.messages.at(-1).report.id, "native");
  map.resize();
  assert.equal(map.invalidations(), 1);
});
