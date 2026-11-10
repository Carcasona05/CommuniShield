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
      await context.addInitScript(role => { localStorage.setItem("access_token", "test-token"); localStorage.setItem("user_role", role); }, role);
      await context.routeWebSocket("**", socket => socket.close());
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.pathname.includes("/api/")) {
          if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
          requests.push(url);
          const path = url.pathname;
          let data = {};
          if (path.endsWith("/session")) data = { userId: uuid(2000), role, status: "Active" };
          if (path.endsWith("/profile")) data = { id: uuid(2000), role, name: "Fixture administrator", status: "Active" };
          if (path.includes("notifications")) data = { notifications: [], unreadCount: 0 };
          if (path.endsWith("/admin/overview")) data = { summary: { total: 1234, pending: 100, verified: 500, rejected: 42, hotspots: 7 }, reports: [],
            ...(role === "super_admin" ? { management: { activeAdmins: 3, admins: 4, superAdmins: 1, disabled: 1, logsToday: 81 }, logs: [] } : {}) };
          if (path.endsWith("/admin/map-reports")) data = { reports: [mapReport], complete: true };
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
      await page.getByText(role === "admin" ? "Pending Validation" : "Pending Reports", { exact: true }).waitFor();
      assert.ok(requests.some(url => url.pathname.endsWith("/admin/overview")));
      assert.equal(requests.some(url => /\/admin\/(dashboard|accounts|analytics)$/.test(url.pathname)), false);
      const validation = role === "admin" ? "Admin_Validation" : "SAdmin_Validation";
      await page.goto(`${origin}/${validation}`);
      await page.getByText("13 results", { exact: true }).waitFor();
      assert.equal(requests.filter(url => url.pathname.endsWith("/admin/report-details")).length, 0);
      await page.getByText("Next", { exact: true }).click();
      await page.getByText("Page 2 of 2", { exact: true }).waitFor();
      assert.ok((await page.locator("body").innerText()).includes("321"), "Summary must not shrink to the three visible groups");
      await page.getByText(groups[11].title, { exact: true }).click();
      await page.getByText(`Loaded detailed narrative ${uuid(11)}`, { exact: true }).waitFor();
      assert.ok(requests.some(url => url.pathname.endsWith("/admin/report-details") && url.searchParams.get("ids") === uuid(11)));
      await page.getByRole("button", { name: "Close similar reports", exact: true }).click();
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
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(done => server.close(done));
  }
});
