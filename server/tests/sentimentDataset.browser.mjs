// Optional browser smoke test against a real Expo web export and mocked API.
// PLAYWRIGHT_MODULE: file URL to playwright-core/lib/inprocess.js (or package index.mjs).
// WEB_EXPORT_DIR: exported bundle path. CHROME_PATH: local Chrome executable.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { parseDatasetCsv, validateDatasetRows } from "../src/services/sentimentDatasetValidation.ts";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");

test("admin manual/CSV previews, persistence, and super-admin review work in the exported UI", async () => {
  const directory = resolve(process.env.WEB_EXPORT_DIR);
  const types = { ".js": "text/javascript", ".html": "text/html", ".ttf": "font/ttf", ".png": "image/png", ".ico": "image/x-icon" };
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    let file = resolve(directory, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(directory)) { response.writeHead(403); response.end(); return; }
    if (!extname(file)) file = resolve(directory, "index.html");
    try { response.setHeader("Content-Type", types[extname(file)] || "application/octet-stream"); response.end(await readFile(file)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const datasets = [];
  const trainingId = randomUUID();
  const training = {
    state: { generation: 0, data_revision: 0, active_job_id: null, previous_job_id: null },
    registryEnabled: true,
    jobs: [],
  };
  const adminId = "10000000-0000-4000-8000-000000000001";
  const contexts = [];
  const pageErrors = [];
  const capture = async (page, name) => {
    if (!process.env.UI_SCREENSHOT_DIR) return;
    await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, `${name}.png`), animations: "disabled" });
  };
  async function pageFor(role) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    await context.addInitScript(({ role, adminId }) => {
      localStorage.setItem("access_token", "test-browser-token");
      localStorage.setItem("user_role", role);
      localStorage.setItem("admin_info", JSON.stringify({ id: adminId, name: "Test Admin", role }));
    }, { role, adminId });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS" } });
        return;
      }
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/api/, "");
      let result = {};
      const body = request.method() === "POST" || request.method() === "PATCH" ? request.postDataJSON() : {};
      if (path === "/profile") result = { role, name: "Test Admin", email: "admin@example.com" };
      else if (path === "/admin/analytics") result = { summary: { activeIncidents: 0, sentimentAnalyzed: 0, sentimentTotal: 0, sentimentDistribution: [] }, sentimentTrend: [] };
      else if (path === "/sentiment/training" && request.method() === "POST") {
        if (body.action === "activate") {
          training.state.previous_job_id = training.state.active_job_id;
          training.state.active_job_id = body.jobId; training.state.generation++;
        } else if (body.action === "rollback") {
          const previous = training.state.active_job_id;
          training.state.active_job_id = training.state.previous_job_id;
          training.state.previous_job_id = previous; training.state.generation++;
        }
        result = { message: "Training action recorded." };
      } else if (path === "/sentiment/training") result = training;
      else if (path === "/sentiment/datasets/preview") {
        const existing = datasets.filter((item) => ["pending", "approved"].includes(item.status)).flatMap((item) => item.samples);
        const rows = validateDatasetRows(body.csv !== undefined ? parseDatasetCsv(body.csv) : body.rows, existing);
        result = { rows, validCount: rows.filter((item) => item.status === "valid").length };
      } else if (path === "/sentiment/datasets" && request.method() === "POST") {
        const id = randomUUID();
        const samples = validateDatasetRows(body.rows).map((row) => ({ ...row, id: randomUUID() }));
        datasets.unshift({ id, name: body.name, source: body.source, status: "pending", version: 1, created_by: adminId, created_by_name: "Test Admin", created_at: new Date().toISOString(), samples });
        result = { id, message: "Dataset submitted for approval. The active models are unchanged." };
      } else if (path === "/sentiment/datasets") {
        const status = url.searchParams.get("status");
        const matches = datasets.filter((item) => !status || status === "all" || item.status === status);
        result = { datasets: matches.map((item) => ({ ...item, sentiment_training_samples: [{ count: item.samples.length }] })), total: matches.length, viewerId: adminId };
      } else if (/\/sentiment\/datasets\/[^/]+\/samples\/[^/]+$/.test(path)) {
        const batch = datasets.find((item) => item.id === path.split("/")[3]);
        const sample = batch.samples.find((item) => item.id === path.split("/")[5]);
        Object.assign(sample, body.sample); batch.version++;
        result = { message: "Example updated." };
      } else if (/\/sentiment\/datasets\/[^/]+\/review$/.test(path)) {
        const batch = datasets.find((item) => item.id === path.split("/")[3]);
        batch.status = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : "archived";
        if (body.action === "approve") {
          training.state.data_revision++;
          training.jobs = [{ id: trainingId, status: "queued", created_at: new Date().toISOString(), available_at: new Date().toISOString(), data_revision: training.state.data_revision, base_generation: training.state.generation }];
        }
        batch.version++; result = { message: "Dataset status updated. The active models are unchanged." };
      } else if (/\/sentiment\/datasets\/[^/]+$/.test(path)) {
        const batch = datasets.find((item) => item.id === path.split("/")[3]);
        result = { dataset: batch, samples: batch.samples, sampleCount: batch.samples.length, events: [] };
      } else if (path.includes("notifications")) result = { notifications: [], unreadCount: 0 };
      await route.fulfill({ json: result, headers: { "Access-Control-Allow-Origin": "*" } });
    });
    return page;
  }
  try {
    const admin = await pageFor("admin");
    await admin.goto(`${origin}/Admin_ince_Anaytics`);
    assert.equal(await admin.getByRole("tab", { name: "Add data", exact: true }).getAttribute("aria-selected"), "true");
    await admin.getByRole("textbox", { name: "Training example text", exact: true }).fill("Maayo kaayo ang serbisyo");
    await capture(admin, "admin-add-data");
    const overviewBox = await admin.getByTestId("sentiment-overview-panel").boundingBox();
    const trainingBox = await admin.getByTestId("sentiment-training-panel").boundingBox();
    assert.ok(Math.abs(overviewBox.height - trainingBox.height) <= 1, "Training card must match overview height");
    const trainingScroll = admin.getByTestId("sentiment-training-scroll");
    assert.ok(await trainingScroll.evaluate((element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY)), "Training content must scroll inside its card when needed");
    const scrollbar = await trainingScroll.evaluate((element) => ({
      width: getComputedStyle(element, "::-webkit-scrollbar").width,
      thumb: getComputedStyle(element, "::-webkit-scrollbar-thumb").backgroundColor,
      rounding: getComputedStyle(element, "::-webkit-scrollbar-thumb").borderRadius,
      overscroll: getComputedStyle(element).overscrollBehaviorY,
    }));
    assert.equal(scrollbar.width, "10px");
    assert.equal(scrollbar.thumb, "rgb(154, 174, 208)");
    assert.equal(scrollbar.rounding, "999px");
    assert.equal(scrollbar.overscroll, "contain");
    const languageTrigger = admin.getByRole("button", { name: "Select language", exact: true });
    const dialogsBefore = await admin.getByRole("dialog").count();
    await languageTrigger.click();
    assert.equal(await admin.getByRole("dialog").count(), dialogsBefore);
    const triggerBox = await languageTrigger.boundingBox();
    const optionBox = await admin.getByRole("button", { name: "Cebuano", exact: true }).boundingBox();
    assert.ok(optionBox.y >= triggerBox.y + triggerBox.height, "Options must expand below the trigger, not in a modal");
    await admin.keyboard.press("Escape");
    assert.equal(await admin.getByRole("button", { name: "Cebuano", exact: true }).count(), 0);
    await languageTrigger.click();
    await admin.getByRole("button", { name: "Cebuano", exact: true }).click();
    await admin.getByRole("button", { name: "Select sentiment label", exact: true }).click();
    await admin.getByText("Positive", { exact: true }).click();
    await admin.getByRole("button", { name: "Preview example", exact: true }).click();
    await admin.getByText("1 valid / 1 total", { exact: true }).waitFor();
    assert.equal(await admin.getByRole("textbox", { name: "Dataset name", exact: true }).inputValue(), "");
    await admin.getByRole("textbox", { name: "Dataset name", exact: true }).fill("Manual sentiment example");
    await admin.getByRole("checkbox").click();
    await capture(admin, "dataset-preview");
    await admin.getByRole("button", { name: "Submit for review", exact: true }).click();
    await admin.getByText("Manual sentiment example", { exact: true }).waitFor();
    await admin.reload();
    await admin.getByRole("tab", { name: "Datasets", exact: true }).click();
    await admin.getByText("Manual sentiment example", { exact: true }).waitFor();
    await admin.getByRole("tab", { name: "Add data", exact: true }).click();
    await admin.getByRole("button", { name: "Import datasets", exact: true }).click();
    const chooserPromise = admin.waitForEvent("filechooser");
    await admin.getByRole("button", { name: "Choose CSV file", exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: "community.csv", mimeType: "text/csv", buffer: Buffer.from('text,language,label\n"Maayo kaayo ang serbisyo",cebuano,positive\n"Delikado kaayo diri",cebuano,negative\n"bad",unknown,positive') });
    assert.equal(await admin.getByRole("textbox", { name: "Dataset name", exact: true }).inputValue(), "");
    await admin.getByRole("textbox", { name: "Dataset name", exact: true }).fill("community.csv");
    await admin.getByRole("button", { name: "Validate & preview", exact: true }).click();
    await admin.getByText("1 valid / 3 total", { exact: true }).waitFor();
    await admin.getByText("Duplicate", { exact: true }).waitFor();
    await admin.getByText("Invalid", { exact: true }).waitFor();
    await admin.getByRole("checkbox").click();
    await admin.getByRole("button", { name: "Submit for review", exact: true }).click();
    await admin.getByText("community.csv", { exact: true }).waitFor();
    await admin.getByText("Manual sentiment example", { exact: true }).click();
    await admin.getByRole("button", { name: "Edit pending example", exact: true }).waitFor();
    assert.equal(await admin.getByRole("button", { name: "Approve dataset", exact: true }).count(), 0);
    await admin.getByRole("button", { name: "Edit pending example", exact: true }).click();
    await admin.getByText("Cebuano", { exact: true }).click();
    await admin.getByText("Filipino", { exact: true }).click();
    await admin.getByText("Positive", { exact: true }).click();
    await admin.getByText("Neutral", { exact: true }).last().click();
    await admin.getByRole("button", { name: "Save changes", exact: true }).click();
    await admin.getByText("filipino", { exact: true }).waitFor();
    assert.equal(datasets.find((item) => item.name === "Manual sentiment example").samples[0].language, "filipino");
    await admin.getByRole("button", { name: "Close", exact: true }).click();

    const reviewer = await pageFor("super_admin");
    await reviewer.goto(`${origin}/SAdmin_SentimentDatasets`);
    assert.equal(await reviewer.getByRole("tab", { name: "Datasets", exact: true }).getAttribute("aria-selected"), "true");
    await reviewer.getByText("community.csv", { exact: true }).waitFor();
    await capture(reviewer, "super-admin-review");
    await reviewer.getByText("community.csv", { exact: true }).click();
    await reviewer.getByRole("button", { name: "Approve dataset", exact: true }).click();
    await reviewer.getByText("Confirm", { exact: true }).click();
    await reviewer.getByRole("button", { name: "More actions", exact: true }).click();
    await reviewer.getByRole("button", { name: "Export training JSON", exact: true }).waitFor();
    assert.equal(datasets.find((item) => item.name === "community.csv").status, "approved");
    await reviewer.getByRole("button", { name: "Close", exact: true }).click();
    await reviewer.getByRole("tab", { name: "Training", exact: true }).click();
    await reviewer.getByText("Waiting to start.", { exact: true }).waitFor();
    await admin.getByRole("tab", { name: "Training", exact: true }).click();
    await admin.getByText("Waiting to start.", { exact: true }).waitFor();
    assert.equal(await admin.getByRole("button", { name: "Activate candidate", exact: true }).count(), 0);
    assert.equal(await admin.getByRole("button", { name: "Model controls", exact: true }).count(), 0);
    await capture(admin, "admin-training");
    training.jobs[0].status = "ready";
    training.jobs[0].metrics = { passed: true, languages: { cebuano: { baseline: { macro_f1: 0.72 }, candidate: { macro_f1: 0.75 } } }, reasons: [] };
    await reviewer.getByRole("button", { name: "Refresh training", exact: true }).click();
    await reviewer.getByRole("button", { name: "Activate candidate", exact: true }).waitFor();
    await capture(reviewer, "super-admin-training");
    await reviewer.getByRole("button", { name: "Activate candidate", exact: true }).click();
    await reviewer.getByText("Confirm", { exact: true }).click();
    await reviewer.getByText(trainingId.slice(0, 8), { exact: true }).waitFor();
    await reviewer.getByRole("button", { name: "How training works", exact: true }).click();
    await reviewer.getByText("Model generation: 1. Status updates every 10 seconds.", { exact: true }).waitFor();
    await reviewer.getByRole("button", { name: "Model controls", exact: true }).click();
    await reviewer.getByRole("button", { name: "Roll back model", exact: true }).click();
    await reviewer.getByText("Confirm", { exact: true }).click();
    await reviewer.getByText("Built-in model", { exact: true }).waitFor();
    await reviewer.getByText("Model generation: 2. Status updates every 10 seconds.", { exact: true }).waitFor();
    await admin.getByRole("tab", { name: "Add data", exact: true }).click();
    await admin.setViewportSize({ width: 820, height: 1000 });
    await capture(admin, "admin-narrow-before-focus");
    await admin.getByRole("textbox", { name: "Training example text", exact: true }).click();
    await capture(admin, "admin-narrow");
    assert.deepEqual(pageErrors, []);
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
    await new Promise((done) => server.close(done));
  }
});
