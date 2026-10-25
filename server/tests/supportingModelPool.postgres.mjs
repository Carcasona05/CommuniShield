import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const actor = "10000000-0000-4000-8000-000000000001";
const ordinary = "10000000-0000-4000-8000-000000000002";
const names = ["sentiment_english.onnx", "sentiment_filipino.onnx", "sentiment_cebuano.onnx", "language_id.onnx"];
const hashes = Object.fromEntries(names.map((name) => [name, "a".repeat(64)]));
const state = async () => (await db.query("select * from public.sentiment_model_state")).rows[0];
const worker = async (action, job = null, payload = {}) => (await db.query("select public.sentiment_training_worker($1,$2,$3,$4) as result",
  [action, job?.id || null, job?.lease_token || null, JSON.stringify(payload)])).rows[0].result;
const enabledIds = async () => (await db.query("select id from public.sentiment_supporting_models where status='enabled' order by id")).rows.map((r) => r.id);
async function approve() {
  const text = randomUUID();
  const added = (await db.query("select public.manage_sentiment_dataset($1,'submit',$2) as result", [actor, JSON.stringify({
    name: "Pool fixture", source: "manual", privacy_reviewed: true,
    rows: [{ text, language: "cebuano", label: "positive", text_key: createHash("sha256").update(text).digest("hex") }],
  })])).rows[0].result;
  await db.query("select public.manage_sentiment_dataset($1,'approve',$2)", [actor, JSON.stringify({ dataset_id: added.id, version: 1 })]);
}
async function claim() {
  await db.exec("update public.sentiment_training_jobs set available_at=now()-interval '1 second' where status='queued'");
  return worker("claim", null, { pool_protocol: 1, worker_protocol: "supporting-pool-v2", builtin_hashes: hashes });
}
async function payload(job, valid = true, trainingMode = undefined) {
  const file = (name) => ({ path: `${job.id}/${job.lease_token}/${name}`, sha256: "b".repeat(64), size: 10 });
  const policy = { version: 1, passed: valid, builtin_hashes: hashes, evaluated_pool_ids: await enabledIds(), cascade_test: { passed: valid },
    languages: valid ? { cebuano: { primary_confidence: 0.65, primary_margin: 0.1, support_confidence: 0.7, support_margin: 0.1, validation_precision: 0.85, validation_support: 30 } } : {} };
  const metrics = { passed: true, pool_protocol: 1, routing_policy: policy };
  if (trainingMode !== undefined) metrics.training_mode = trainingMode;
  return { metrics, manifest: {
    files: Object.fromEntries(names.map((name) => [name, file(name)])),
    training_files: Object.fromEntries(["cebuano", "english", "filipino"].map((lang) => [`sentiment_${lang}.joblib`, file(`sentiment_${lang}.joblib`)])),
  } };
}
async function create(valid = true) {
  await approve(); const job = await claim(); await worker("evaluating", job); await worker("complete", job, await payload(job, valid)); return job;
}
async function manage(action, id, extra = {}, actorId = actor, generation = null) {
  const gen = generation ?? (await state()).generation;
  return db.query("select public.manage_sentiment_supporting_model($1,$2,$3,$4,$5)", [actorId, action, id, gen, JSON.stringify(extra)]);
}
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key, role text, status text, fullname text, user_name text);
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const [id, role] of [[actor, "super_admin"], [ordinary, "admin"]]) {
    await db.query("insert into auth.users values ($1)", [id]);
    await db.query("insert into public.profiles values ($1,$2,'Active','Test','test')", [id, role]);
  }
  for (const name of ["sentiment_datasets.sql", "sentiment_training_jobs.sql", "sentiment_continued_training.sql", "sentiment_supporting_pool.sql", "sentiment_supporting_pool.sql", "sentiment_fresh_candidates.sql"])
    await db.exec(await readFile(new URL(`../../DB_Schema/migrations/${name}`, import.meta.url), "utf8"));
});
beforeEach(async () => {
  await db.exec(`update public.sentiment_model_state set active_job_id=null,previous_job_id=null,generation=0,data_revision=0;
    delete from public.sentiment_supporting_models; delete from public.sentiment_training_events; delete from public.sentiment_training_jobs;
    delete from public.sentiment_dataset_events; delete from public.sentiment_training_samples; delete from public.sentiment_datasets;
    update public.sentiment_supporting_settings set max_enabled=3;`);
});
after(async () => db.close());

test("new supports coexist up to three and never replace the primary", async () => {
  const jobs = [];
  for (let i = 0; i < 4; i++) jobs.push(await create());
  assert.equal((await enabledIds()).length, 3);
  assert.equal((await db.query("select status from public.sentiment_supporting_models where id=$1", [jobs[3].id])).rows[0].status, "disabled");
  assert.equal((await state()).active_job_id, null);
  assert.equal((await state()).previous_job_id, null);
  await assert.rejects(db.query("select public.manage_sentiment_training($1,'activate',$2,0)", [actor, jobs[0].id]), { code: "22023" });
});
test("unverified fallback policies register disabled and cannot be enabled", async () => {
  const job = await create(false);
  await assert.rejects(manage("enable", job.id, { builtin_hashes: hashes }), { code: "22023" });
  assert.deepEqual(await enabledIds(), []);
});
test("disable invalidates dependent combinations; archive/delete are explicit and keep history", async () => {
  const first = await create(); const second = await create();
  await assert.rejects(manage("archive", first.id), { code: "22023" });
  await manage("disable", first.id);
  assert.deepEqual(await enabledIds(), []);
  await assert.rejects(manage("enable", second.id, { builtin_hashes: hashes }), { code: "22023" });
  await manage("archive", first.id); await manage("restore", first.id); await manage("archive", first.id);
  await manage("delete", first.id);
  const row = (await db.query("select status,artifact_manifest from public.sentiment_supporting_models where id=$1", [first.id])).rows[0];
  assert.equal(row.status, "deleted"); assert.ok(row.artifact_manifest.files);
  assert.equal((await db.query("select status from public.sentiment_training_jobs where id=$1", [first.id])).rows[0].status, "ready");
});
test("stale generations, wrong fingerprints and unauthorized actors are blocked", async () => {
  const job = await create(); const generation = (await state()).generation;
  await assert.rejects(manage("disable", job.id, {}, ordinary), { code: "42501" });
  await manage("disable", job.id);
  await assert.rejects(manage("enable", job.id, { builtin_hashes: hashes }, actor, generation), { code: "40001" });
  await assert.rejects(manage("enable", job.id, { builtin_hashes: {} }), { code: "22023" });
  await manage("enable", job.id, { builtin_hashes: hashes });
});
test("changing the pool fences off an in-progress evaluation and deletion waits for its references", async () => {
  const first = await create(); await approve(); const job = await claim();
  assert.equal(job.base_job_id, null); assert.equal(job.snapshot.supporting_models[0].id, first.id);
  await worker("evaluating", job); const result = await payload(job);
  await manage("disable", first.id); await manage("archive", first.id);
  await assert.rejects(manage("delete", first.id), { code: "22023" });
  await assert.rejects(worker("complete", job, result), { code: "40001" });
  assert.equal((await state()).active_job_id, null);
});
test("capabilities are read-only, limits are bounded, and browser roles cannot mutate", async () => {
  const capabilities = (await db.query("select public.sentiment_training_capabilities() as value")).rows[0].value;
  assert.equal(capabilities.supporting_pool, true);
  assert.equal(capabilities.fresh_candidates, true);
  await manage("set_limit", null, { limit: 2 });
  await assert.rejects(manage("set_limit", null, { limit: 4 }), { code: "22023" });
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await db.query("select has_function_privilege($1,'public.manage_sentiment_supporting_model(uuid,text,uuid,bigint,jsonb)','execute') as allowed", [role])).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege($1,'public.sentiment_training_worker_pool_legacy(text,uuid,uuid,jsonb)','execute') as allowed", [role])).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege($1,'public.enqueue_sentiment_training(text)','execute') as allowed", [role])).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege($1,'public.manage_sentiment_training(uuid,text,uuid,bigint,jsonb)','execute') as allowed", [role])).rows[0].allowed, false);
  }
});
test("fresh queue requests are explicit, upgrade-only, and reject unknown modes", async () => {
  await assert.rejects(db.query("select public.enqueue_sentiment_training('replace-built-in')"), { code: "22023" });
  await approve();
  const queued = async () => (await db.query("select id, training_mode from public.sentiment_training_jobs where status='queued'")).rows[0];
  const initial = await queued();
  assert.equal(initial.training_mode, "continue", "approval triggers keep queueing continued training by default");
  const upgraded = (await db.query("select public.enqueue_sentiment_training('fresh') as id")).rows[0].id;
  assert.equal(upgraded, initial.id, "an explicit fresh request must reuse the pending job, not fork the queue");
  assert.equal((await queued()).training_mode, "fresh");
  const coalesced = (await db.query("select public.enqueue_sentiment_training('continue') as id")).rows[0].id;
  assert.equal(coalesced, initial.id, "background approvals must coalesce onto the pending job");
  assert.equal((await queued()).training_mode, "fresh", "approvals never downgrade a pending fresh request");
  await approve();
  assert.equal((await queued()).training_mode, "fresh", "later approvals keep the pending fresh job");
});
test("claims require the updated worker and fresh completions must prove fresh training", async () => {
  await approve();
  await db.query("select public.enqueue_sentiment_training('fresh')");
  await db.exec("update public.sentiment_training_jobs set available_at=now()-interval '1 second' where status='queued'");
  await assert.rejects(worker("claim", null, { pool_protocol: 1, builtin_hashes: hashes }),
    { code: "22023", message: /fresh-candidate worker/i }, "an outdated pool-v1 worker must not claim fresh-capable queues");
  const job = await worker("claim", null, { pool_protocol: 1, worker_protocol: "supporting-pool-v2", builtin_hashes: hashes });
  assert.equal(job.training_mode, "fresh");
  await worker("evaluating", job);
  await assert.rejects(worker("complete", job, await payload(job, true)),
    { code: "22023" }, "fresh jobs cannot complete without fresh-training evidence");
  assert.deepEqual(await enabledIds(), []);
  assert.equal((await db.query("select status from public.sentiment_training_jobs where id=$1", [job.id])).rows[0].status, "evaluating");
  await worker("complete", job, await payload(job, true, "fresh"));
  assert.equal((await db.query("select status from public.sentiment_supporting_models where id=$1", [job.id])).rows[0].status, "enabled");
  assert.equal((await state()).active_job_id, null, "the built-in primary never moves");
  // Continue jobs accept absent evidence (older workers) but reject mismatches.
  await approve();
  const continued = await claim();
  assert.equal(continued.training_mode, "continue");
  await worker("evaluating", continued);
  await assert.rejects(worker("complete", continued, await payload(continued, true, "fresh")), { code: "22023" });
  await worker("complete", continued, await payload(continued, true, "continue"));
  assert.equal((await db.query("select status from public.sentiment_training_jobs where id=$1", [continued.id])).rows[0].status, "ready");
});
