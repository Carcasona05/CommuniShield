import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");

test("verified admin login preloads role data; warm navigation stays visible during a background fetch", { timeout: 60000 }, async () => {
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
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  let release;
  const gate = new Promise(done => { release = done; });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], calls = [];
    page.on("pageerror", error => errors.push(error.message));
    let approved = false, holdLogs = false;
    await page.route("**/api/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname.replace(/^\/api/, "");
      const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
      if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
      calls.push({ path, approved, method: request.method() });
      let data = {};
      if (path === "/admin/login") data = { verification_required: true, challenge_id: "fixture", masked_email: "a***@example.com", resend_after: 60 };
      else if (path === "/login/verify") {
        approved = true;
        data = { access_token: "approved-admin-token", device_token: "trusted-device-fixture", user: { role: "admin", name: "Fixture Admin" } };
      } else if (path === "/profile" || path === "/session") data = { userId: "fixture-admin", role: "admin", name: "Fixture Admin", email: "admin@example.com" };
      else if (path === "/admin/overview") data = { summary: { total: 0, pending: 0, verified: 0, rejected: 0 } };
      else if (path === "/admin/dashboard") data = { summary: { total: 0, pending: 0, verified: 0, rejected: 0 }, reports: [] };
      else if (path === "/admin/logs") {
        if (holdLogs) await gate;
        data = { logs: [{ id: "fixture-log", actionType: "Report Verified", title: "Warm navigation fixture", actor: "Fixture Admin", actorRole: "admin", details: "Cached before navigation", dateTime: new Date().toISOString() }] };
      } else if (path === "/admin/notifications") data = { notifications: [], unreadCount: 0 };
      else if (path === "/admin/analytics") data = { summary: {}, reports: [], sentiment: {} };
      else if (path === "/admin/announcements") data = { announcements: [] };
      else if (path === "/admin/blotters") data = { blotters: [] };
      else if (path === "/incidents/options") data = { categories: [], types: [] };
      await route.fulfill({ json: data, headers });
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${origin}/Admin_Login`);
    await page.getByPlaceholder("Admin Email Address").fill("admin@example.com");
    await page.getByPlaceholder("Admin Password").fill("FixturePassword1!");
    await page.getByText("Login", { exact: true }).click();
    await page.getByText("Verify this device", { exact: true }).waitFor();
    assert.equal(calls.some(call => call.method === "GET"), false, "challenge must not start protected preloading");
    await page.getByLabel("Six-digit sign-in code").fill("123456");
    const warmed = page.waitForResponse(response => response.url().endsWith("/api/admin/logs"));
    await page.getByText("Verify and sign in", { exact: true }).click();
    await warmed;
    await page.waitForURL("**/Admin_Dashboard");
    await page.getByText("Pending Validation", { exact: true }).waitFor();
    assert.equal(calls.some(call => call.path === "/admin/accounts"), false);
    assert.ok(calls.filter(call => call.method === "GET").every(call => call.approved));
    const dashboardReads = calls.filter(call => call.path === "/admin/dashboard").length;
    // Default dashboard plus the intentionally distinct source=Admin preload.
    assert.ok(dashboardReads <= 2, `Duplicate landing reads: ${dashboardReads}`);
    await page.clock.install();
    await page.clock.fastForward(9000);
    holdLogs = true;
    const refreshing = page.waitForRequest(request => request.url().endsWith("/api/admin/logs"));
    await page.getByText("Logs", { exact: true }).first().click();
    await refreshing;
    await page.getByText("Warm navigation fixture", { exact: true }).waitFor({ timeout: 3000 });
    assert.equal(await page.getByText("Cached before navigation", { exact: true }).count(), 1,
      "cached records should render before the held network response is released");
    release();
    assert.deepEqual(errors, []);
  } finally {
    release();
    await browser.close();
    await new Promise(done => server.close(done));
  }
});
