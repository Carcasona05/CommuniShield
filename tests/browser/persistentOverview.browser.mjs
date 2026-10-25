import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const gate = () => { let release; const promise = new Promise(done => { release = done; }); return { promise, release }; };

test("first overview and authenticated IndexedDB reload render under 3s while report details are held", { timeout: 60000 }, async () => {
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
  const details = gate(), validation = gate(), sessionStarted = gate(), liveOverview = gate();
  let holdValidation = false, holdOverview = false, denied = false;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], calls = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem("access_token")) {
        localStorage.setItem("access_token", "fixture-token");
        localStorage.setItem("user_role", "admin");
      }
    });
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
      const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,OPTIONS" };
      if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
      calls.push(path);
      let data = {};
      if (path === "/session") {
        if (holdValidation) { sessionStarted.release(); await validation.promise; }
        if (denied) { await route.fulfill({ status: 401, json: { error: "Session expired" }, headers }); return; }
        data = { userId: "authorized-admin", role: "admin" };
      } else if (path === "/admin/overview") {
        if (holdOverview) await liveOverview.promise;
        data = { summary: { total: 57, pending: 20, verified: 30, rejected: 7, hotspots: 2 } };
      } else if (path === "/admin/dashboard") {
        await details.promise;
        data = { reports: [{ details: "PRIVATE_REPORT_MUST_NOT_BE_PERSISTED" }] };
      } else if (path === "/profile") data = { role: "admin", email: "private@example.com" };
      else if (path === "/incidents/options") data = { categories: [{ category: "Safety", types: ["Theft"] }] };
      else if (path.includes("notifications")) data = { notifications: [], unreadCount: 0 };
      await route.fulfill({ json: data, headers });
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const firstStart = performance.now();
    await page.goto(`${origin}/Admin_Dashboard`);
    await page.getByText("Pending Validation", { exact: true }).waitFor({ timeout: 3000 });
    const firstMs = performance.now() - firstStart;
    assert.ok(firstMs < 3000, `First usable overview took ${firstMs.toFixed(0)}ms`);
    await page.waitForFunction(async () => {
      return new Promise(resolve => {
        const request = indexedDB.open("communishield_page_previews_v1", 1);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction("previews").objectStore("previews").getAll();
          read.onsuccess = () => { resolve(read.result.some(record => record.pages.some(page => page.path === "/admin/overview"))); db.close(); };
          read.onerror = () => { db.close(); resolve(false); };
        };
      });
    });
    holdValidation = true; holdOverview = true;
    const refreshedAt = performance.now();
    await page.reload();
    await sessionStarted.promise;
    assert.equal(await page.getByText("Pending Validation", { exact: true }).count(), 0,
      "saved data must not appear before authoritative session validation");
    validation.release();
    await page.getByText("Pending Validation", { exact: true }).waitFor({ timeout: 3000 });
    const warmMs = performance.now() - refreshedAt;
    assert.ok(warmMs < 3000, `Cached authenticated overview took ${warmMs.toFixed(0)}ms`);
    assert.match(await page.getByTestId("dashboard-data-status").innerText(), /Saved overview/);
    assert.equal(calls.includes("/admin/accounts"), false);
    liveOverview.release();
    await page.getByTestId("dashboard-data-status").filter({ hasText: "Overview updated" }).waitFor();
    denied = true; holdValidation = false;
    await page.reload();
    await page.waitForURL("**/Admin_Login");
    assert.equal(await page.getByText("Pending Validation", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`Controlled local timing: first overview ${firstMs.toFixed(0)}ms; validated cached reload ${warmMs.toFixed(0)}ms. Not a production latency guarantee.`);
  } finally {
    details.release(); validation.release(); liveOverview.release();
    await browser.close();
    await new Promise(done => server.close(done));
  }
});
