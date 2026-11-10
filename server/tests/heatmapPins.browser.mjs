import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");

test("real Leaflet heatmap preserves visible, clickable SVG pins and original styling", { timeout: 60000 }, async () => {
  const source = await readFile(new URL("../../clients/components/Admin_compo/AdminHeatMap.jsx", import.meta.url), "utf8");
  const declaration = source.match(/const MAP_HTML = (`[\s\S]*?`);/)[0];
  const html = vm.runInNewContext(`${declaration}\nMAP_HTML;`);
  const [leaflet, css] = await Promise.all([
    readFile(new URL("../../clients/node_modules/leaflet/dist/leaflet.js", import.meta.url), "utf8"),
    readFile(new URL("../../clients/node_modules/leaflet/dist/leaflet.css", import.meta.url), "utf8"),
  ]);
  const heat = process.env.LEAFLET_HEAT_PATH ? await readFile(process.env.LEAFLET_HEAT_PATH, "utf8") : await (async () => {
    const response = await fetch("https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js", { signal: AbortSignal.timeout(15000) });
    assert.equal(response.ok, true, "Pinned production heat plugin must be available");
    return response.text();
  })();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("leaflet.js")) return route.fulfill({ contentType: "application/javascript", body: leaflet });
      if (path.endsWith("leaflet-heat.js")) return route.fulfill({ contentType: "application/javascript", body: heat });
      if (path.endsWith("leaflet.css")) return route.fulfill({ contentType: "text/css", body: css });
      if (path.endsWith(".png")) return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2lYQAAAAASUVORK5CYII=", "base64") });
      return route.abort();
    });
    await page.setContent(html.replace("<head>", '<head><script>window.__messages=[];window.ReactNativeWebView={postMessage:function(value){window.__messages.push(JSON.parse(value))}};</script>'));
    await page.waitForFunction(() => typeof window.__communishieldInit === "function");
    const levels = [
      ["Unknown", "#64748B", 7, 9.8816, 123.5953], ["Low", "#3DBB74", 7, 9.8816, 123.6033],
      ["Medium", "#F7C948", 8, 9.8896, 123.5953], ["High", "#F29A2E", 9, 9.8736, 123.5953],
      ["Critical", "#E45757", 9.5, 9.8816, 123.5873],
    ];
    const reports = levels.map(([severity, , , latitude, longitude]) => ({ id: severity, severity, latitude, longitude,
      status: "Pending Review", location: "Lamacan, Argao", incident_type: `${severity} fixture`, ai_score: 80 }));
    await page.evaluate(reports => window.__communishieldInit({ reports }), reports);
    const selector = ".leaflet-report-pins-pane svg path.cs-dot";
    assert.equal(await page.locator(selector).count(), 5);
    assert.equal(await page.locator(".leaflet-report-pins-pane canvas").count(), 0);
    assert.equal(await page.locator(".leaflet-heatmap-layer").count(), 1, "Use the actual canvas heat plugin, not a marker-only map");
    const panes = await page.evaluate(() => ({
      pins: Number(getComputedStyle(document.querySelector(".leaflet-report-pins-pane")).zIndex),
      heat: Number(getComputedStyle(document.querySelector(".leaflet-overlay-pane")).zIndex),
      heatPointerEvents: getComputedStyle(document.querySelector(".leaflet-heatmap-layer")).pointerEvents,
    }));
    assert.ok(panes.pins > panes.heat);
    assert.equal(panes.heatPointerEvents, "none");
    for (const [, color, radius] of levels) {
      const pin = page.locator(`${selector}[fill="${color}"]`);
      assert.equal(await pin.isVisible(), true);
      assert.equal(await pin.getAttribute("stroke"), "#FFFFFF");
      assert.equal(await pin.getAttribute("stroke-width"), "2.5");
      assert.equal(await pin.getAttribute("fill-opacity"), "0.95");
      const geometry = await pin.evaluate(el => {
        const box = el.getBoundingClientRect();
        return { width: box.width, shadow: getComputedStyle(el).filter,
          hit: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === el };
      });
      // Leaflet's SVG renderer rounds fractional circle radii to pixels.
      assert.ok(Math.abs(geometry.width - Math.round(radius) * 2) < .1, `Original pin size must be preserved (${color}: ${geometry.width}px)`);
      assert.match(geometry.shadow, /drop-shadow/);
      assert.equal(geometry.hit, true, "Heat canvas must not cover or intercept the pin");
    }
    const high = page.locator(`${selector}[fill="#F29A2E"]`);
    await high.hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.cs-dot[fill="#F29A2E"]')).strokeWidth === "4px");
    await high.click();
    await page.locator(".leaflet-popup-content").getByText("High fixture", { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => window.__messages.some(message => message.type === "report-select" && message.report.id === "High")));
    await high.evaluate(el => { window.__originalPin = el; window.__originalHeat = document.querySelector(".leaflet-heatmap-layer"); });
    const updated = reports.map(report => report.id === "High" ? { ...report, severity: "Low", status: "Under Verification" } : report);
    await page.evaluate(reports => window.__communishieldInit({ reports }), updated);
    assert.equal(await page.evaluate(() => window.__originalPin.isConnected && window.__originalPin.getAttribute("fill") === "#3DBB74"), true);
    assert.equal(await page.evaluate(() => window.__originalHeat === document.querySelector(".leaflet-heatmap-layer")), true);
    await page.locator(".cs-pop-meta").getByText("Status: Under Verification", { exact: false }).waitFor();
    await page.setViewportSize({ width: 390, height: 700 });
    await page.waitForFunction(() => [...document.querySelectorAll(".cs-dot")].every(el => {
      const box = el.getBoundingClientRect();
      return box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
    }));
    assert.equal(await page.locator(selector).count(), 5);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
