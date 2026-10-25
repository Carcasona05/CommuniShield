import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { clusterHotspots } from "../../server/src/services/hotspotClusteringService.ts";
import { summarizeHotspotEvidence } from "../../server/src/services/hotspotSentimentService.ts";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");

test("synthetic DBSCAN UI distinguishes repeated pins from spatial density and fails visibly", async () => {
  const directory = resolve(process.env.WEB_EXPORT_DIR);
  const server = createServer(async (request, response) => {
    let path = resolve(directory, `.${new URL(request.url, "http://localhost").pathname}`);
    if (!path.startsWith(directory)) { response.writeHead(403).end(); return; }
    if (!extname(path)) path = resolve(directory, "index.html");
    try {
      response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".ttf": "font/ttf", ".png": "image/png" })[extname(path)] || "application/octet-stream");
      response.end(await readFile(path));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("access_token", "test-token");
      localStorage.setItem("user_role", "admin");
    });
    const point = (id, offset = 0) => ({ id, latitude: 9.8816 + offset, longitude: 123.5953, created_at: new Date(Date.now() - 3600000).toISOString(), status: "Pending Review", incident_type: "Theft", incident_category: "Property", barangay: "Lamacan", location: "Lamacan", sentiment: "negative", sentiment_status: "succeeded", sentiment_confidence: 0.9, sentiment_language: "cebuano", comments: [] });
    let reports = Array.from({ length: 20 }, (_, index) => point(String(index)));
    let fail = false;
    let deny = false;
    let holdRefresh = false;
    let releaseRefresh;
    let refreshStarted;
    const refreshRequest = new Promise((done) => { refreshStarted = done; });
    const refreshGate = new Promise((done) => { releaseRefresh = done; });
    const periods = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,OPTIONS" };
      if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
      let json = {};
      if (url.pathname.endsWith("/admin/clusters")) {
        if (deny) { await route.fulfill({ status: 403, json: { error: "Admin access only" }, headers }); return; }
        if (fail) { await route.fulfill({ status: 500, json: { error: "Clustering unavailable" }, headers }); return; }
        if (holdRefresh) { refreshStarted(); await refreshGate; }
        const period = url.searchParams.get("period");
        periods.push(period);
        const windowDays = period === "all" ? null : period === "7d" ? 7 : 30;
        const now = Date.now();
        const clustering = clusterHotspots(reports, { windowDays, now });
        clustering.clusters = clustering.clusters.map((cluster) => ({
          ...cluster,
          evidence: summarizeHotspotEvidence(reports.filter((report) => cluster.reportIds.includes(report.id)), { now, windowDays }),
        }));
        json = { reports, clustering };
      } else if (url.pathname.endsWith("/profile")) json = { role: "admin", fullname: "Test Admin" };
      else if (url.pathname.includes("notifications")) json = { notifications: [], unreadCount: 0 };
      await route.fulfill({ json, headers });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/Admin_Hotspot_Detection`);
    await page.getByText("No spatial hotspots detected", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("spatial-hotspot-card").count(), 0);
    assert.equal(await page.getByText("Synthetic research prototype", { exact: true }).count(), 0);
    assert.match(await page.locator("body").innerText(), /Synthetic test data only/);
    if (process.env.HOTSPOT_SCREENSHOTS) {
      await mkdir(process.env.HOTSPOT_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: resolve(process.env.HOTSPOT_SCREENSHOTS, "hotspot-page.png"), fullPage: true });
    }
    assert.equal(periods.at(-1), "30d");

    reports = [...reports, point("b", 0.0002), point("c", 0.0004), point("d", 0.0006)];
    const makeComment = (id, sentiment) => ({ id, datePosted: new Date(Date.now() - 1800000).toISOString(), sentiment, sentiment_status: "succeeded", sentiment_confidence: 0.9, sentiment_language: "cebuano" });
    reports[0].comments = Array.from({ length: 100 }, (_, i) => makeComment(`negative-${i}`, "negative"));
    reports[1].comments = [makeComment("positive-comment", "positive")];
    reports[2].sentiment_language = "unknown";
    await page.reload();
    const cards = page.getByTestId("spatial-hotspot-card");
    await cards.first().waitFor();
    assert.equal(await cards.count(), 1);
    assert.match(await cards.first().innerText(), /23 reports.*4 distinct locations/s);
    await page.getByTestId("hotspot-details-toggle").first().click();
    const evidence = page.getByTestId("hotspot-sentiment-summary");
    await evidence.waitFor();
    assert.match(await evidence.getByTestId("hotspot-report-sentiment").innerText(), /22\/23 usable/);
    assert.match(await evidence.getByTestId("hotspot-report-sentiment").innerText(), /Negative 22 \(100%\)/);
    assert.match(await evidence.getByTestId("hotspot-comment-sentiment").innerText(), /Negative 50%/);
    assert.match(await evidence.getByTestId("hotspot-comment-sentiment").innerText(), /Positive 50%/);
    assert.match(await evidence.getByTestId("hotspot-comment-sentiment").innerText(), /101\/101 usable comments across 2 reports/);
    assert.match(await evidence.getByTestId("hotspot-verification-context").innerText(), /23 pending review/);
    assert.match(await evidence.getByTestId("hotspot-activity-context").innerText(), /insufficient data/);
    if (process.env.HOTSPOT_SCREENSHOTS) await page.screenshot({ path: resolve(process.env.HOTSPOT_SCREENSHOTS, "hotspot-card.png"), fullPage: true });
    holdRefresh = true;
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await refreshRequest;
    assert.equal(await cards.count(), 1, "background checks must not blank hotspot results");
    assert.equal(await page.getByText("Fetching reports...", { exact: true }).count(), 0);
    assert.match(await page.getByTestId("hotspot-refresh-status").innerText(), /Checking for updates/);
    holdRefresh = false;
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/admin/clusters") && response.status() === 200),
      Promise.resolve().then(() => releaseRefresh()),
    ]);
    await page.setViewportSize({ width: 900, height: 1100 });
    await page.waitForFunction(() => document.querySelector('[data-testid="hotspot-list-panel"]')?.getBoundingClientRect().height >= 600);
    const panelBounds = await page.getByTestId("hotspot-list-panel").boundingBox();
    assert.ok(panelBounds.height >= 600, "stacked sentiment panel must not collapse");
    await page.getByTestId("hotspot-report-sentiment").scrollIntoViewIfNeeded();
    assert.equal(await page.getByTestId("hotspot-report-sentiment").isVisible(), true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByText("Last 30 days", { exact: true }).click();
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/admin/clusters") && response.url().includes("7d")),
      page.getByText("Last 7 days", { exact: true }).click(),
    ]);
    await page.waitForFunction(() => document.body.innerText.includes("4 distinct locations"));
    assert.equal(periods.at(-1), "7d");
    await page.getByText("Trend unavailable: select at least 14 days or Any date.", { exact: true }).waitFor();

    fail = true;
    await page.reload();
    await page.getByText("Clustering unavailable", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("spatial-hotspot-card").count(), 1, "same-filter cached results remain visible with a refresh-failed warning");
    assert.match(await page.getByTestId("hotspot-refresh-status").innerText(), /Refresh failed/);
    fail = false; deny = true;
    await page.reload();
    await page.getByText("Access denied. Please sign in with an administrator account.", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("spatial-hotspot-card").count(), 0, "authorization failures must discard cached results");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
});
