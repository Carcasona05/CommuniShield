import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const admin = "10000000-0000-4000-8000-000000000001";
const reviewer = "10000000-0000-4000-8000-000000000002";
const fields = ["sentiment_english.onnx", "sentiment_filipino.onnx", "sentiment_cebuano.onnx", "language_id.onnx"];
const rpc = async (name, args) => {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(",");
  return (await db.query(`select public.${name}(${placeholders}) as result`, args)).rows[0].result;
};
const mutate = (actor, action, payload) => rpc("manage_sentiment_dataset", [actor, action, JSON.stringify(payload)]);
const worker = (action, job = null, payload = {}, lease = job?.lease_token) => rpc("sentiment_training_worker", [action, job?.id || null, lease || null, JSON.stringify(payload)]);
const manage = (action, job = null, generation = null, actor = reviewer) => rpc("manage_sentiment_training", [actor, action, job, generation]);
async function submit(text = randomUUID()) {
  return (await mutate(admin, "submit", { name: "Test", source: "manual", privacy_reviewed: true, rows: [{ text, language: "english", label: "positive", text_key: createHash("sha256").update(text).digest("hex") }] })).id;
}
const approve = (id) => mutate(reviewer, "approve", { dataset_id: id, version: 1 });
async function claim() {
  await db.exec("update public.sentiment_training_jobs set available_at = now() - interval '1 second' where status='queued'");
  return worker("claim");
}
function manifest(job) {
  return { files: Object.fromEntries(fields.map((name) => [name, { path: `${job.id}/${job.lease_token}/${name}`, size: 1, sha256: "a".repeat(64) }])) };
}
async function ready(job) {
  await worker("evaluating", job);
  await worker("complete", job, { manifest: manifest(job), metrics: { passed: true } });
}

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key, role text, status text, fullname text, user_name text);
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  `);
  for (const [id, role] of [[admin, "admin"], [reviewer, "super_admin"]]) {
    await db.query("insert into auth.users values ($1)", [id]);
    await db.query("insert into public.profiles values ($1,$2,'Active','Test','Test')", [id, role]);
  }
  await db.exec(await readFile(new URL("../../DB_Schema/migrations/sentiment_datasets.sql", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../../DB_Schema/migrations/sentiment_training_jobs.sql", import.meta.url), "utf8");
  await db.exec(migration); await db.exec(migration);
});
beforeEach(async () => {
  await db.exec(`update public.sentiment_model_state set active_job_id=null, previous_job_id=null, generation=0, data_revision=0;
    delete from public.sentiment_training_events; delete from public.sentiment_training_jobs;
    delete from public.sentiment_dataset_events; delete from public.sentiment_training_samples; delete from public.sentiment_datasets;`);
});
after(async () => db.close());

test("approval atomically enqueues and coalesces, while pending/rejected data does not train", async () => {
  const first = await submit(); const second = await submit(); const third = await submit();
  assert.equal((await db.query("select count(*) from public.sentiment_training_jobs")).rows[0].count, 0);
  await approve(first); await approve(second);
  await mutate(reviewer, "reject", { dataset_id: third, version: 1, note: "Wrong label" });
  assert.equal((await db.query("select count(*) from public.sentiment_training_jobs where status='queued'")).rows[0].count, 1);
  const job = await claim();
  assert.equal(job.snapshot.samples.length, 2);
  assert.deepEqual(job.snapshot.datasets.map((item) => item.id).sort(), [first, second].sort());
  assert.equal(job.snapshot.datasets[0].version, 2);
  assert.equal(job.data_revision, 2);
  assert.equal(job.base_generation, 0);
});

test("one worker at a time; approvals during training become a later immutable snapshot", async () => {
  await approve(await submit());
  const job = await claim();
  await approve(await submit());
  assert.equal(await claim(), null);
  assert.equal(job.snapshot.samples.length, 1);
  await worker("fail", job, { error: "Test failure" });
  const next = await claim();
  assert.equal(next.snapshot.samples.length, 2);
});

test("expired leases fail safely and stale workers cannot complete", async () => {
  await approve(await submit());
  const old = await claim();
  await approve(await submit());
  await db.query("update public.sentiment_training_jobs set lease_until=now()-interval '1 second' where id=$1", [old.id]);
  const next = await claim();
  assert.notEqual(next.id, old.id);
  await assert.rejects(worker("heartbeat", old), { code: "40001" });
  assert.equal((await db.query("select status from public.sentiment_training_jobs where id=$1", [old.id])).rows[0].status, "failed");
  assert.equal((await db.query("select active_job_id from public.sentiment_model_state")).rows[0].active_job_id, null);
});

test("failed evaluations and incomplete manifests cannot become ready", async () => {
  await approve(await submit()); const job = await claim();
  await assert.rejects(worker("complete", job, { manifest: manifest(job), metrics: { passed: true } }), { code: "22023" });
  await worker("evaluating", job);
  await assert.rejects(worker("complete", job, { manifest: manifest(job), metrics: { passed: false } }), { code: "22023" });
  const incomplete = manifest(job); delete incomplete.files[fields[0]].sha256;
  await assert.rejects(worker("complete", job, { manifest: incomplete, metrics: { passed: true } }), { code: "22023" });
  await worker("fail", job, { error: "Evaluation failed", metrics: { passed: false } });
  await assert.rejects(manage("activate", job.id, 0), { code: "22023" });
});

test("passing candidates need manual super-admin activation and support rollback", async () => {
  await approve(await submit()); const job = await claim(); await ready(job);
  assert.equal((await db.query("select active_job_id from public.sentiment_model_state")).rows[0].active_job_id, null);
  await assert.rejects(manage("activate", job.id, 0, admin), { code: "42501" });
  await manage("activate", job.id, 0);
  let state = (await db.query("select * from public.sentiment_model_state")).rows[0];
  assert.equal(state.active_job_id, job.id); assert.equal(state.generation, 1);
  await assert.rejects(manage("rollback", null, 0), { code: "40001" });
  await manage("rollback", null, 1);
  state = (await db.query("select * from public.sentiment_model_state")).rows[0];
  assert.equal(state.active_job_id, null); assert.equal(state.previous_job_id, job.id); assert.equal(state.generation, 2);
});

test("archiving approved data automatically queues replacement and invalidates old candidates", async () => {
  const dataset = await submit(); await approve(dataset); const job = await claim(); await ready(job);
  await mutate(reviewer, "archive", { dataset_id: dataset, version: 2 });
  await assert.rejects(manage("activate", job.id, 0), { code: "40001" });
  const next = await claim(); assert.equal(next.snapshot.samples.length, 0);
});

test("worker RPC, private snapshots, and model bucket are unavailable to browser roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    for (const signature of ["public.sentiment_training_worker(text,uuid,uuid,jsonb)", "public.manage_sentiment_training(uuid,text,uuid,bigint)", "public.enqueue_sentiment_training()"]) {
      assert.equal((await db.query("select has_function_privilege($1,$2,'execute') as allowed", [role, signature])).rows[0].allowed, false);
    }
    assert.equal((await db.query("select has_table_privilege($1,'public.sentiment_training_jobs','select') as allowed", [role])).rows[0].allowed, false);
  }
  assert.equal((await db.query("select public from storage.buckets where id='sentiment-models'")).rows[0].public, false);
});

test("upgrading queues previously approved datasets once without activating them", async () => {
  await db.exec("drop trigger sentiment_dataset_approval_training on public.sentiment_datasets");
  await approve(await submit());
  const migration = await readFile(new URL("../../DB_Schema/migrations/sentiment_training_jobs.sql", import.meta.url), "utf8");
  await db.exec(migration); await db.exec(migration);
  assert.equal((await db.query("select count(*) from public.sentiment_training_jobs where status='queued'")).rows[0].count, 1);
  const job = await claim(); assert.equal(job.snapshot.samples.length, 1);
  assert.equal((await db.query("select active_job_id from public.sentiment_model_state")).rows[0].active_job_id, null);
});
