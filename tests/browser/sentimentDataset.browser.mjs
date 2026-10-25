// Optional browser smoke test against a real Expo web export and mocked API.
// PLAYWRIGHT_MODULE: file URL to playwright-core/lib/inprocess.js (or package index.mjs).
// WEB_EXPORT_DIR: exported bundle path. CHROME_PATH: local Chrome executable.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { parseDatasetCsv, validateDatasetRows } from "../../server/src/services/sentimentDatasetValidation.ts";
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
  const trainingActions = [];
  const trainingModes = [];
  const poolActions = [];
  const poolModels = [];
  let maxEnabled = 3;
  const training = {
    state: { generation: 0, data_revision: 0, active_job_id: null, previous_job_id: null },
    registryEnabled: true,
    continuedTraining: true,
    automaticUpdates: true,
    supportingPool: true,
    freshCandidates: true,
    independentAdmission: true,
    languageScopedTraining: true,
    manualTraining: true,
    manualEnable: true,
    poolSummary: { queueSummaryVersion: 1, approvedExamples: 0, approvedDatasets: 0, newExamples: 0, readyToQueueExamples: 0, readyToQueueDatasets: 0, readyDatasets: [], languages: {} },
    supportingServingEnabled: true,
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
      else if (path === "/sentiment/supporting-models" && request.method() === "POST") {
        poolActions.push(body.action);
        const model = poolModels.find((m) => m.id === body.modelId);
        if (body.action === "set_limit") maxEnabled = body.limit;
        else model.status = ({ disable: "disabled", enable: "enabled", archive: "archived", restore: "disabled", delete: "deleted" })[body.action];
        training.state.generation++;
        result = { message: "Supporting model pool updated." };
      }
      else if (path === "/sentiment/supporting-models") {
        const page = Number(url.searchParams.get("page") || 1);
        const available = poolModels.filter((m) => m.status !== "deleted");
        result = { models: available.slice((page - 1) * 10, page * 10), total: available.length,
          enabledCount: available.filter((m) => m.status === "enabled").length, maxEnabled, generation: training.state.generation };
      }
      else if (path === "/admin/analytics") result = { summary: { activeIncidents: 0, sentimentAnalyzed: 0, sentimentTotal: 0, sentimentDistribution: [] }, sentimentTrend: [] };
      else if (path === "/sentiment/training" && request.method() === "POST") {
        trainingActions.push(body.action);
        if (body.action === "queue") {
          trainingModes.push(body.mode);
          training.jobs = [{ id: trainingId, status: "queued", training_mode: body.mode, created_at: new Date().toISOString(), available_at: new Date().toISOString(), data_revision: training.state.data_revision, base_generation: training.state.generation }];
        }
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
          training.poolSummary = { queueSummaryVersion: 1, approvedExamples: batch.samples.length, approvedDatasets: 1, newExamples: batch.samples.length,
            readyToQueueExamples: batch.samples.length, readyToQueueDatasets: 1, readyDatasets: [{id:batch.id,name:batch.name,version:batch.version+1,exampleCount:batch.samples.length,approvedAt:new Date().toISOString(),approvedBy:'Test Admin'}], languages: {} };
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
    await admin.getByRole("textbox", { name: "Training example text", exact: true }).fill("Excellent");
    await admin.getByText("Single words need careful review. Use a sentence when the sentiment depends on context; incident words are not automatically negative.", { exact: true }).waitFor();
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
    await reviewer.getByText("No training runs yet", { exact: true }).waitFor();
    assert.equal(training.jobs.length, 0, "approval must collect data, not auto-queue training");
    await reviewer.getByText("Ready to queue training", { exact: true }).waitFor();
    const current = reviewer.getByTestId("current-model-section");
    const controls = reviewer.getByTestId("current-model-controls");
    await current.getByText("Built-in model", { exact: true }).waitFor();
    await controls.getByRole("button", { name: "Queue retraining", exact: true }).waitFor();
    assert.equal(await controls.getByRole("button", { name: "Roll back model", exact: true }).count(), 0);
    assert.equal(await controls.getByRole("button", { name: "Queue fresh challenger", exact: true }).count(), 1);
    const cardBox = await current.getByText("Built-in model", { exact: true }).boundingBox();
    const controlsBox = await controls.boundingBox();
    assert.ok(controlsBox.y > cardBox.y + cardBox.height, "model controls must sit below the current model");
    const freshBox = await controls.getByRole("button", { name: "Queue fresh challenger", exact: true }).boundingBox();
    assert.ok(Math.abs(freshBox.x + freshBox.width - (controlsBox.x + controlsBox.width)) < 3,
      "model buttons must align to the right");
    await controls.getByRole("button", { name: "Queue retraining", exact: true }).click();
    await reviewer.getByText("Confirm", { exact: true }).click();
    await reviewer.waitForFunction(() => !document.body.innerText.includes("Queue supporting-model training?"));
    assert.deepEqual(trainingActions, ["queue"]);
    await reviewer.getByText("Waiting to start.", { exact: true }).waitFor();
    await controls.getByRole("button", { name: "Queue fresh challenger", exact: true }).click();
    await reviewer.getByText("Queue fresh challenger training?", { exact: true }).waitFor();
    await reviewer.getByText("Confirm", { exact: true }).click();
    await reviewer.waitForFunction(() => !document.body.innerText.includes("Queue fresh challenger training?"));
    assert.deepEqual(trainingActions, ["queue", "queue"], "both approaches queue through the same guarded action");
    assert.deepEqual(trainingModes, ["continue", "fresh"], "the panel must send an explicit training mode");
    await admin.getByRole("tab", { name: "Training", exact: true }).click();
    await admin.getByText("Waiting to start.", { exact: true }).waitFor();
    assert.equal(await admin.getByRole("button", { name: "Activate candidate", exact: true }).count(), 0);
    assert.equal(await admin.getByRole("button", { name: "Model controls", exact: true }).count(), 0);
    await capture(admin, "admin-training");
    training.jobs[0].status = 'failed';
    training.jobs[0].metrics = {admission:'independent-v1',passed:false,failure_stage:'validation_selection',failed_language:'filipino'};
    training.jobs[0].error = 'Validation quality checks failed for filipino. No supporting model was registered. The built-in is unchanged.';
    await reviewer.getByRole('button',{name:'Refresh',exact:true}).click();
    await reviewer.getByText(training.jobs[0].error,{exact:true}).waitFor();
    assert.equal(await reviewer.getByTestId('training-quality-checks').count(),0,
      'a selection failure without measurements must show the real error, not fabricated quality scores');
    delete training.jobs[0].error;
    // Reproduce the misleading screenshot: every macro-F1 exceeds 60%, but
    // accepted English precision and Filipino neutral precision still fail.
    const measured = () => ({ macro_f1: 0.722, per_class: Object.fromEntries(["negative", "neutral", "positive"].map(label => [label, { precision: 0.8, recall: 0.7, support: 100 }])) });
    const failedMetrics = { admission: "independent-v1", passed: false,
      languages: Object.fromEntries(["cebuano", "english", "filipino"].map(language => [language, { candidate: measured(), validation: measured() }])),
      routing_policy: { independent_test: { languages: Object.fromEntries(["cebuano", "english", "filipino"].map(language => [language, { passed: true, precision: 0.8, support: 30, validation_acceptance: { precision: 0.8, support: 40 }, reasons: [] }])) } }, reasons: [] };
    failedMetrics.routing_policy.independent_test.languages.english.precision = 0.72;
    failedMetrics.routing_policy.independent_test.languages.english.passed = false;
    failedMetrics.languages.filipino.validation.per_class.neutral.precision = 0.45;
    failedMetrics.languages.filipino.candidate.per_class.neutral.precision = 0.46;
    failedMetrics.routing_policy.independent_test.languages.filipino.passed = false;
    training.jobs[0].status = "failed";
    training.jobs[0].metrics = failedMetrics;
    await reviewer.getByRole("button", { name: "Refresh", exact: true }).click();
    await reviewer.getByText("Not ready to enable", { exact: true }).waitFor();
    const englishChecks = reviewer.getByTestId("quality-language-english");
    assert.equal(await reviewer.getByTestId("training-quality-checks").locator('[data-testid^="quality-language-"]').first().getAttribute("data-testid"), "quality-language-english",
      "failing languages must appear before passing languages");
    await englishChecks.getByText("Too many accepted predictions were wrong.", { exact: true }).waitFor();
    await englishChecks.getByText("Required: ≥ 75.0%", { exact: true }).waitFor();
    await englishChecks.getByText("Result: 72.0%", { exact: true }).waitFor();
    const filipinoChecks = reviewer.getByTestId("quality-language-filipino");
    await filipinoChecks.getByText("Too many predictions labelled neutral were wrong.", { exact: true }).waitFor();
    await filipinoChecks.getByText("Result: 45.0%", { exact: true }).waitFor();
    await filipinoChecks.getByText("Result: 46.0%", { exact: true }).waitFor();
    await reviewer.getByText("Not ready to enable", { exact: true }).scrollIntoViewIfNeeded();
    await capture(reviewer, "failed-training-quality-checks");
    await reviewer.setViewportSize({ width: 820, height: 1000 });
    assert.equal(await reviewer.getByTestId("training-quality-checks").evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true,
      "failed-check measurements must wrap at tablet width");
    await capture(reviewer, "failed-training-quality-checks-narrow");
    await reviewer.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await reviewer.getByText("Test: macro-F1", { exact: true }).count(), 0, "technical scores should be hidden by default");
    await reviewer.getByRole("button", { name: "See detailed scores", exact: true }).click();
    await reviewer.getByRole("button", { name: "english: all quality checks (24)", exact: true }).click();
    await reviewer.getByText("Test: macro-F1", { exact: true }).waitFor();
    await reviewer.getByText("Test: neutral recall", { exact: true }).waitFor();
    const scopedPartial = structuredClone(failedMetrics);
    scopedPartial.passed = true;
    scopedPartial.partial_pass = true;
    scopedPartial.requested_languages = ['cebuano','filipino'];
    scopedPartial.qualified_languages = ['cebuano'];
    scopedPartial.routing_policy.scope_version = 1;
    scopedPartial.routing_policy.requested_languages = ['cebuano','filipino'];
    delete scopedPartial.languages.english;
    delete scopedPartial.routing_policy.independent_test.languages.english;
    training.jobs[0].status = 'ready';
    training.jobs[0].metrics = scopedPartial;
    training.jobs[0].training_languages = ['cebuano','filipino'];
    await reviewer.getByRole('button',{name:'Refresh',exact:true}).click();
    await reviewer.getByText('Some languages are ready for review',{exact:true}).waitFor();
    await reviewer.getByText('Languages in this run: cebuano, filipino',{exact:true}).waitFor();
    await reviewer.getByTestId('quality-language-english').getByText('Not included',{exact:true}).waitFor();
    await reviewer.getByTestId('quality-language-cebuano').getByText('Passed',{exact:true}).waitFor();
    await reviewer.getByTestId('quality-language-filipino').getByText('Needs improvement',{exact:true}).waitFor();
    await capture(reviewer,'language-scoped-partial-result');
    training.jobs[0].status = "ready";
    training.jobs[0].metrics = structuredClone(failedMetrics);
    training.jobs[0].metrics.passed = true;
    training.jobs[0].metrics.languages.cebuano.candidate.macro_f1 = 0.75;
    training.jobs[0].metrics.languages.filipino.validation.per_class.neutral.precision = 0.8;
    training.jobs[0].metrics.languages.filipino.candidate.per_class.neutral.precision = 0.8;
    training.jobs[0].metrics.routing_policy.independent_test.languages.english.precision = 0.8;
    training.jobs[0].metrics.routing_policy.independent_test.languages.english.passed = true;
    training.jobs[0].metrics.routing_policy.independent_test.languages.filipino.passed = true;
    // Passing candidates remain disabled until an explicit super-admin enable.
    poolModels.push({ id: trainingId, name: "Supporting model test", status: "disabled", use_count: 0, datasets: [],
      metrics: training.jobs[0].metrics, routing_policy: { version: 2, passed: true, languages: { cebuano: {} },
        independent_test: { languages: { cebuano: { passed: true, precision: 0.8, support: 30 } } } } });
    training.state.generation = 1;
    await reviewer.getByRole("button", { name: "Refresh", exact: true }).click();
    await reviewer.getByText("Ready for admin review", { exact: true }).waitFor();
    assert.equal(await reviewer.getByRole("button", { name: "Activate candidate", exact: true }).count(), 0);
    await capture(reviewer, "super-admin-training");
    assert.equal(await reviewer.getByRole("button", { name: "Refresh supporting models", exact: true }).count(), 0,
      "training uses one icon refresh control for both status and the supporting pool");
    await reviewer.getByRole("button", { name: "Refresh", exact: true }).click();
    await reviewer.getByText("Supporting model test", { exact: true }).waitFor();
    await current.getByText("Built-in model", { exact: true }).waitFor();
    assert.equal(training.state.active_job_id, null, "supports must not change the primary pointer");
    await reviewer.getByRole("button", { name: "How training works", exact: true }).click();
    await reviewer.getByText("Model generation: 1. Status updates every 10 seconds.", { exact: true }).waitFor();
    const modelCard = reviewer.getByTestId(`support-model-${trainingId}`);
    await modelCard.getByText("Quality checks passed · Ready for super-admin review", { exact: true }).waitFor();
    await modelCard.getByRole("button", { name: "Evaluation details", exact: true }).click();
    await modelCard.getByText("Candidate macro-F1: 0.750 · target 0.600", { exact: true }).waitFor();
    for (const label of ["Enable", "Disable", "Archive", "Restore to disabled", "Archive", "Delete from pool"]) {
      await modelCard.getByRole("button", { name: label, exact: true }).click();
      await reviewer.getByText("Confirm", { exact: true }).click();
      await reviewer.waitForFunction(() => !document.body.innerText.includes("Update supporting model pool?"));
    }
    await reviewer.getByText("No supporting models registered yet.", { exact: true }).waitFor();
    assert.deepEqual(trainingActions, ["queue", "queue"], "support lifecycle must never switch the primary through legacy actions");
    assert.deepEqual(poolActions, ["enable", "disable", "archive", "restore", "archive", "delete"]);
    for (let i = 0; i < 12; i++) poolModels.push({ id: randomUUID(), name: `Disabled history ${i + 1}`, status: "disabled", routing_policy: {}, datasets: [], metrics: {}, use_count: 0 });
    await reviewer.getByRole("button", { name: "Refresh", exact: true }).click();
    await reviewer.getByText("Disabled history 10", { exact: true }).waitFor();
    assert.equal(await reviewer.getByText("Disabled history 11", { exact: true }).count(), 0);
    await reviewer.getByRole("button", { name: "View more supporting models", exact: true }).click();
    await reviewer.getByText("Disabled history 12", { exact: true }).waitFor();
    await reviewer.getByRole("button", { name: "Refresh", exact: true }).click();
    await reviewer.getByText("Disabled history 12", { exact: true }).waitFor();
    await admin.getByRole("button", { name: "Refresh", exact: true }).click();
    await admin.getByText("Disabled history 1", { exact: true }).waitFor();
    assert.equal(await admin.getByRole("button", { name: "Archive", exact: true }).count(), 0);
    training.poolSummary = { queueSummaryVersion: 1, approvedExamples: 200, approvedDatasets: 2, newExamples: 180,
      readyToQueueExamples: 180, readyToQueueDatasets: 1,
      languages: {english:{total:180,negative:60,neutral:60,positive:60}},
      readyDatasets:[{id:randomUUID(),name:'Recently approved English examples',version:2,exampleCount:180,approvedAt:new Date().toISOString(),approvedBy:'Test Admin'}] };
    await reviewer.getByRole('button',{name:'Refresh',exact:true}).click();
    const readyPool = reviewer.getByTestId('ready-to-queue-pool');
    await readyPool.getByText('180',{exact:true}).waitFor();
    await readyPool.getByText('Recently approved English examples',{exact:true}).waitFor();
    const choose = readyPool.getByRole('checkbox',{name:'Train languages from Recently approved English examples',exact:true});
    await choose.click();
    assert.equal(await choose.getAttribute('aria-checked'),'true');
    assert.equal(await readyPool.getByText('200',{exact:true}).count(),0,'already-trained examples must not be displayed as ready to queue');
    training.poolSummary = {...training.poolSummary,newExamples:0,readyToQueueExamples:0,readyToQueueDatasets:0,languages:{},readyDatasets:[]};
    await reviewer.getByRole('button',{name:'Refresh',exact:true}).click();
    await readyPool.getByText('No newly approved datasets are waiting for training.',{exact:true}).waitFor();
    assert.equal(await readyPool.getByText('Recently approved English examples',{exact:true}).count(),0);
    await reviewer.setViewportSize({ width: 820, height: 1000 });
    const trainingPanel = reviewer.getByTestId("sentiment-training-jobs");
    assert.equal(await trainingPanel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true,
      "training cards and actions must wrap without horizontal overflow at tablet width");
    await capture(reviewer, "super-admin-training-narrow");
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
