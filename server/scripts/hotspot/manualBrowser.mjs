// Optional interactive smoke test against the REAL local app/API. No request
// mocking, auth bypass, token logging or report/sentiment mutation. Normal
// sign-in can write session/login-activity records. User signs in via UI.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const origin = process.env.MANUAL_APP_URL || "http://localhost:8081";
const out = resolve(process.env.MANUAL_OUTPUT_DIR || "../artifacts/hotspot-sentiment");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${origin}/Admin_Login`);
  console.log("A Chrome window is open. Sign in there as an admin and complete device verification. Do not paste credentials into chat.");
  await page.waitForFunction(() => Boolean(localStorage.getItem("access_token")) && ["admin", "super_admin"].includes(localStorage.getItem("user_role")), null, { timeout: 600000 });
  const clusterResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/admin/clusters") && response.status() === 200, { timeout: 120000 });
  await page.goto(`${origin}/Admin_Hotspot_Detection`);
  const snapshot = await (await clusterResponse).json();
  await page.getByText("DBSCAN Hotspots", { exact: true }).waitFor();
  if (snapshot.clustering.clusters.length) {
    await page.getByTestId("hotspot-sentiment-summary").first().waitFor();
    const expected = snapshot.clustering.clusters[0].evidence;
    assert.ok(expected, "Live endpoint must include sentiment evidence");
    assert.match(await page.getByTestId("hotspot-report-sentiment").first().innerText(), new RegExp(`${expected.reports.usable}/${expected.reports.total} usable`));
  } else {
    await page.getByText("No spatial hotspots detected", { exact: true }).waitFor();
  }
  // Filter checks stay in the browser; all cluster requests are read-only GETs.
  await page.getByText("Last 30 days", { exact: true }).click();
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/admin/clusters?") && response.url().includes("period=7d") && response.status() === 200),
    page.getByText("Last 7 days", { exact: true }).click(),
  ]);
  await page.getByText("Last 7 days", { exact: true }).click();
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/admin/clusters?") && response.url().includes("period=30d") && response.status() === 200),
    page.getByText("Last 30 days", { exact: true }).click(),
  ]);
  await mkdir(out, { recursive: true });
  if (snapshot.clustering.clusters.length) {
    const card = page.getByTestId("spatial-hotspot-card").first();
    await card.waitFor();
    await card.screenshot({ path: resolve(out, "live-hotspot-sentiment-card.png") });
  }
  await page.screenshot({ path: resolve(out, "live-hotspot-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.waitForFunction(() => document.querySelector('[data-testid="hotspot-list-panel"]')?.getBoundingClientRect().height >= 600);
  await page.getByTestId("hotspot-list-panel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, "live-hotspot-narrow.png"), fullPage: true });
  await page.setViewportSize({ width: 1600, height: 1100 });
  assert.deepEqual(pageErrors, []);
  const evidence = {
    testedAt: new Date().toISOString(), app: origin, authenticatedApi: true,
    requestMocking: false, reportOrSentimentWrites: false, normalLoginSessionWritesPossible: true,
    clustering: { generatedAt: snapshot.clustering.generatedAt, dataMode: snapshot.clustering.dataMode, parameters: snapshot.clustering.parameters, summary: snapshot.clustering.summary,
      clusters: snapshot.clustering.clusters.map(({ location, reportCount, uniqueLocationCount, evidence: summary }) => ({ location, reportCount, uniqueLocationCount, evidence: summary })) },
    pageErrors,
  };
  await writeFile(resolve(out, "live-test-output.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`LIVE MANUAL TEST PASSED. Output and screenshots: ${out}. The browser will remain open so you can inspect it.`);
  await page.waitForEvent("close", { timeout: 0 });
} finally {
  await browser.close();
}
