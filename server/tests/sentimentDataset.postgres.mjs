// Optional real PostgreSQL (WASM) integration test. Install PGlite separately,
// then set PGLITE_MODULE to its dist/index.js and run node --test this file.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const actors = {
  admin: "10000000-0000-4000-8000-000000000001",
  other: "10000000-0000-4000-8000-000000000002",
  super: "10000000-0000-4000-8000-000000000003",
  user: "10000000-0000-4000-8000-000000000004",
  disabled: "10000000-0000-4000-8000-000000000005",
};
const sample = (text = "Maayo kaayo", label = "positive") => ({ text, language: "cebuano", label, text_key: createHash("sha256").update(`cebuano\0${text.toLowerCase()}`).digest("hex") });
let sequence = 0;
const mutate = async (actor, action, payload) => (await db.query("select public.manage_sentiment_dataset($1, $2, $3::jsonb) as result", [actor, action, JSON.stringify(payload)])).rows[0].result;
const submit = (rows = [sample(`Example ${++sequence}`)], actor = actors.admin) => mutate(actor, "submit", { name: "Test batch", source: "manual", rows, privacy_reviewed: true });

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.profiles (id uuid primary key references auth.users(id), role text, status text, fullname text, user_name text);
  `);
  for (const [kind, id] of Object.entries(actors)) {
    await db.query("insert into auth.users values ($1)", [id]);
    await db.query("insert into public.profiles values ($1,$2,$3,$4,$4)", [id, kind === "super" ? "super_admin" : kind === "user" ? "user" : "admin", kind === "disabled" ? "Disabled" : "Active", kind]);
  }
  const sql = await readFile(new URL("../../DB_Schema/migrations/sentiment_datasets.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(sql); // Deployment migration is safely repeatable.
});
after(async () => { await db.close(); });

test("submitted examples persist with actor identity and an audit event", async () => {
  const { id } = await submit();
  const { rows } = await db.query("select * from public.sentiment_datasets where id=$1", [id]);
  assert.equal(rows[0].status, "pending"); assert.equal(rows[0].created_by, actors.admin);
  assert.equal((await db.query("select * from public.sentiment_training_samples where dataset_id=$1", [id])).rows.length, 1);
  const events = (await db.query("select * from public.sentiment_dataset_events where dataset_id=$1", [id])).rows;
  assert.equal(events[0].action, "submitted"); assert.equal(events[0].details.privacy_reviewed, true);
});

test("only active admins can submit, and privacy attestation is required", async () => {
  for (const actor of [actors.user, actors.disabled, "10000000-0000-4000-8000-000000000099"]) await assert.rejects(submit(undefined, actor), { code: "42501" });
  await assert.rejects(mutate(actors.admin, "submit", { name: "No consent", source: "manual", rows: [sample()] }), { code: "22023" });
});

test("duplicate/conflicting batches roll back completely, without orphaned datasets", async () => {
  const existing = sample(`Duplicate ${++sequence}`);
  await submit([existing]);
  const before = (await db.query("select count(*) from public.sentiment_datasets")).rows[0].count;
  await assert.rejects(submit([sample(`Unique ${++sequence}`), { ...existing, label: "negative" }]), { code: "23505" });
  assert.equal((await db.query("select count(*) from public.sentiment_datasets")).rows[0].count, before);
});

test("concurrent submissions cannot both accept the same text/language", async () => {
  const same = sample(`Race ${++sequence}`);
  const result = await Promise.allSettled([submit([same]), submit([same], actors.other)]);
  assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(result.filter((item) => item.status === "rejected").length, 1);
});

test("pending edits enforce ownership, retain old values, and reject stale versions", async () => {
  const { id } = await submit();
  const original = (await db.query("select * from public.sentiment_training_samples where dataset_id=$1", [id])).rows[0];
  const payload = { dataset_id: id, sample_id: original.id, version: 1, sample: sample(`Edited ${++sequence}`, "neutral") };
  await assert.rejects(mutate(actors.other, "edit", payload), { code: "42501" });
  await mutate(actors.admin, "edit", payload);
  await assert.rejects(mutate(actors.admin, "edit", payload), { code: "40001" });
  const event = (await db.query("select * from public.sentiment_dataset_events where dataset_id=$1 and action='edited'", [id])).rows[0];
  assert.equal(event.details.before.text, original.text); assert.equal(event.details.after.label, "neutral");
});

test("super admins review; approval makes samples immutable and exportable", async () => {
  const { id } = await submit();
  await assert.rejects(mutate(actors.admin, "approve", { dataset_id: id, version: 1 }), { code: "42501" });
  await assert.rejects(mutate(actors.super, "reject", { dataset_id: id, version: 1, note: "" }), { code: "22023" });
  await mutate(actors.super, "approve", { dataset_id: id, version: 1, note: "Reviewed" });
  const row = (await db.query("select * from public.sentiment_training_samples where dataset_id=$1", [id])).rows[0];
  await assert.rejects(mutate(actors.super, "edit", { dataset_id: id, sample_id: row.id, version: 2, sample: sample("Change approved") }), { code: "22023" });
  await assert.rejects(mutate(actors.admin, "export", { dataset_id: id, version: 2, format: "json" }), { code: "42501" });
  const exported = await mutate(actors.super, "export", { dataset_id: id, version: 2, format: "json" });
  assert.equal(exported.version, 2); assert.equal(exported.samples[0].text, row.text);
  assert.equal((await db.query("select count(*) from public.sentiment_dataset_events where dataset_id=$1 and action='exported'", [id])).rows[0].count, 1);
  await assert.rejects(mutate(actors.admin, "archive", { dataset_id: id, version: 2 }), { code: "42501" });
  await mutate(actors.super, "archive", { dataset_id: id, version: 2 });
  assert.equal((await db.query("select active from public.sentiment_training_samples where id=$1", [row.id])).rows[0].active, false);
  await assert.rejects(mutate(actors.super, "export", { dataset_id: id, version: 3, format: "json" }), { code: "22023" });
});

test("rejected data retains history but no longer blocks corrected submissions", async () => {
  const example = sample(`Rejected ${++sequence}`);
  const { id } = await submit([example]);
  await mutate(actors.super, "reject", { dataset_id: id, version: 1, note: "Incorrect label" });
  await submit([{ ...example, label: "negative" }]);
  assert.equal((await db.query("select status from public.sentiment_datasets where id=$1", [id])).rows[0].status, "rejected");
});

test("anonymous/authenticated clients cannot bypass the API using tables or RPC", async () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await db.query("select has_function_privilege($1, 'public.manage_sentiment_dataset(uuid,text,jsonb)', 'execute') as allowed", [role])).rows[0].allowed, false);
    assert.equal((await db.query("select has_table_privilege($1, 'public.sentiment_training_samples', 'insert') as allowed", [role])).rows[0].allowed, false);
    assert.equal((await db.query("select has_table_privilege($1, 'public.sentiment_dataset_events', 'delete') as allowed", [role])).rows[0].allowed, false);
  }
});
