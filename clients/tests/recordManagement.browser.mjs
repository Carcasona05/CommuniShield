import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const root = resolve("dist");
const id = "00000000-0000-4000-8000-000000000001";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const server = createServer(async (req, res) => {
  let file = resolve(root, `.${new URL(req.url, "http://localhost").pathname}`);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  if (!extname(file)) file = resolve(root, "index.html");
  try { res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf" })[extname(file)] || "application/octet-stream"); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  for (const role of ["admin", "super_admin"]) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await context.newPage(); const errors = [], requests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(role => { localStorage.setItem("access_token", "fixture-token"); localStorage.setItem("user_role", role); }, role);
    await context.routeWebSocket("**", socket => socket.close());
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url()); const path = url.pathname;
      requests.push(url);
      const user = url.searchParams.get("actorRole") === "user";
      const record = { id, kind: "Incident", title: user ? "User incident fixture" : "Admin incident fixture", status: "Verified", severity: "High", actorRole: user ? "user" : "admin", actor: "Fixture author", created_at: "2026-11-16T00:00:00Z", previewOnly: true };
      let data = {};
      if (path.endsWith("/session")) data = { userId: id, role };
      if (path.endsWith("/profile")) data = { role, name: "Fixture admin" };
      if (path.includes("notifications")) data = { notifications: [], unreadCount: 0 };
      if (path.endsWith("/admin/browse")) data = { items: [record], total: 1, hasMore: false, stats: { reports: 1, announcements: 0, activities: 0 } };
      if (path.endsWith("/admin/validation-groups")) data = { groups: [{ id: "fixture-group", title: "Fixture similar reports", category: "Property", type: "Theft", status: "Verified", severity: "High", reports: [{ id, title: "Fixture incident", status: "Verified", severity: "High" }], reportCount: 1 }], stats: { totalReports: 1, compiledIncidents: 1, pending: 0, verifying: 0, resolved: 0, rejected: 0 }, totalGroups: 1, page: 1, pageSize: 10, hasMore: false };
      if (path.endsWith("/admin/report-details")) data = { reports: [{ id, status: "Verified", details: "Complete incident fixture", reporter_name: "Fixture user", images: ["https://image.test/one.png", "https://image.test/two.png"], comments: [] }] };
      if (path.endsWith("/ai/analysis-jobs/active")) data = { batches: [] };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    });
    await page.route("https://image.test/**", route => route.fulfill({ contentType: "image/png", body: png }));
    const prefix = role === "admin" ? "Admin" : "SAdmin";
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${origin}/${prefix}_ReportManagement`);
    await page.getByText("Admin-Created Records", { exact: true }).waitFor();
    await page.getByText("Admin incident fixture", { exact: true }).waitFor();
    assert.equal(requests.find(url => url.pathname.endsWith("/admin/browse")).searchParams.get("actorRole"), "admin");
    await page.getByRole("button", { name: "Post by", exact: true }).click();
    await page.getByText("User", { exact: true }).click();
    await page.getByText("User-Created Incidents", { exact: true }).waitFor();
    await page.getByText("User incident fixture", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Type of Report", exact: true }).isDisabled(), true);
    assert.ok(requests.some(url => url.searchParams.get("actorRole") === "user" && url.searchParams.get("kind") === "Incident"));
    await page.getByText("User incident fixture", { exact: true }).click();
    await page.getByText("Complete incident fixture", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Edit record", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Delete record", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Close report document", exact: true }).click();
    await page.goto(`${origin}/${prefix}_Validation`);
    await page.getByText("Fixture similar reports", { exact: true }).click();
    await page.getByRole("button", { name: "Open report photo 2", exact: true }).click();
    await page.getByText("2 / 2", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Close photo viewer", exact: true }).click();
    await page.getByRole("button", { name: "Close similar reports", exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(`${role}: source filtering, read-only user records and Similar Reports photo viewer passed.`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
