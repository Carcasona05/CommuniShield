import "dotenv/config";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { DatasetInputError, DATASET_LIMITS, parseDatasetCsv, readDatasetInput, samplesToCsv, validateDatasetRows } from "./services/sentimentDatasetValidation.js";
import { sentimentDatasetService as service } from "./services/sentimentDatasetService.js";
import { editDatasetSample, exportDataset, getDataset, listDatasets, previewDataset, reviewDataset, submitDataset } from "./controllers/sentimentDatasetController.js";
import app from "../api/index.js";
import { supabase } from "./config/supabase.js";
import { profileService } from "./services/authService.js";
import { loginVerificationService } from "./services/loginVerificationService.js";
import type { AddressInfo } from "node:net";
import { sentimentTrainingService } from "./services/sentimentTrainingService.js";

const good = { text: "Maayo kaayo ang serbisyo", language: "cebuano", label: "positive" };
beforeEach((t) => { if ("mock" in t) t.mock.method(service, "trainingReady", async () => true); });
const id = "10000000-0000-4000-8000-000000000001";
const req = (body: unknown = {}, extra = {}) => ({ user: { id } as User, body, params: { id, sampleId: id }, query: {}, ...extra }) as unknown as Request & { user: User };
const response = () => {
  const result = { status: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    status(code: number) { result.status = code; return res; },
    json(body: unknown) { result.body = body; return res; },
    send(body: unknown) { result.body = body; return res; },
    setHeader(key: string, value: string) { result.headers[key] = value; return res; },
  } as Response;
  return { res, result };
};

test("CSV handles BOM, CRLF, reordered headers, commas, escaped quotes, and multiline text", () => {
  assert.deepEqual(parseDatasetCsv('\uFEFFlabel,text,language\r\npositive,"Maayo, ""salamat""\nkaayo",cebuano\r\n'), [{ text: 'Maayo, "salamat"\nkaayo', language: "cebuano", label: "positive" }]);
  assert.equal(parseDatasetCsv("text,language,label\n\nhello,english,neutral\n").length, 1);
});

test("CSV rejects broken quoting, extra/missing columns, duplicate headers, and unsupported headers", () => {
  for (const csv of [
    'text,language,label\n"hello,english,positive', 'text,language,label\n"hello"bad,english,positive',
    'text,language,label\nhel"lo,english,positive', "text,language,label\nhello,english", "text,language,label\nhello,english,positive,extra",
    "text,text,label\nhello,english,positive", "text,language,label,split\nhello,english,positive,train",
  ]) assert.throws(() => parseDatasetCsv(csv), DatasetInputError);
});

test("input limits reject empty uploads, too many rows, huge files, and competing formats", () => {
  for (const body of [null, [], {}, { rows: [] }, { rows: Array(1001).fill(good) }, { csv: "text,language,label", rows: [good] }]) assert.throws(() => readDatasetInput(body), DatasetInputError);
  assert.throws(() => parseDatasetCsv("a".repeat(DATASET_LIMITS.bytes + 1)), DatasetInputError);
});

test("examples require supported labels and languages; text is normalized consistently", () => {
  assert.equal(validateDatasetRows([good])[0]!.status, "valid");
  for (const row of [{ ...good, text: " " }, { ...good, text: "a\0b" }, { ...good, text: "a".repeat(2001) }, { ...good, language: "unknown" }, { ...good, label: "mixed" }, { ...good, role: "admin" }, null]) assert.equal(validateDatasetRows([row])[0]!.status, "invalid");
  const rows = validateDatasetRows([{ text: "  MAAYO\n KAAYO  ", language: " Cebuano ", label: " POSITIVE " }, { text: "maayo kaayo", language: "cebuano", label: "positive" }]);
  assert.equal(rows[0]!.text, "MAAYO KAAYO");
  assert.equal(rows[0]!.text_key, rows[1]!.text_key);
  assert.equal(rows[1]!.status, "duplicate");
});

test("conflicting upload labels flag every occurrence, not just the later row", () => {
  const rows = validateDatasetRows([good, { ...good, label: "negative" }]);
  assert.deepEqual(rows.map((row) => row.status), ["conflict", "conflict"]);
  assert.equal(validateDatasetRows([good], [{ text_key: rows[0]!.text_key, label: "negative" }])[0]!.status, "conflict");
  assert.equal(validateDatasetRows([good], [{ text_key: rows[0]!.text_key, label: "positive" }])[0]!.status, "duplicate");
  assert.notEqual(validateDatasetRows([good])[0]!.text_key, validateDatasetRows([{ ...good, language: "filipino" }])[0]!.text_key);
});

test("review CSV quotes content and neutralizes spreadsheet formulas", () => {
  const csv = samplesToCsv([{ text: '=HYPERLINK("bad")', language: "english", label: "negative" }]);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
  assert.equal(parseDatasetCsv(samplesToCsv([good]))[0]!.text, good.text);
});

test("every dataset handler rejects unauthenticated calls", async () => {
  for (const handler of [previewDataset, submitDataset, listDatasets, getDataset, editDatasetSample, reviewDataset, exportDataset]) {
    const { res, result } = response();
    await handler({} as Request, res);
    assert.equal(result.status, 401);
  }
});

test("preview validates on the server and returns invalid rows without writes", async (t) => {
  t.mock.method(service, "preview", async (rows: unknown[]) => ({ data: validateDatasetRows(rows), error: null }));
  const write = t.mock.method(service, "mutate", async () => { throw new Error("must not write"); });
  const { res, result } = response();
  await previewDataset(req({ rows: [good, { ...good, language: "invalid" }] }), res);
  assert.equal(result.status, 200);
  assert.equal((result.body as { validCount: number }).validCount, 1);
  assert.equal(write.mock.callCount(), 0);
});

test("submit requires privacy review and revalidates duplicates instead of trusting a preview", async (t) => {
  const preview = t.mock.method(service, "preview", async () => ({ data: [{ ...validateDatasetRows([good])[0]!, status: "duplicate" as const }], error: null }));
  const mutate = t.mock.method(service, "mutate", async () => { throw new Error("must not write"); });
  const first = response();
  await submitDataset(req({ name: "test", source: "manual", rows: [good] }), first.res);
  assert.equal(first.result.status, 400);
  assert.equal(preview.mock.callCount(), 0);
  const second = response();
  await submitDataset(req({ name: "test", source: "csv", rows: [good], privacy_reviewed: true }), second.res);
  assert.equal(second.result.status, 409);
  assert.equal(mutate.mock.callCount(), 0);
});

test("submit uses authenticated actor and strips client metadata before an atomic transaction", async (t) => {
  t.mock.method(service, "preview", async (rows: unknown[]) => ({ data: validateDatasetRows(rows), error: null }));
  t.mock.method(service, "mutate", async (actor: string, action: string, payload: Record<string, unknown>) => {
    assert.equal(actor, id); assert.equal(action, "submit");
    assert.equal(payload.name, "local examples"); assert.equal(payload.status, undefined);
    assert.equal((payload.rows as { text: string }[])[0]!.text, good.text);
    return { data: { id }, error: null };
  });
  const { res, result } = response();
  await submitDataset(req({ name: " local examples ", source: "manual", rows: [good], privacy_reviewed: true, created_by: "forged", status: "approved" }), res);
  assert.equal(result.status, 201);
});

test("transaction permissions, stale versions, and concurrent duplicates surface correctly", async (t) => {
  for (const [code, expected] of [["42501", 403], ["40001", 409], ["23505", 409], ["P0002", 404]]) {
    const mock = t.mock.method(service, "mutate", async () => ({ data: null, error: { code } }));
    const { res, result } = response();
    await reviewDataset(req({ action: "approve", version: 1 }), res);
    assert.equal(result.status, expected);
    mock.mock.restore();
  }
});

test("reviews require valid versions and rejection reasons", async (t) => {
  const write = t.mock.method(service, "mutate", async () => { throw new Error("must not write"); });
  for (const body of [{ action: "reject", version: 1 }, { action: "approve" }, { action: "include", version: 1 }, { action: "approve", version: -1 }, { action: "archive", version: 1, note: "a".repeat(1001) }]) {
    const { res, result } = response(); await reviewDataset(req(body), res); assert.equal(result.status, 400);
  }
  assert.equal(write.mock.callCount(), 0);
});

test("approval without the training migration fails without changing the dataset", async (t) => {
  t.mock.method(service, "trainingReady", async () => false);
  const mutate = t.mock.method(service, "mutate", async () => { throw new Error("must not approve"); });
  const { res, result } = response();
  await reviewDataset(req({ action: "approve", version: 1 }), res);
  assert.equal(result.status, 503);
  assert.equal(mutate.mock.callCount(), 0);
});

test("pending edits validate all fields and pass the version for optimistic locking", async (t) => {
  t.mock.method(service, "preview", async (rows: unknown[], exclude: string) => { assert.equal(exclude, id); return { data: validateDatasetRows(rows), error: null }; });
  t.mock.method(service, "mutate", async (actor: string, action: string, payload: Record<string, unknown>) => {
    assert.equal(actor, id); assert.equal(action, "edit"); assert.equal(payload.version, 3);
    return { data: { id }, error: null };
  });
  const { res, result } = response(); await editDatasetSample(req({ version: 3, sample: good }), res); assert.equal(result.status, 200);
});

test("dataset listing validates status/page and identifies the current viewer", async (t) => {
  t.mock.method(service, "list", async (status: string, page: number) => { assert.equal(status, "pending"); assert.equal(page, 2); return { data: [], error: null, count: 15 }; });
  const { res, result } = response(); await listDatasets(req({}, { query: { status: "pending", page: "2" } }), res);
  assert.equal((result.body as { viewerId: string }).viewerId, id);
  const bad = response(); await listDatasets(req({}, { query: { page: "-1" } }), bad.res); assert.equal(bad.result.status, 400);
});

test("training JSON export preserves exact text, CSV is review-safe, and pending export is blocked", async (t) => {
  const sample = { ...good, text: "=a literal expression" };
  const exportMock = t.mock.method(service, "export", async () => ({ data: { samples: [sample], version: 1, dataset_id: id }, error: null }));
  const json = response(); await exportDataset(req({}, { query: { format: "json" } }), json.res);
  assert.equal((json.result.body as { samples: { text: string }[] }).samples[0]!.text, sample.text);
  const csv = response(); await exportDataset(req(), csv.res); assert.match(String(csv.result.body), /'=a literal expression/);
  exportMock.mock.restore();
  t.mock.method(service, "export", async () => ({ data: null, error: null, unavailable: true }));
  const blocked = response(); await exportDataset(req(), blocked.res); assert.equal(blocked.result.status, 409);
});

test("real routes reject regular users and prevent admin training export", async (t) => {
  let role = "user";
  t.mock.method(supabase.auth, "getUser", async () => ({ data: { user: { id } }, error: null }));
  t.mock.method(loginVerificationService, "sessionApproved", async () => true);
  t.mock.method(profileService, "getProfile", async () => ({ data: { role, status: "Active" }, error: null }));
  const list = t.mock.method(service, "list", async () => ({ data: [], error: null, count: 0 }));
  t.mock.method(sentimentTrainingService, "status", async () => ({ data: { jobs: [], state: { generation: 0 }, registryEnabled: false }, error: null }));
  const trainingAction = t.mock.method(sentimentTrainingService, "action", async (actor: string, action: string) => { assert.equal(actor, id); assert.equal(action, "queue"); return { data: { job_id: id }, error: null }; });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { Authorization: "Bearer test-only-token" };
  assert.equal((await fetch(`${base}/api/sentiment/datasets`, { headers })).status, 403);
  assert.equal((await fetch(`${base}/api/sentiment/training`, { headers })).status, 403);
  assert.equal(list.mock.callCount(), 0);
  role = "admin";
  assert.equal((await fetch(`${base}/api/sentiment/datasets`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/api/sentiment/training`, { headers })).status, 200);
  const queue = () => fetch(`${base}/api/sentiment/training`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", actor: "forged" }) });
  assert.equal((await queue()).status, 403);
  assert.equal(trainingAction.mock.callCount(), 0);
  assert.equal((await fetch(`${base}/api/sentiment/datasets/${id}/export`, { headers })).status, 403);
  role = "super_admin";
  assert.equal((await queue()).status, 200);
  assert.equal(trainingAction.mock.callCount(), 1);
});
