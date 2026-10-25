// Runs migrations against an isolated in-memory PostgreSQL, never live data.
import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const actor = "10000000-0000-4000-8000-000000000001";
const worker = async (action, job = null, payload = {}) => (await db.query(
  "select public.sentiment_training_worker($1,$2,$3,$4) as result",
  [action, job?.id || null, job?.lease_token || null, JSON.stringify(payload)])).rows[0].result;
async function approve() {
  const text = randomUUID();
  const result = (await db.query("select public.manage_sentiment_dataset($1,'submit',$2) as result", [actor,
    JSON.stringify({ name: "Test", source: "manual", privacy_reviewed: true,
      rows: [{ text, language: "cebuano", label: "positive", text_key: createHash("sha256").update(text).digest("hex") }] })])).rows[0].result;
  await db.query("select public.manage_sentiment_dataset($1,'approve',$2)", [actor, JSON.stringify({ dataset_id: result.id, version: 1 })]);
}
async function claim() {
  await db.exec("update public.sentiment_training_jobs set available_at=now()-interval '1 second' where status='queued'");
  return worker("claim");
}
function payload(job) {
  const entry = (name) => ({ path: `${job.id}/${job.lease_token}/${name}`, sha256: "a".repeat(64), size: 10 });
  return { metrics: { passed: true, training: { mode: "continued" } }, manifest: {
    files: Object.fromEntries(["sentiment_cebuano.onnx", "sentiment_english.onnx", "sentiment_filipino.onnx", "language_id.onnx"].map((n) => [n, entry(n)])),
    training_files: Object.fromEntries(["sentiment_cebuano.joblib", "sentiment_english.joblib", "sentiment_filipino.joblib"].map((n) => [n, entry(n)])),
  } };
}
const state = async () => (await db.query("select * from public.sentiment_model_state")).rows[0];
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key, role text, status text, fullname text, user_name text);
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
  await db.query("insert into auth.users values ($1)", [actor]);
  await db.query("insert into public.profiles values ($1,'super_admin','Active','Test','test')", [actor]);
  for (const file of ["sentiment_datasets.sql", "sentiment_training_jobs.sql", "sentiment_continued_training.sql", "sentiment_continued_training.sql"]) {
    await db.exec(await readFile(new URL(`../../DB_Schema/migrations/${file}`, import.meta.url), "utf8"));
  }
});
beforeEach(async () => {
  await db.exec(`update public.sentiment_model_state set active_job_id=null, previous_job_id=null, generation=0, data_revision=0;
    delete from public.sentiment_training_events; delete from public.sentiment_training_jobs;
    delete from public.sentiment_dataset_events; delete from public.sentiment_training_samples; delete from public.sentiment_datasets;`);
});
after(async () => db.close());

test("only a complete passing continued update atomically activates and supports rollback", async () => {
  assert.deepEqual((await db.query("select public.sentiment_training_capabilities() as result")).rows[0].result,
    { continued_training: true, automatic_activation: true });
  await approve(); const job = await claim();
  await worker("evaluating", job);
  assert.equal((await worker("complete", job, payload(job))).auto_activated, true);
  assert.equal((await state()).active_job_id, job.id);
  assert.equal((await state()).generation, 1);
  assert.equal((await db.query("select count(*) from public.sentiment_training_events where action='auto_activate'")).rows[0].count, 1);
  await db.query("select public.manage_sentiment_training($1,'rollback',null,1)", [actor]);
  assert.equal((await state()).active_job_id, null);
  assert.equal((await state()).previous_job_id, job.id);
  assert.equal((await state()).generation, 2);
});

test("failed checks, legacy cold training and missing state never activate", async () => {
  await approve(); const job = await claim(); await worker("evaluating", job);
  const failed = payload(job); failed.metrics.passed = false;
  await assert.rejects(worker("complete", job, failed), { code: "22023" });
  const legacy = payload(job); delete legacy.metrics.training;
  await assert.rejects(worker("complete", job, legacy), { code: "22023" });
  const missing = payload(job); delete missing.manifest.training_files["sentiment_cebuano.joblib"];
  await assert.rejects(worker("complete", job, missing), { code: "22023" });
  const badPath = payload(job); badPath.manifest.training_files["sentiment_cebuano.joblib"].path = "../untrusted.joblib";
  await assert.rejects(worker("complete", job, badPath), { code: "22023" });
  assert.equal((await state()).active_job_id, null);
  assert.equal((await state()).generation, 0);
});

test("new approval during evaluation fences off stale auto-activation", async () => {
  await approve(); const job = await claim(); await worker("evaluating", job);
  await approve();
  await assert.rejects(worker("complete", job, payload(job)), { code: "40001" });
  assert.equal((await state()).active_job_id, null);
  assert.equal((await state()).generation, 0);
  await worker("fail", job, { error: "Stale result" });
  const next = await claim(); assert.equal(next.snapshot.samples.length, 2);
});

test("generation changes and expired leases cannot publish", async () => {
  await approve(); const job = await claim(); await worker("evaluating", job);
  await db.exec("update public.sentiment_model_state set generation=1");
  await assert.rejects(worker("complete", job, payload(job)), { code: "40001" });
  await db.query("update public.sentiment_training_jobs set lease_until=now()-interval '1 second' where id=$1", [job.id]);
  await assert.rejects(worker("complete", job, payload(job)), { code: "40001" });
  assert.equal((await state()).active_job_id, null);
});

test("subsequent jobs continue the active lineage and preserve previous pointer", async () => {
  await approve(); const first = await claim(); await worker("evaluating", first); await worker("complete", first, payload(first));
  await approve(); const second = await claim();
  assert.equal(second.base_job_id, first.id); assert.equal(second.base_generation, 1);
  await worker("evaluating", second); await worker("complete", second, payload(second));
  assert.equal((await state()).active_job_id, second.id);
  assert.equal((await state()).previous_job_id, first.id);
  assert.equal((await state()).generation, 2);
});

test("automatic activation protocol remains inaccessible to browser roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    const result = await db.query("select has_function_privilege($1,'public.sentiment_training_worker(text,uuid,uuid,jsonb)','execute') as allowed", [role]);
    assert.equal(result.rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege($1,'public.sentiment_training_capabilities()','execute') as allowed", [role])).rows[0].allowed, false);
  }
});

test("read-only probes detect a legacy worker without triggering lease errors", async () => {
  const original = await readFile(new URL("../../DB_Schema/migrations/sentiment_training_jobs.sql", import.meta.url), "utf8");
  const updated = await readFile(new URL("../../DB_Schema/migrations/sentiment_continued_training.sql", import.meta.url), "utf8");
  try {
    await db.exec(original);
    assert.deepEqual((await db.query("select public.sentiment_training_capabilities() as result")).rows[0].result,
      { continued_training: false, automatic_activation: false });
    assert.equal((await db.query("select count(*) from public.sentiment_training_jobs")).rows[0].count, 0);
  } finally {
    await db.exec(updated);
  }
});
