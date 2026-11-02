import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");

test("report management reveals ten at a time, exports all matches, and animates back to top", async () => {
  const directory = resolve(process.env.WEB_EXPORT_DIR);
  const reports = Array.from({ length: 23 }, (_, index) => ({ id: `report-${index}`, incident_type: `Test report ${index + 1}`, location: "Lamacan", status: "Pending Review", severity: "Low", role: "admin", created_at: new Date(Date.UTC(2026, 9, 20, 12, index)).toISOString() }));
  const announcements = Array.from({ length: 2 }, (_, index) => ({ id: `announcement-${index}`, title: `Notice ${index}`, created_at: "2026-10-20T13:00:00Z" }));
  const logs = Array.from({ length: 2 }, (_, index) => ({ id: `log-${index}`, title: `Activity ${index}`, actor: "Test Admin", actorRole: "admin", dateTime: "2026-10-20T14:00:00Z" }));
  const server = createServer(async (request, response) => {
    let path = resolve(directory, `.${new URL(request.url, "http://localhost").pathname}`);
    if (!path.startsWith(directory)) { response.writeHead(403); response.end(); return; }
    if (!extname(path)) path = resolve(directory, "index.html");
    try { response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".ttf": "font/ttf", ".png": "image/png" })[extname(path)] || "application/octet-stream"); response.end(await readFile(path)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, downloadsPath: resolve(directory, "report-test-downloads") });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem("access_token", "test-token"); localStorage.setItem("user_role", "admin"); });
    await page.route("**/api/**", async (route) => {
      if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,OPTIONS" } }); return; }
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith("/admin/dashboard") ? { reports } : path.endsWith("/admin/announcements") ? { announcements } : path.endsWith("/admin/logs") ? { logs } : path.endsWith("/profile") ? { role: "admin", name: "Test Admin" } : path.includes("notifications") ? { notifications: [], unreadCount: 0 } : {};
      await route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*" } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/Admin_ReportManagement`);
    await page.getByText("27 records", { exact: true }).waitFor();
    const rows = page.getByTestId("admin-managed-record");
    assert.equal(await rows.count(), 10);
    // Capture the generated blob to verify pagination does not truncate CSV.
    await page.evaluate(() => {
      const original = URL.createObjectURL;
      URL.createObjectURL = (blob) => { window.testExportBlob = blob; return original(blob); };
    });
    const download = page.waitForEvent("download");
    await page.getByText("Export CSV", { exact: true }).click();
    await download;
    const csv = await page.evaluate(() => window.testExportBlob.text());
    assert.equal(csv.split("\r\n").length, 28);
    assert.match(csv, /Test report 1/);
    const more = page.getByRole("button", { name: "View more records", exact: true });
    await more.click(); await rows.nth(19).waitFor(); assert.equal(await rows.count(), 20);
    await more.click(); await rows.nth(26).waitFor(); assert.equal(await rows.count(), 27);
    assert.equal(await more.count(), 0);
    const top = page.getByRole("button", { name: "Back to top", exact: true });
    const scroll = page.getByTestId("report-management-scroll");
    const start = await scroll.evaluate((element) => element.scrollTop);
    await top.click();
    const intermediate = await scroll.evaluate(async (element) => { for (let frame = 0; frame < 8; frame++) await new Promise(requestAnimationFrame); return element.scrollTop; });
    assert.ok(intermediate > 0 && intermediate < start);
    await page.waitForFunction(() => document.querySelector('[data-testid="report-management-scroll"]').scrollTop < 2);
    await top.waitFor({ state: "detached" });
    await page.getByText("Type of Report", { exact: true }).locator("..").getByText("All", { exact: true }).click();
    await page.getByText("Incident", { exact: true }).click();
    await page.getByText("23 records", { exact: true }).waitFor();
    assert.equal(await rows.count(), 10);
    await more.click(); await rows.nth(19).waitFor();
    await rows.nth(15).click();
    await page.getByText("Report Document", { exact: true }).waitFor();
    await page.getByText("Close", { exact: true }).click();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
});
