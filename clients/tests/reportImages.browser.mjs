import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const directory = resolve("dist");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const imageUrls = process.env.REPORT_IMAGE_URLS ? JSON.parse(process.env.REPORT_IMAGE_URLS) : [1, 2, 3].map(i => `https://image.test/${i}.png`);
const server = createServer(async (req, res) => {
  let file = resolve(directory, `.${new URL(req.url, "http://localhost").pathname}`);
  if (!file.startsWith(directory)) { res.writeHead(403).end(); return; }
  if (!extname(file)) file = resolve(directory, "index.html");
  try { res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf" })[extname(file)] || "application/octet-stream"); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  let submissions = 0, accessChecks = 0;
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem("access_token", "test-token"); localStorage.setItem("user_role", "user"); });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.endsWith("/session")) data = { userId: "fixture-user", role: "user" };
    if (path.endsWith("/profile")) data = { name: "Fixture User", user_name: "fixture", role: "user" };
    if (path.endsWith("/credibility/access")) { accessChecks++; data = { suspended: false, reportAllowed: true }; }
    if (path.endsWith("/profile/completion")) data = { complete: true };
    if (path.endsWith("/incidents/options")) data = { categories: [{ category: "Fixture Category", types: ["Fixture Incident"] }] };
    if (path.endsWith("/reports")) data = { reports: [{ id: "fixture-report", poster_name: "Fixture User", details: "Three photo fixture", status: "Pending Review", incident_type: "Theft", created_at: new Date().toISOString(), images: imageUrls }], posts: [], total: 1, hasMore: false, order: ["User:fixture-report"] };
    if (path.endsWith("/reports") && route.request().method() === "POST") { submissions++; data = { report_id: "posted-fixture" }; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.route("https://image.test/**", route => route.fulfill({ contentType: "image/png", body: png }));
  await page.route("https://nominatim.openstreetmap.org/**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ address: { suburb: "Fresh address", town: "Argao", state: "Cebu" } }) }));
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 9.88, longitude: 123.59 });
  await page.goto(`http://127.0.0.1:${server.address().port}/User_Home`);
  await page.getByText("Three photo fixture", { exact: true }).waitFor({ timeout: 45000 });
  await page.waitForFunction(() => [...document.images].filter(img => img.src.includes('/storage/v1/') || img.src.includes('image.test')).every(img => img.complete), { timeout: 20000 });
  for (let i = 1; i <= 3; i++) {
    const cell = page.getByRole("button", { name: `Open photo ${i} of 3` });
    const box = await cell.boundingBox();
    const image = await cell.locator("img").evaluateAll(images => images.map(img => ({ width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height, loaded: img.complete && img.naturalWidth > 0 })));
    console.log(JSON.stringify({ photo: i, box, image }));
    assert.ok(box?.width > 50 && box?.height > 50);
    assert.ok(image.some(img => img.loaded && img.width > 50 && img.height > 50), "photo must visibly occupy its tile");
  }
  await page.getByRole("button", { name: "Open photo 2 of 3" }).click();
  await page.getByText("2 / 3", { exact: true }).waitFor();
  await page.waitForFunction(() => [...document.images].some(img => {
    const box = img.getBoundingClientRect();
    return img.complete && img.naturalWidth > 0 && box.width >= 350 && box.height >= 700;
  }));
  const cdp = await page.context().newCDPSession(page);
  const touch = (id, x, y) => ({ id, x, y, radiusX: 2, radiusY: 2 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(0, 140, 400), touch(1, 240, 400)] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touch(0, 90, 400), touch(1, 290, 400)] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(100);
  const transform = () => page.getByTestId("photo-zoom-transform").evaluate(node => getComputedStyle(node).transform);
  let matrix = await transform();
  assert.ok(Number(matrix.match(/matrix\(([^,]+)/)?.[1]) > 1.5, `pinch must enlarge the photo: ${matrix}`);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(0, 150, 400)] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touch(0, 205, 440)] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(100);
  matrix = await transform();
  assert.ok(Number(matrix.replace(/matrix\(|\)/g, "").split(",")[4]) > 20, `zoomed photo must drag: ${matrix}`);
  await page.getByRole("button", { name: "Reset photo zoom" }).click();
  await page.getByRole("button", { name: "Next photo", exact: true }).click();
  await page.getByText("3 / 3", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close photo viewer" }).click();
  await page.getByRole("button", { name: "Create report", exact: true }).click();
  const address = page.getByRole("textbox", { name: "Report location address" });
  await address.waitFor();
  await page.waitForFunction(() => { const input = document.querySelector('[aria-label="Report location address"]'); return input && !input.readOnly; });
  await address.fill("Draft address to clear");
  await page.getByText("Select Incident Category", { exact: true }).click();
  await page.getByText("Fixture Category", { exact: true }).click();
  await page.getByText("Select Incident Type", { exact: true }).click();
  await page.getByText("Fixture Incident", { exact: true }).click();
  await page.getByPlaceholder("Describe what happened...").fill("Submitted draft must be cleared");
  await page.getByRole("button", { name: "Post Report", exact: true }).click();
  await page.getByText("Report submitted successfully. It is now pending review.", { exact: true }).waitFor();
  assert.equal(submissions, 1);
  assert.equal(accessChecks, 1, "submission does not repeat + preflight");
  await page.getByRole("button", { name: "Create report", exact: true }).click();
  await page.getByPlaceholder("Describe what happened...").waitFor();
  assert.equal(await page.getByPlaceholder("Describe what happened...").inputValue(), "");
  assert.equal(await page.getByTestId("post-report-scroll").evaluate(node => node.scrollTop), 0);
  await page.getByText("Select Incident Category", { exact: true }).waitFor();
  assert.notEqual(await address.inputValue(), "Draft address to clear");
  assert.deepEqual(errors, []);
  console.log("Three-photo feed, fullscreen pinch/drag/browsing and confirmed form/scroll reset checks passed.");
} finally { await browser.close(); await new Promise(done => server.close(done)); }
