// Optional real PostgreSQL (WASM) integration test. Install PGlite separately,
// then set PGLITE_MODULE to its dist/index.js and run node --test this file.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();

const actor = "10000000-0000-4000-8000-000000000001";

before(async () => {
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${actor}');
    create table public.reports (
      id uuid primary key default gen_random_uuid(),
      status text not null default 'Pending Review'
        check (status in ('Pending Review','Under Verification','Resolved','Rejected','Archived','Marked Fake')),
      created_at timestamptz not null default now()
    );
    create table public.audit_logs (
      id uuid primary key default gen_random_uuid(),
      actor_id uuid references auth.users(id) on delete set null,
      actor_name text not null default '',
      action_type text not null
        check (action_type in (
          'Report Verified',
          'Report Mapped',
          'Report Rejected',
          'Report Deleted',
          'AI Analysis Completed',
          'Admin Added',
          'Admin Updated',
          'Admin Disabled',
          'Admin Deleted',
          'System Settings Updated',
          'Announcement Created',
          'Notification Sent'
        )),
      title text not null default '',
      details text not null default '',
      report_id uuid references public.reports(id) on delete set null,
      old_value text,
      new_value text,
      created_at timestamptz not null default now()
    );
  `);
  const sql = await readFile(new URL("../../DB_Schema/migrations/report_archiving.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(sql); // Deployment migration is safely repeatable.
});
after(async () => { await db.close(); });

const insertLog = (actionType) =>
  db.query(
    "insert into public.audit_logs (actor_id, actor_name, action_type, title) values ($1, 'Admin', $2, 'Archived') returning id",
    [actor, actionType]
  );

test("the migration accepts the Report Archived audit action", async () => {
  const { rows } = await insertLog("Report Archived");
  assert.equal(rows.length, 1);
});

test("unknown audit actions are still rejected", async () => {
  for (const action of ["Report Frobnicated", "archived", ""]) {
    await assert.rejects(insertLog(action), { code: "23514" });
  }
});

test("archived reports remain a legal report status", async () => {
  const { rows } = await db.query(
    "insert into public.reports (status) values ('Archived') returning status"
  );
  assert.equal(rows[0].status, "Archived");
  await assert.rejects(
    db.query("insert into public.reports (status) values ('Archivedd')"),
    { code: "23514" }
  );
});

test("the archived lookup index exists", async () => {
  const { rows } = await db.query(
    "select indexname from pg_indexes where tablename = 'reports' and indexname = 'reports_archived_status'"
  );
  assert.equal(rows.length, 1);
});
