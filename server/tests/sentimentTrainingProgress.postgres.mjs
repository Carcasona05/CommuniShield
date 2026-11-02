// Isolated PostgreSQL only. Never reads credentials or connects to live data.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, beforeEach, after, test } from "node:test";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const id = "10000000-0000-4000-8000-000000000001";
const lease = "20000000-0000-4000-8000-000000000001";
const migration = await readFile(new URL("../../DB_Schema/migrations/sentiment_training_progress.sql", import.meta.url), "utf8");
const report = async (sequence = 1, completed = 1, total = 5, stage = "fitting", token = lease) => (await db.query(
  "select public.report_sentiment_training_progress($1,$2,$3,$4,$5,$6,'cebuano') as result",
  [id, token, sequence, completed, total, stage])).rows[0].result;
const read = async () => (await db.query("select public.get_sentiment_training_progress($1::uuid[]) as result", [[id]])).rows[0].result;
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.sentiment_training_jobs(id uuid primary key,status text,lease_token uuid,lease_until timestamptz);`);
  await db.exec(migration);
  await db.exec(migration);
});
beforeEach(async () => {
  await db.exec("delete from public.sentiment_training_jobs");
  await db.query("insert into public.sentiment_training_jobs(id,status,lease_token,lease_until) values($1,'training',$2,now()+interval '5 minutes')", [id, lease]);
});
after(async () => db.close());

test("lease-checked progress is monotonic, bounded and contains no worker secrets", async () => {
  await report();
  await report(2, 1.5);
  const rows = await read();
  assert.equal(rows[0].progress.completed, 1.5);
  assert.equal(rows[0].progress.total, 5);
  assert.equal(rows[0].progress.language, "cebuano");
  assert.ok(rows[0].progress.updatedAt);
  assert.ok(!JSON.stringify(rows).includes(lease));
  await assert.rejects(report(2, 2), /backwards/);
  await assert.rejects(report(3, 1), /backwards/);
  await assert.rejects(report(3, 2, 6), /backwards/);
  for (const completed of [-1, 5, "NaN", "Infinity"]) await assert.rejects(report(3, completed), /Invalid training progress/);
  await assert.rejects(report(3, 2, 5, "private sample text"), /Invalid training progress/);
});

test("expired/wrong leases and terminal jobs cannot publish more progress", async () => {
  await assert.rejects(report(1, 1, 5, "fitting", id), /lease/);
  await db.exec("update public.sentiment_training_jobs set lease_until=now()-interval '1 minute'");
  await assert.rejects(report(), /lease/);
  for (const status of ["ready", "failed", "queued"]) {
    await db.query("update public.sentiment_training_jobs set status=$1,lease_until=now()+interval '5 minutes'", [status]);
    await assert.rejects(report(), /lease/);
  }
});

test("reclaimed jobs hide previous-lease progress and restart counting safely", async () => {
  await report(9, 4);
  await db.query("update public.sentiment_training_jobs set lease_token=$1", [id]);
  assert.equal((await read())[0].progress, null);
  await report(1, 0, 5, "preparing", id);
  assert.equal((await read())[0].progress.completed, 0);
});

test("only service_role can write or read progress RPCs", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(report(), /permission denied/);
      await assert.rejects(read(), /permission denied/);
    } finally { await db.exec("reset role"); }
  }
  await db.exec("set role service_role");
  try { await report(); assert.equal((await read())[0].id, id); }
  finally { await db.exec("reset role"); }
});
