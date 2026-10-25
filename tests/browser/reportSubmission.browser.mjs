import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const deferred = () => { let done; const promise = new Promise((resolve) => { done = resolve; }); return { promise, done }; };

test("user posting shows progress, prevents duplicate submits and does not wait for pending AI", async () => {
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
    const context = await browser.newContext({ viewport: { width: 1200, height: 1000 }, permissions: ["geolocation"], geolocation: { latitude: 9.8816, longitude: 123.5953 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.removeItem("communishield_data_cache");
      localStorage.setItem("access_token", "test-token");
      localStorage.setItem("user_role", "user");
    });
    await page.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ json: { address: { suburb: "Lamacan", town: "Argao", state: "Cebu" } }, headers: { "Access-Control-Allow-Origin": "*" } }));
    const saveGate = deferred();
    const saveStarted = deferred();
    const posted = [];
    let holdSave = true;
    let failSave = true;
    let failUpload = true;
    let uploadCount = 0;
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
      if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
      if (request.method() === "POST" && path === "/api/reports") {
        posted.push(JSON.parse(request.postData())); saveStarted.done();
        if (holdSave) await saveGate.promise;
        await route.fulfill({ status: failSave ? 400 : 201, json: failSave ? { error: "Report storage unavailable" } : { report_id: "new-report", analysis: { credibility: "pending", sentiment_status: "pending" } }, headers });
        return;
      }
      if (request.method() === "POST" && path === "/api/upload/image") {
        uploadCount++;
        await route.fulfill({ status: failUpload ? 500 : 200, json: failUpload ? { error: "Upload failed" } : { url: "https://example.test/photo.jpg" }, headers });
        return;
      }
      let json = {};
      if (/\/(profile|session)$/.test(path)) json = { userId: "fixture-user", name: "Test User", role: "user", user_name: "tester" };
      else if (path.endsWith("/incidents/options")) json = { categories: [{ category: "Property-Related Incidents", types: ["Theft"] }] };
      else if (path.includes("notifications")) json = { reportStatuses: [], nearbyIncidents: [] };
      else if (path.endsWith("/reports")) json = { reports: [] };
      else if (path.endsWith("/admin/posts")) json = { posts: [] };
      await route.fulfill({ json, headers });
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const fill = async () => {
      await page.goto(`${origin}/User_PostReport`);
      await page.waitForFunction(() => [...document.querySelectorAll("input")].some((input) => input.value.includes("Lamacan")));
      await page.getByText("Select Incident Category", { exact: true }).click();
      await page.getByText("Property-Related Incidents", { exact: true }).click();
      await page.getByText("Select Incident Type", { exact: true }).click();
      await page.getByText("Theft", { exact: true }).click();
      await page.getByPlaceholder("Describe what happened...").fill("Fictional browser regression test; not a real report.");
    };
    await fill();
    const button = page.getByRole("button", { name: "Post Report", exact: true });
    await button.evaluate((element) => { element.click(); element.click(); });
    await saveStarted.promise;
    await page.getByRole("button", { name: "Saving report...", exact: true }).waitFor();
    assert.equal(posted.length, 1);
    assert.equal(await page.getByRole("button", { name: "Saving report...", exact: true }).isDisabled(), true);
    saveGate.done();
    await page.getByText("Report storage unavailable", { exact: true }).waitFor();
    assert.equal(await page.getByPlaceholder("Describe what happened...").inputValue(), "Fictional browser regression test; not a real report.");
    holdSave = false; failSave = false;
    await page.getByRole("button", { name: "Post Report", exact: true }).click();
    await page.getByText("Report submitted successfully. It is now pending review.", { exact: true }).waitFor();
    await page.waitForURL("**/User_Home");
    assert.equal(posted.length, 2);
    assert.deepEqual(posted[1].photos, []);

    // A failed selected photo must stop submission, rather than silently lose it.
    await fill();
    await page.getByText("Choose from Album", { exact: true }).click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByText("Choose from Gallery", { exact: true }).click()]);
    await chooser.setFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1cAAAAASUVORK5CYII=", "base64") });
    await page.getByText("1/3", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Post Report", exact: true }).click();
    await page.getByText("Photo 1 could not upload. Your report has not been submitted. Please try again.", { exact: true }).waitFor();
    assert.equal(posted.length, 2);
    assert.equal(uploadCount, 1);
    failUpload = false;
    await page.getByRole("button", { name: "Post Report", exact: true }).click();
    await page.waitForURL("**/User_Home");
    assert.equal(posted.length, 3);
    assert.deepEqual(posted[2].photos, ["https://example.test/photo.jpg"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
});
