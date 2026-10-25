import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { forecastDailySeries } from "../../server/src/services/riskOutlookService.ts";
import { summarizeHotspotEvidence } from "../../server/src/services/hotspotSentimentService.ts";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");

test("current indicators retain zone navigation and handle error states", async () => {
  const directory = resolve(process.env.WEB_EXPORT_DIR);
  const reports = [];
  const zones = [
    ["Lamacan", 8, "High"], ["Canbanua", 7, "Critical"], ["Poblacion", 6, "Moderate"], ["Langtad", 5, "Low"],
    ["Tulic", 4, null], ["Binlod", 3, "High"], ["Bulasa", 2, "Critical"], ["Bogo", 1, "Low"],
    ["Apo", 1, "Low"], ["Balaas", 1, "Low"], ["Catang", 1, "Low"], ["Talaga", 1, "Low"],
  ];
  for (const [barangay, count, severity] of zones) {
    for (let index = 0; index < count; index++) reports.push({ id: `${barangay}-${index}`, barangay, location: `${barangay}, Argao`, severity, status: "Under Verification", created_at: new Date(Date.now() - 86400000).toISOString(), incident_type: index % 2 ? "Theft" : "Fire Incident" });
  }
  reports.push({ id: "resolved", barangay: "Lamacan", severity: "Critical", status: "Resolved" });
  // Usable multilingual analyses, plus deliberate exclusions and comments so the
  // chart must distinguish counts, report-balanced shares and missing evidence.
  const comment = (id, sentiment) => ({ id, datePosted: new Date(Date.now() - 1800000).toISOString(), sentiment, sentiment_status: "succeeded", sentiment_confidence: 0.9, sentiment_language: "cebuano" });
  reports.forEach((report, index) => {
    if (report.status === "Resolved") return;
    report.sentiment = index % 4 === 2 ? "neutral" : index % 4 === 3 ? "positive" : "negative";
    report.sentiment_status = "succeeded";
    report.sentiment_confidence = index % 7 === 0 ? 0.4 : 0.9;
    report.sentiment_language = index % 5 === 0 ? "english" : "cebuano";
  });
  reports[0].comments = [comment("c1", "negative"), comment("c2", "positive")];
  reports[1].comments = [comment("c3", "negative")];
  const types = { ".html": "text/html", ".js": "text/javascript", ".ttf": "font/ttf", ".png": "image/png" };
  const server = createServer(async (request, response) => {
    let path = resolve(directory, `.${new URL(request.url, "http://localhost").pathname}`);
    if (!path.startsWith(directory)) { response.writeHead(403); response.end(); return; }
    if (!extname(path)) path = resolve(directory, "index.html");
    try { response.setHeader("Content-Type", types[extname(path)] || "application/octet-stream"); response.end(await readFile(path)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem("access_token", "test-token"); localStorage.setItem("user_role", "admin"); });
    let fail = false;
    let holdRequest = false;
    let resumeRequest;
    let requestBegan;
    const requestStarted = new Promise((done) => { requestBegan = done; });
    const requestGate = new Promise((done) => { resumeRequest = done; });
    await page.route("**/api/**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,OPTIONS" } });
        return;
      }
      const url = new URL(route.request().url());
      const path = url.pathname;
      let data = /\/(profile|session)$/.test(path) ? { userId: "fixture-admin", role: "admin", name: "Test Admin" } : path.includes("notifications") ? { notifications: [], unreadCount: 0 } : {};
      if (path.endsWith("/admin/risk-outlook")) {
        if (fail) { await route.fulfill({ status: 500, json: { error: "Indicators unavailable for test" }, headers: { "Access-Control-Allow-Origin": "*" } }); return; }
        if (holdRequest) { requestBegan(); await requestGate; }
        const scope = url.searchParams.get("barangay") || "All Barangays";
        const members = reports.filter((report) => report.status !== "Resolved" && (scope === "All Barangays" || report.barangay === scope));
        const severity = {};
        for (const report of members) {
          const name = String(report.severity || "").toLowerCase();
          const level = name === "moderate" ? "Medium" : ["Critical", "High", "Medium", "Low"].find((value) => value.toLowerCase() === name) || "Unknown";
          severity[level] = (severity[level] || 0) + 1;
        }
        const clusters = scope === "All Barangays" ? [{ location: "Lamacan", reportCount: 8, uniqueLocationCount: 4, reportIds: ["Lamacan-0"] }] : [];
        data = { reports, scope, dataMode: "synthetic", current: { spatialHotspotCount: clusters.length, clusters, severity, evidence: summarizeHotspotEvidence(members, { now: Date.now(), windowDays: 30 }) } };
      }
      await route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*" } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/Admin_Risk_Prediction`);
    await page.getByText("Reported incident types", { exact: true }).waitFor();
    assert.equal(await page.getByText("Synthetic research prototype", { exact: true }).count(), 0);
    if (process.env.RISK_OUTLOOK_SCREENSHOTS) {
      await mkdir(process.env.RISK_OUTLOOK_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: resolve(process.env.RISK_OUTLOOK_SCREENSHOTS, "fixture-default.png"), fullPage: true });
    }
    const text = await page.locator("body").innerText();
    assert.equal(text.includes("relative likelihood"), false);
    assert.equal(text.includes("NEXT 48 HOURS"), false);
    assert.equal(text.includes("Possible Crime Forecast Map"), false);
    assert.equal(text.includes("Predicted High Risk Zones"), false);
    const rows = page.getByTestId("current-report-zone");
    assert.equal(await rows.count(), 5);
    for (const [index, expected] of ["High", "Critical", "Medium", "Low", "Not rated"].entries()) {
      assert.ok((await rows.nth(index).innerText()).includes(expected));
    }
    assert.match(await rows.first().innerText(), /8 reports/);
    assert.equal((await page.locator("body").innerText()).includes("are driving this assessment"), false);
    const sentimentCard = page.getByTestId("risk-sentiment-card");
    const verificationCard = page.getByTestId("risk-verification-card");
    await sentimentCard.waitFor();
    await verificationCard.waitFor();
    assert.equal(await page.getByTestId("sentiment-evidence-chart").count(), 1, "sentiment evidence renders once, inside its own card");
    const sentimentText = await sentimentCard.innerText();
    assert.match(sentimentText, /34\/40 usable/, "low-confidence analyses are excluded from the usable coverage");
    assert.match(sentimentText, /Negative 17 · 50%/);
    assert.match(sentimentText, /Neutral 9 · 26%/);
    assert.match(sentimentText, /Positive 8 · 24%/);
    assert.match(sentimentText, /6 analyses excluded/);
    assert.match(sentimentText, /English 6 · Cebuano 28/);
    assert.match(sentimentText, /Negative · 75%/, "comment shares stay report-balanced, not raw-comment weighted");
    assert.match(sentimentText, /3\/3 usable comments across 2 reports/);
    assert.match(sentimentText, /Last 7 days/);
    assert.match(sentimentText, /Sentiment trend: insufficient data/);
    const reportTrack = await page.getByTestId("sentiment-report-bar").boundingBox();
    const negativeSegment = await page.getByTestId("sentiment-report-bar-segment-negative").boundingBox();
    assert.ok(Math.abs(negativeSegment.width / reportTrack.width - 0.5) < 0.02, "bar width must match the 50% negative share");
    const commentTrack = await page.getByTestId("sentiment-comment-bar").boundingBox();
    const commentNegative = await page.getByTestId("sentiment-comment-bar-segment-negative").boundingBox();
    assert.ok(Math.abs(commentNegative.width / commentTrack.width - 0.75) < 0.02, "bar width must match the 75% report-balanced negative share");
    const verificationText = await verificationCard.innerText();
    assert.match(verificationText, /40\s+Under verification/);
    assert.match(verificationText, /Critical 9/);
    assert.match(verificationText, /High 11/);
    assert.match(verificationText, /Medium 6/);
    assert.match(verificationText, /Low 10/);
    assert.match(verificationText, /Not rated 4/);
    assert.match(verificationText, /Lamacan/);
    assert.match(verificationText, /8 reports · 4 locations/);
    if (process.env.RISK_OUTLOOK_SCREENSHOTS) await page.getByTestId("current-sentiment-context").screenshot({ path: resolve(process.env.RISK_OUTLOOK_SCREENSHOTS, "context-section.png") });
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/admin/risk-outlook") && response.url().includes("barangay=Lamacan")),
      rows.first().click(),
    ]);
    await rows.first().waitFor();
    assert.ok((await page.getByTestId("risk-zone-location-filter").innerText()).includes("Lamacan"));
    // Scope change must recompute these cards, not keep the aggregate view.
    await verificationCard.getByText(/No DBSCAN hotspot intersects this scope/).waitFor();
    assert.equal(await rows.count(), 5);
    const more = page.getByRole("button", { name: "View more current zones", exact: true });
    await more.click();
    await rows.nth(9).waitFor();
    assert.equal(await rows.count(), 10);
    await more.click();
    await rows.nth(11).waitFor();
    assert.equal(await rows.count(), 12);
    assert.equal(await more.count(), 0);
    assert.match(await rows.first().innerText(), /High/);
    const toTop = page.getByRole("button", { name: "Back to top", exact: true });
    const startOffset = await page.getByTestId("risk-prediction-scroll").evaluate((element) => element.scrollTop);
    await toTop.click();
    const offsets = await page.getByTestId("risk-prediction-scroll").evaluate(async (element) => {
      const values = [];
      for (let frame = 0; frame < 10; frame++) {
        await new Promise(requestAnimationFrame);
        values.push(element.scrollTop);
      }
      return values;
    });
    assert.ok(offsets.some((offset) => offset > 0 && offset < startOffset), "Scrolling should animate through intermediate positions rather than jump");
    await page.waitForFunction(() => document.querySelector('[data-testid="risk-prediction-scroll"]').scrollTop < 2);
    await toTop.waitFor({ state: "detached" });
    const scroller = page.getByTestId("risk-prediction-scroll");
    await scroller.evaluate((element) => { element.dispatchEvent(new WheelEvent("wheel", { bubbles: true })); element.scrollTop = element.scrollHeight; });
    await toTop.waitFor();
    await toTop.click();
    const interrupted = await scroller.evaluate(async (element) => {
      for (let frame = 0; frame < 5; frame++) await new Promise(requestAnimationFrame);
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
      const before = element.scrollTop;
      for (let frame = 0; frame < 5; frame++) await new Promise(requestAnimationFrame);
      return { before, after: element.scrollTop };
    });
    assert.ok(interrupted.after > 0, "Manual wheel input should stop the animation before the top");
    assert.ok(Math.abs(interrupted.before - interrupted.after) <= 1, "Stopped animations must not continue scrolling");
    await toTop.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="risk-prediction-scroll"]').scrollTop < 2);
    await page.setViewportSize({ width: 900, height: 1100 });
    const sentimentBox = await sentimentCard.boundingBox();
    const verificationBox = await verificationCard.boundingBox();
    assert.ok(verificationBox.y >= sentimentBox.y + sentimentBox.height, "cards must stack instead of shrinking below readability on narrow screens");
    if (process.env.RISK_OUTLOOK_SCREENSHOTS) await page.getByTestId("current-sentiment-context").screenshot({ path: resolve(process.env.RISK_OUTLOOK_SCREENSHOTS, "context-section-narrow.png") });
    if (process.env.RISK_OUTLOOK_SCREENSHOTS) await page.screenshot({ path: resolve(process.env.RISK_OUTLOOK_SCREENSHOTS, "fixture-narrow.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    holdRequest = true;
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await requestStarted;
    await page.getByTestId("current-report-zone").first().waitFor();
    assert.equal(await page.getByTestId("current-report-zone").count(), 12, "background refresh retains cached zones and the expanded pagination state");
    assert.equal(await page.getByText("Updating indicators...", { exact: true }).count(), 0);
    assert.match(await page.getByTestId("risk-refresh-status").innerText(), /Checking for updates/);
    holdRequest = false;
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/admin/risk-outlook") && response.status() === 200),
      Promise.resolve().then(() => resumeRequest()),
    ]);
    fail = true;
    await page.reload();
    await page.getByText("Indicators unavailable for test", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
});
