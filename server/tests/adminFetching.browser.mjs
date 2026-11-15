import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");

const uuid = i => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const reports = Array.from({ length: 13 }, (_, i) => ({ id: uuid(i), type: `Fixture type ${i}`, category: "Property-Related Incidents", barangay: "Lamacan",
  location: "Lamacan, Argao", status: "Pending Review", severity: "High", aiScore: 80, createdAt: "2026-11-09T10:00:00Z", submittedAt: "Nov 09, 2026 • 06:00 PM", submittedRole: "User", submittedBy: "Fixture reporter", details: "" }));
const groups = reports.map((report, i) => ({ id: `group-${i}`, title: `${report.type} in Lamacan`, category: report.category, type: report.type,
  barangay: "Lamacan", location: report.location, status: report.status, severity: "High", highestAiScore: 80, userCount: 1, adminCount: 0,
  reportCount: 1, statusSummary: { "Pending Review": 1 }, submittedAt: report.submittedAt, reports: [report] }));
const stats = { totalReports: 321, compiledIncidents: 20, pending: 100, verifying: 21, resolved: 150, rejected: 50 };
const mapReport = { id: uuid(999), latitude: 9.8784487, longitude: 123.5950192, location: "Lamacan, Argao", barangay: "Lamacan",
  incident_type: "Theft", incident_category: "Property-Related Incidents", severity: "High", ai_score: 80, status: "Pending Review", created_at: "2026-11-09T10:00:00Z" };
const records = Array.from({ length: 23 }, (_, i) => ({ ...mapReport, id: uuid(100 + i), kind: "Incident", title: `Managed fixture ${i}`,
  actor: "Fixture admin", actorRole: "admin", previewOnly: true, details: "Short preview", created_at: new Date(Date.UTC(2026, 10, 9, 10, 0, 30 - i)).toISOString() }));
const logs = Array.from({ length: 23 }, (_, i) => ({ id: uuid(300 + i), title: `Log fixture ${i}`, details: `Log evidence ${i}`, actionType: "Report Verified",
  actor: "Fixture admin", actorRole: "admin", reportId: uuid(100 + i), dateTime: records[i].created_at, created_at: records[i].created_at }));
const archives = records.slice(0, 13).map((row, i) => ({ ...row, id: uuid(600 + i), status: "Archived", incident_type: `Archived fixture ${i}` }));

// Deterministic tile-free Leaflet test double. Geographic rendering is covered
// separately; this checks React navigation, request boundaries and lazy details.
const leaflet = `window.L={map:function(){return {attributionControl:{setPrefix:function(){}},on:function(){},flyTo:function(){},invalidateSize:function(){},createPane:function(){},getPane:function(){return {style:{}}}}},
tileLayer:function(){return {addTo:function(){return this},on:function(){},isLoading:function(){return false}}},control:{scale:function(){return {addTo:function(){}}}},
layerGroup:function(){return {addTo:function(){return this},addLayer:function(m){document.getElementById('map').appendChild(m.el)},removeLayer:function(m){m.el.remove()}}},
circleMarker:function(){var el=document.createElement('button');el.textContent='Inspect fixture pin';var marker={el:el,bindPopup:function(){},setPopupContent:function(){},setLatLng:function(){},setRadius:function(){},setStyle:function(){},on:function(name,fn){el.addEventListener(name,fn)}};return marker}};`;
const heat = `L.heatLayer=function(){return {addTo:function(){return this},setLatLngs:function(){}}};`;

test("both roles use lightweight dashboards, whole-group pages, lazy details and complete exports", { timeout: 120000 }, async () => {
  const directory = resolve(process.env.WEB_EXPORT_DIR);
  const types = { ".html": "text/html", ".js": "text/javascript", ".ttf": "font/ttf", ".png": "image/png" };
  const server = createServer(async (request, response) => {
    let path = resolve(directory, `.${new URL(request.url, "http://localhost").pathname}`);
    if (!path.startsWith(`${directory}\\`) && !path.startsWith(`${directory}/`)) { response.writeHead(403); response.end(); return; }
    if (!extname(path)) path = resolve(directory, "index.html");
    try { response.setHeader("Content-Type", types[extname(path)] || "application/octet-stream"); response.end(await readFile(path)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    for (const role of ["admin", "super_admin"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
      const page = await context.newPage();
      const errors = [], requests = [];
      page.on("pageerror", error => errors.push(error.message));
       await context.addInitScript(role => {
         localStorage.setItem("access_token", "test-token"); localStorage.setItem("user_role", role);
         if (!localStorage.getItem("communishield.localBlotters.v1")) localStorage.setItem("communishield.localBlotters.v1", JSON.stringify({ nextEntry: 2, nextPage: 2, records: [
           { id: "local-blotter-1", incident_type: "Local fixture blotter", location: "Lamacan", incident_description: "Private local narrative", created_at: "2026-11-10T10:00:00Z" },
         ] }));
       }, role);
       let failNextRecords = true;
       const restored = new Set();
       let releaseSession;
       const sessionGate = new Promise(done => { releaseSession = done; });
       let verificationReleased = false;
       let analysisState = "running";
       let analysisReport = null;
       const batchId = uuid(8100);
       let holdAllDistribution = false, releaseDistribution;
       const distributionGate = new Promise(done => { releaseDistribution = done; });
      await context.routeWebSocket("**", socket => socket.close());
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.pathname.includes("/api/")) {
          if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
          requests.push(url);
          const path = url.pathname;
          let data = {};
           if (path.endsWith("/session")) {
             await sessionGate;
             data = { userId: uuid(2000), role, status: "Active" };
           }
          if (path.endsWith("/profile")) data = { id: uuid(2000), role, name: "Fixture administrator", status: "Active" };
          if (path.includes("notifications")) data = { notifications: [], unreadCount: 0 };
          const snapshot = { updatedAt: "2026-11-09T10:00:00Z", refreshing: false, error: "" };
          if (path.endsWith("/admin/clusters")) data = { reports: [], clustering: { clusters: [], noiseReportIds: [] }, snapshot };
          if (path.endsWith("/admin/risk-outlook")) data = { reports: [], currentByBarangay: {}, current: { activeReportCount: 0, clusters: [], evidence: null }, forecast: { status: "not_requested" }, snapshot };
          if (path.endsWith("/admin/analytics")) data = { summary: { activeIncidents: 2, criticalHotspots: 1, sentimentTotal: 1000, sentimentAnalyzed: 987,
            avgSentiment: "3.0", sentimentLabel: "neutral", sentimentDistribution: [] }, sentimentTrend: [], snapshot };
          if (path.endsWith("/admin/sentiment-overview")) {
            const period = url.searchParams.get("period") || "today", factor = { today: 1, "7d": 2, "30d": 3, all: 4 }[period];
            const day = url.searchParams.get("day"), count = period === "today" ? 24 : period === "7d" ? 7 : period === "30d" ? 30 : 1;
            const step = period === "today" ? 3600000 : 86400000, start = Date.parse(`${day}T00:00:00+08:00`) - (period === "today" ? 0 : (count - 1) * 86400000);
            const counts = { positive: 700 * factor, neutral: 100 * factor, negative: 100 * factor, mixed: 50 * factor };
            data = { period, timeZone: "Asia/Manila", summary: { sentimentTotal: 1000 * factor, sentimentAnalyzed: 987 * factor,
              reportCount: 200 * factor, commentCount: 800 * factor, usableCount: 950 * factor, positiveShare: 700 / 950 * 100,
              sentimentDistribution: [...Object.entries(counts).map(([label, count]) => ({ label, count })), { label: "unclear", count: 37 * factor }, { label: "none", count: 13 * factor }] },
              trend: { interval: period === "today" ? "hour" : "day", buckets: Array.from({ length: count }, (_, i) => ({ start: new Date(start + i * step).toISOString(), end: new Date(start + (i + 1) * step).toISOString(),
                counts: i === 0 ? counts : { positive: 0, neutral: 0, negative: 0, mixed: 0 }, usable: i === 0 ? 950 * factor : 0, total: i === 0 ? 1000 * factor : 0,
                unclear: i === 0 ? 37 * factor : 0, withoutResult: i === 0 ? 13 * factor : 0, future: false })) }, snapshot };
          }
          if (path.endsWith("/admin/sentiment-distribution")) {
            const period = url.searchParams.get("period") || "today";
            if (period === "all" && holdAllDistribution) await distributionGate;
            const total = { today: 10, "7d": 70, "30d": 300, all: 3708 }[period];
            data = { period, timeZone: "Asia/Manila", summary: { sentimentTotal: total, sentimentAnalyzed: total,
              sentimentDistribution: [{ label: "positive", count: total }],
              sentimentCoverage: { version: 1, unclear: 0, pending: 0, failed: 0, unavailable: 0, missing: 0 } }, snapshot };
          }
          if (path.endsWith("/sentiment/datasets")) data = { datasets: [], total: 0, page: 1, pageSize: 10, hasMore: false };
          if (path.endsWith("/sentiment/training")) data = { jobs: [], datasets: [], models: [] };
          if (path.endsWith("/sentiment/supporting-models")) data = { models: [], total: 0 };
          if (path.endsWith("/ai/analysis-jobs/active")) data = { batches: analysisReport && analysisState === "running" ? [
            { id: batchId, state: "running", total: 3, done: 1, reports: [{ id: analysisReport, total: 3, done: 1 }] },
          ] : [] };
          if (path.endsWith("/ai/analysis-jobs") && route.request().method() === "POST") {
            analysisReport = route.request().postDataJSON().reportIds[0];
            return route.fulfill({ status: 202, json: { batchId, state: "queued" }, headers: { "Access-Control-Allow-Origin": "*" } });
          }
          if (path.endsWith(`/ai/analysis-jobs/${batchId}`)) data = { id: batchId, state: analysisState,
            total: 3, done: analysisState === "running" ? 1 : 3, failed: analysisState === "failed" ? 1 : 0,
            reports: [{ id: analysisReport, total: 3, done: analysisState === "running" ? 1 : 3, failed: analysisState === "failed" ? 1 : 0 }] };
          if (path.endsWith("/admin/overview")) data = { summary: { total: 1234, pending: 100, verified: 500, rejected: 42, hotspots: 7 }, reports: [],
            ...(role === "super_admin" ? { management: { activeAdmins: 3, admins: 4, superAdmins: 1, disabled: 1, logsToday: 81 }, logs: [] } : {}) };
           if (path.endsWith("/admin/map-reports")) data = { reports: [mapReport], complete: true };
           if (path.endsWith("/admin/browse")) {
             const view = url.searchParams.get("view"), number = Number(url.searchParams.get("page") || 1), exporting = url.searchParams.get("exportAll") === "1";
             if (view === "records" && number === 2 && failNextRecords) {
               failNextRecords = false;
               return route.fulfill({ status: 500, json: { error: "Fixture append failure" }, headers: { "Access-Control-Allow-Origin": "*" } });
             }
             const all = view === "records" ? records : view === "logs" ? logs : archives.filter(row => !restored.has(row.id));
             data = { items: exporting ? all.map(row => ({ ...row, details: `Complete export ${row.id}` })) : all.slice((number - 1) * 10, number * 10),
               total: all.length, page: number, pageSize: 10, hasMore: !exporting && number * 10 < all.length, nextCursor: number * 10 < all.length ? `cursor-${number}` : null,
               stats: { reports: view === "records" ? all.length : 0, activities: view === "logs" ? all.length : 0, announcements: 0, verified: all.length, rejected: 0, ai: 0 } };
           }
           if (path.endsWith("/status") && route.request().method() === "POST") {
             const id = path.split("/").at(-2); restored.add(id); data = { message: "Restored" };
           }
          if (path.endsWith("/admin/validation-groups")) {
            const number = Number(url.searchParams.get("page") || 1), exportAll = url.searchParams.get("exportAll") === "1";
            data = { groups: exportAll ? groups.map(group => ({ ...group, reports: group.reports.map(report => ({ ...report, details: `Export narrative ${report.id}` })) })) : groups.slice((number - 1) * 10, number * 10),
              stats, page: number, pageSize: 10, totalGroups: 13, hasMore: number === 1,
              focusedGroup: groups.find(group => group.reports.some(report => report.id === url.searchParams.get("focusReport"))) || null };
          }
          if (path.endsWith("/admin/report-details")) data = { reports: url.searchParams.get("ids").split(",").map(id => ({ ...mapReport, id,
            details: `Loaded detailed narrative ${id}`, comments: [{ id: uuid(5000), text: "Lazy comment evidence", user: "Fixture user" }], images: [], reporter_name: "Fixture reporter" })) };
          return route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        if (url.hostname === "127.0.0.1") return route.continue();
        if (url.pathname.endsWith("leaflet.js")) return route.fulfill({ contentType: "application/javascript", body: leaflet });
        if (url.pathname.endsWith("leaflet-heat.js")) return route.fulfill({ contentType: "application/javascript", body: heat });
        if (url.pathname.endsWith("leaflet.css")) return route.fulfill({ contentType: "text/css", body: "" });
        return route.abort();
      });
      const origin = `http://127.0.0.1:${server.address().port}`;
       await page.goto(`${origin}/${role === "admin" ? "Admin" : "SAdmin"}_Dashboard`);
       await page.getByText("Dashboard", { exact: true }).first().waitFor();
       assert.equal(verificationReleased, false, "The real page UI must mount while session verification is pending, not a full-screen loader");
       releaseSession();
       verificationReleased = true;
      await page.getByText(role === "admin" ? "Pending Validation" : "Pending Reports", { exact: true }).waitFor();
      assert.ok(requests.some(url => url.pathname.endsWith("/admin/overview")));
      assert.equal(requests.some(url => /\/admin\/(dashboard|accounts|analytics)$/.test(url.pathname)), false);
      const validation = role === "admin" ? "Admin_Validation" : "SAdmin_Validation";
      await page.goto(`${origin}/${validation}`);
      await page.getByText("13 results", { exact: true }).waitFor();
      assert.equal(requests.filter(url => url.pathname.endsWith("/admin/report-details")).length, 0);
       await page.getByRole("button", { name: "View more reports", exact: true }).click();
       await page.getByText(groups[12].title, { exact: true }).waitFor();
       assert.equal(await page.getByText(groups[0].title, { exact: true }).count(), 1, "First batch stays visible");
      assert.ok((await page.locator("body").innerText()).includes("321"), "Summary must not shrink to the three visible groups");
      await page.getByText(groups[11].title, { exact: true }).click();
       await page.getByText(`Loaded detailed narrative ${uuid(11)}`, { exact: true }).waitFor();
       assert.ok(requests.some(url => url.pathname.endsWith("/admin/report-details") && url.searchParams.get("ids") === uuid(11)));
       const hydratedBeforeAnalysis = requests.filter(url => url.pathname.endsWith("/admin/report-details")).length;
       await page.getByText("Re-Analyze post", { exact: true }).click();
       await page.getByText("Analysis queued / running", { exact: true }).waitFor();
       assert.equal(requests.some(url => /\/ai\/(?:analyze|sentiment\/reanalyze)/.test(url.pathname)), false, "Re-analyze must queue work instead of blocking on AI calls");
       await page.getByRole("button", { name: "Close similar reports", exact: true }).click();
       assert.equal(await page.getByText(groups[0].title, { exact: true }).count(), 1, "The page remains usable while AI runs");
       analysisState = "failed";
       await page.getByText(/Analysis finished with failures/).waitFor();
       assert.ok(requests.filter(url => url.pathname.endsWith("/admin/report-details")).length >= hydratedBeforeAnalysis);
      const downloaded = page.waitForEvent("download");
      await page.getByText("Export CSV", { exact: true }).click();
      const file = await downloaded;
      const csv = await readFile(await file.path(), "utf8");
      assert.ok(csv.includes(`Export narrative ${uuid(0)}`)); assert.ok(csv.includes(`Export narrative ${uuid(12)}`));
      await page.goto(`${origin}/${validation}?openReport=${uuid(12)}&notifNonce=1`);
      await page.getByText(`Loaded detailed narrative ${uuid(12)}`, { exact: true }).waitFor();
       if (role === "admin") {
        await page.goto(`${origin}/Admin_Ince_Map`);
        const frame = page.frameLocator("iframe");
        await frame.getByText("Inspect fixture pin").click();
        await page.getByText(`Loaded detailed narrative ${uuid(999)}`, { exact: true }).waitFor();
         await page.getByText("Lazy comment evidence", { exact: true }).waitFor();
       }
       const prefix = role === "admin" ? "Admin" : "SAdmin";
       const detailCount = requests.filter(url => url.pathname.endsWith("/admin/report-details")).length;
       await page.goto(`${origin}/${prefix}_ReportManagement`);
       await page.getByText("24 records", { exact: true }).waitFor();
       await page.getByText("Local fixture blotter • Lamacan", { exact: true }).waitFor();
       assert.equal(requests.filter(url => url.pathname.endsWith("/admin/report-details")).length, detailCount, "Record list must not hydrate full incident threads");
       await page.getByRole("button", { name: "View more records", exact: true }).click();
       await page.getByText(/Showing previously loaded data\. Fixture append failure/).waitFor();
       assert.equal(await page.getByText("Managed fixture 0", { exact: true }).count(), 1);
       const scrollTop = await page.getByTestId("report-management-scroll").evaluate(node => node.scrollTop);
       await page.getByRole("button", { name: "View more records", exact: true }).click();
       await page.getByText("Managed fixture 18", { exact: true }).waitFor();
       const afterAppend = await page.getByTestId("report-management-scroll").evaluate(node => node.scrollTop);
       assert.ok(afterAppend > 0 && Math.abs(afterAppend - scrollTop) < 100, "Appending must not reset scroll; removing the retry notice may adjust the offset by its height");
       assert.equal(await page.getByText("Managed fixture 0", { exact: true }).count(), 1);
       await page.getByText("Managed fixture 0", { exact: true }).click();
       await page.getByText(`Loaded detailed narrative ${uuid(100)}`, { exact: true }).waitFor();
       await page.getByRole("button", { name: "Close report document", exact: true }).click();
       const recordDownload = page.waitForEvent("download");
       await page.getByText("Export CSV", { exact: true }).click();
       const recordCsv = await readFile(await (await recordDownload).path(), "utf8");
       assert.ok(recordCsv.includes(`Complete export ${uuid(122)}`)); assert.ok(recordCsv.includes("Private local narrative"));
       await page.goto(`${origin}/${role === "admin" ? "Admin_Logs" : "SAdmin_AuditLogs"}`);
       await page.getByText("Log fixture 0", { exact: true }).waitFor();
       assert.equal(requests.some(url => url.pathname.endsWith("/admin/browse") && url.searchParams.get("view") === "archived"), false, "Inactive archive tab must not fetch");
       await page.getByRole("button", { name: "View more logs", exact: true }).click();
       await page.getByText("Log fixture 19", { exact: true }).waitFor();
       assert.equal(await page.getByText("Log fixture 0", { exact: true }).count(), 1);
       await page.getByText("Archived reports", { exact: true }).first().click();
       await page.getByTestId("archived-report-row").first().waitFor();
       assert.equal(await page.getByTestId("archived-report-row").count(), 10);
       await page.getByRole("button", { name: "View more archived reports", exact: true }).click();
       await page.waitForFunction(() => document.querySelectorAll('[data-testid="archived-report-row"]').length === 13);
       await page.getByTestId("archived-report-row").first().getByText("Restore", { exact: true }).click();
       await page.waitForFunction(() => document.querySelectorAll('[data-testid="archived-report-row"]').length === 12);
       assert.ok(requests.some(url => url.pathname.endsWith(`/reports/${uuid(600)}/status`)));
       if (role === "admin") {
         await page.goto(`${origin}/Admin_Hotspot_Detection`);
         await page.getByTestId("hotspot-refresh-status").waitFor();
         assert.match(await page.getByTestId("hotspot-refresh-status").innerText(), /Updated.*2026/);
         await page.goto(`${origin}/Admin_Risk_Prediction`);
         await page.getByTestId("risk-refresh-status").waitFor();
         assert.match(await page.getByTestId("risk-refresh-status").innerText(), /Updated.*2026/);
         const dashboardsBeforeSentiment = requests.filter(url => url.pathname.endsWith("/admin/dashboard")).length;
         await page.goto(`${origin}/Admin_ince_Anaytics`);
         await page.getByTestId("overview-analyzed").getByText("900", { exact: true }).waitFor();
         assert.equal(await page.getByTestId("overview-total").innerText(), "913");
         assert.equal(await page.getByTestId("overview-without-result").innerText(), "13");
         assert.equal(await page.getByTestId("overview-positive-share").innerText(), "77.8%");
         assert.equal(await page.getByText("900/913 Analyzed", { exact: true }).count(), 1);
         assert.equal(requests.filter(url => url.pathname.endsWith("/admin/dashboard")).length, dashboardsBeforeSentiment, "Sentiment overview must not download complete incident threads");
         const card = page.getByTestId("sentiment-distribution-card");
         await card.getByText("10 total subjects", { exact: true }).waitFor();
         assert.ok(requests.some(url => url.pathname.endsWith("/admin/sentiment-distribution") && url.searchParams.get("period") === "today"));
         const analyticsRequests = requests.filter(url => url.pathname.endsWith("/admin/sentiment-overview")).length;
         await page.getByTestId("sentiment-training-panel").evaluate(node => { node.dataset.distributionFilterCheck = "kept"; });
         for (const [label, total] of [["Past 7 Days", 70], ["Past 30 Days", 300]]) {
           await page.getByTestId("sentiment-distribution-period").click();
           const menuBounds = await page.getByTestId("sentiment-distribution-period-menu").boundingBox();
           const cardBounds = await card.boundingBox();
           const triggerBounds = await page.getByTestId("sentiment-distribution-period").boundingBox();
           assert.ok(menuBounds.x >= cardBounds.x && menuBounds.x + menuBounds.width <= cardBounds.x + cardBounds.width + 1, "Distribution menu stays inside the card");
           assert.ok(Math.abs(menuBounds.width - triggerBounds.width) <= 1, "Distribution menu matches the trigger width");
           await page.getByTestId("sentiment-distribution-period-menu").getByText(label, { exact: true }).click();
           await card.getByText(`${total} total subjects`, { exact: true }).waitFor();
           assert.equal(await page.getByTestId("overview-analyzed").innerText(), "900");
         }
         holdAllDistribution = true;
         await page.getByTestId("sentiment-distribution-period").click();
         await page.getByTestId("sentiment-distribution-period-menu").getByText("All Time", { exact: true }).click();
         await page.getByTestId("sentiment-distribution-loading").waitFor();
         assert.equal(await page.getByTestId("overview-analyzed").innerText(), "900", "Distribution loading must not replace the overview");
         assert.equal(await card.getByText("300 total subjects", { exact: true }).count(), 0, "Never label a previous period's results as All Time");
         releaseDistribution();
         await card.getByText("3,708 total subjects", { exact: true }).waitFor();
         assert.equal(await page.getByTestId("sentiment-training-panel").getAttribute("data-distribution-filter-check"), "kept");
         assert.equal(requests.filter(url => url.pathname.endsWith("/admin/sentiment-overview")).length, analyticsRequests, "Card filters must not refetch overview or trend");
         const distributionRequests = requests.filter(url => url.pathname.endsWith("/admin/sentiment-distribution")).length;
         await page.getByTestId("sentiment-overview-period").click();
         await page.getByTestId("sentiment-overview-period-menu").getByText("Past 30 Days", { exact: true }).click();
         await page.getByTestId("overview-total").getByText("2,739", { exact: true }).waitFor();
         assert.equal(await page.getByTestId("overview-analyzed").innerText(), "2,700");
         assert.equal(await page.getByTestId("overview-without-result").innerText(), "39");
         assert.equal(await card.getByText("3,708 total subjects", { exact: true }).count(), 1, "Overview filter leaves distribution untouched");
         assert.equal(requests.filter(url => url.pathname.endsWith("/admin/sentiment-distribution")).length, distributionRequests);
         await page.getByTestId("sentiment-trend-chart").getByRole("button").first().hover();
         const trendTooltip = page.getByTestId("sentiment-trend-tooltip");
         await trendTooltip.waitFor();
         assert.match(await trendTooltip.innerText(), /Negative\s+300/);
         assert.match(await trendTooltip.innerText(), /Neutral\s+300/);
         assert.match(await trendTooltip.innerText(), /Positive\s+2,100/);
         assert.doesNotMatch(await trendTooltip.innerText(), /Mixed/i, "Graph shows only the three classifications, even when the API contains a legacy tie label");
         const tooltipBounds = await trendTooltip.boundingBox(), plotBounds = await page.getByTestId("sentiment-trend-plot").boundingBox();
         assert.ok(tooltipBounds.x >= plotBounds.x && tooltipBounds.x + tooltipBounds.width <= plotBounds.x + plotBounds.width + 1);
         await page.mouse.move(0, 0);
         await trendTooltip.waitFor({ state: "detached" });
         assert.equal(await trendTooltip.count(), 0, "Hover counts disappear when leaving the graph");
         await page.getByTestId("sentiment-trend-chart").getByRole("button").nth(1).click();
         await page.getByTestId("sentiment-trend-details").getByText("No usable sentiment results in this interval.", { exact: true }).waitFor();
         assert.equal(await page.getByText("Avg. Health", { exact: true }).count(), 0);
         // The existing fixed 260px admin sidebar does not support phone-width
         // page content. Check the graph at a narrow supported content width.
         await page.setViewportSize({ width: 768, height: 844 });
         await page.waitForFunction(() => {
           const node = document.querySelector('[data-testid="sentiment-trend-chart"]');
           return node && node.clientWidth > 120 && node.scrollWidth <= node.clientWidth + 1;
         });
         const narrowGraph = await page.getByTestId("sentiment-trend-chart").evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }));
         assert.ok(narrowGraph.scroll <= narrowGraph.width + 1, `Graph has no horizontal overflow on narrow screens: ${JSON.stringify(narrowGraph)}`);
         await page.getByTestId("sentiment-trend-chart").getByRole("button").first().focus();
         await trendTooltip.waitFor();
         assert.match(await trendTooltip.innerText(), /Positive\s+2,100/);
         const narrowTooltipBounds = await trendTooltip.boundingBox(), narrowPlotBounds = await page.getByTestId("sentiment-trend-plot").boundingBox();
         assert.ok(narrowTooltipBounds.x >= narrowPlotBounds.x && narrowTooltipBounds.x + narrowTooltipBounds.width <= narrowPlotBounds.x + narrowPlotBounds.width + 1);
         await page.getByTestId("sentiment-trend-chart").getByRole("button").first().evaluate(node => node.blur());
         await trendTooltip.waitFor({ state: "detached" });
         await page.setViewportSize({ width: 390, height: 844 });
         await page.getByTestId("sentiment-distribution-period").click();
         const mobileMenu = await page.getByTestId("sentiment-distribution-period-menu").boundingBox();
         const mobileCard = await card.boundingBox();
         assert.ok(mobileMenu.x >= mobileCard.x && mobileMenu.x + mobileMenu.width <= mobileCard.x + mobileCard.width + 1, "Distribution menu stays contained on narrow screens");
         await page.getByTestId("sentiment-distribution-period").click();
       }
       assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(done => server.close(done));
  }
});
