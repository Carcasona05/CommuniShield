import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");

test("archiving removes reports from active views and lists them under Logs", async () => {
  const directory = resolve(process.env.WEB_EXPORT_DIR);
  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
  const reports = [
    { id: "rep-theft", incident_type: "Theft", incident_category: "Property-Related Incidents", location: "Lamacan, Argao", barangay: "Lamacan", details: "Bike taken from the yard", status: "Pending Review", severity: "Medium", ai_score: 71, reporter_name: "Juan Dela Cruz", source: "User", role: "user", user_id: "user-1", is_verified: false, created_at: iso(-3600000), comments: [], images: [] },
    { id: "rep-flooding", incident_type: "Flooding", incident_category: "Community and Environmental Concerns", location: "Poblacion, Argao", barangay: "Poblacion", details: "Water on the road", status: "Pending Review", severity: "High", ai_score: 84, reporter_name: "Maria Santos", source: "User", role: "user", user_id: "user-2", is_verified: false, created_at: iso(-7200000), comments: [], images: [] },
    { id: "rep-vandalism", incident_type: "Vandalism", incident_category: "Property-Related Incidents", location: "Canbanua, Argao", barangay: "Canbanua", details: "Wall scratched overnight", status: "Pending Review", severity: "Low", ai_score: 42, reporter_name: "Pedro Reyes", source: "User", role: "user", user_id: "user-3", is_verified: false, created_at: iso(-10800000), comments: [], images: [] },
  ];
  const logs = [{ id: "log-1", actionType: "Report Verified", title: "Report verified: Theft", actor: "Test Admin", actorRole: "admin", reportId: "rep-theft", details: "Reviewed and verified", oldStatus: "Under Verification", newStatus: "Resolved", dateTime: iso(-5400000) }];
  const statusPosts = [];

  const server = createServer(async (request, response) => {
    let path = resolve(directory, `.${new URL(request.url, "http://localhost").pathname}`);
    if (!path.startsWith(directory)) { response.writeHead(403); response.end(); return; }
    if (!extname(path)) path = resolve(directory, "index.html");
    try { response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".ttf": "font/ttf", ".png": "image/png" })[extname(path)] || "application/octet-stream"); response.end(await readFile(path)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, downloadsPath: resolve(directory, "archive-test-downloads") });
  const cors = { "Access-Control-Allow-Origin": "*" };

  const handleApi = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });
      return;
    }

    const statusMatch = path.match(/^\/api\/reports\/([^/]+)\/status$/);
    if (request.method() === "POST" && statusMatch) {
      const body = JSON.parse(request.postData() || "{}");
      const report = reports.find((item) => item.id === statusMatch[1]);
      statusPosts.push({ id: statusMatch[1], status: body.status, is_verified: body.is_verified });
      if (report) {
        const previous = report.status;
        report.status = body.status;
        logs.unshift({
          id: `log-${logs.length + 1}`,
          actionType: body.status === "Archived" ? "Report Archived" : "Report Verified",
          title: body.status === "Archived" ? `Report archived: ${report.incident_type}` : `Report status updated: ${report.incident_type}`,
          actor: "Test Admin",
          actorRole: "admin",
          reportId: report.id,
          details: `Status changed from "${previous}" to "${body.status}"`,
          oldStatus: previous,
          newStatus: body.status,
          dateTime: iso(0),
        });
      }
      await route.fulfill({ json: { message: "Report validated", status: body.status }, headers: cors });
      return;
    }

    let data = {};
    if (path.endsWith("/admin/dashboard")) {
      const status = url.searchParams.get("status");
      // Intentionally unfiltered: the client must hide archived rows itself.
      const list = status === "Archived" ? reports.filter((item) => item.status === "Archived") : reports;
      data = { summary: { total: list.length }, reports: list };
    } else if (path.endsWith("/admin/logs")) {
      data = { logs };
    } else if (path.endsWith("/admin/announcements")) {
      data = { announcements: [] };
    } else if (path.endsWith("/profile")) {
      data = { role: "admin", fullname: "Test Admin", name: "Test Admin" };
    } else if (path.includes("notifications")) {
      data = { notifications: [], unreadCount: 0 };
    } else if (path.endsWith("/reports")) {
      data = { reports };
    } else if (path.endsWith("/admin/posts")) {
      data = { posts: [] };
    } else if (path.endsWith("/reports/mine")) {
      data = { reports };
    }
    await route.fulfill({ json: data, headers: cors });
  };

  try {
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.removeItem("communishield_data_cache");
      localStorage.setItem("access_token", "test-token");
      localStorage.setItem("user_role", "admin");
    });
    await page.route("**/api/**", handleApi);

    await page.goto(`${origin}/Admin_Validation`);
    await page.getByText("3 results", { exact: true }).waitFor();

    // Move one report to the archive from Incident Management.
    const viewButtons = page.getByRole("button", { name: "View Posts" });
    await viewButtons.nth(2).click();
    await page.getByText("Similar Reports", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Report actions" }).click();
    await page.getByText("Move to Archived Reports", { exact: true }).click();
    await page.getByText("2 results", { exact: true }).waitFor();
    assert.deepEqual(statusPosts.at(-1), { id: "rep-vandalism", status: "Archived", is_verified: false });
    assert.equal(await page.getByText("Vandalism", { exact: true }).count(), 0);

    // Archived reports only show up in Logs.
    await page.goto(`${origin}/Admin_Logs`);
    await page.getByText("Recent Activity", { exact: true }).waitFor();
    await page.getByText("Report Archived", { exact: true }).waitFor();
    await page.getByText("Archived reports", { exact: true }).click();
    const archivedRows = page.getByTestId("archived-report-row");
    await archivedRows.waitFor();
    assert.equal(await archivedRows.count(), 1);
    assert.match(await archivedRows.first().innerText(), /Vandalism/);
    assert.equal(await page.getByText("Recent Activity", { exact: true }).count(), 0);

    // Restoring sends it back to Pending Review.
    await page.getByRole("button", { name: /^Restore report/ }).click();
    await page.getByText("No archived reports", { exact: true }).waitFor();
    assert.deepEqual(statusPosts.at(-1), { id: "rep-vandalism", status: "Pending Review", is_verified: false });

    await page.goto(`${origin}/Admin_Validation`);
    await page.getByText("3 results", { exact: true }).waitFor();

    // Users never see archived reports, even if a response still contains one.
    const userPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    userPage.on("pageerror", (error) => errors.push(error.message));
    await userPage.addInitScript(() => {
      localStorage.removeItem("communishield_data_cache");
      localStorage.setItem("access_token", "test-token");
      localStorage.setItem("user_role", "user");
    });
    await userPage.route("**/api/**", handleApi);
    await userPage.goto(`${origin}/User_Home`);
    await userPage.getByText("Bike taken from the yard", { exact: true }).waitFor();

    reports[2].status = "Archived";
    await userPage.reload();
    await userPage.getByText("Bike taken from the yard", { exact: true }).waitFor();
    assert.equal(await userPage.getByText("Wall scratched overnight", { exact: true }).count(), 0);

    await userPage.getByText("Status", { exact: true }).first().click();
    await userPage.getByText("Rejected", { exact: true }).waitFor();
    assert.equal(await userPage.getByText("Archived", { exact: true }).count(), 0);

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
});
