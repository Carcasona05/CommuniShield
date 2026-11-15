import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.v;
const save = (report, status, verified = null) => scalar("select save_admin_report_status($1,$2,'Ada',$3,$4) v", [id(report), id(900), status, verified]);
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
    create table profiles(id uuid primary key,role text,status text);
    insert into profiles values('${id(900)}','admin','Active'),('${id(901)}','user','Active');
    create table incident_types(id uuid primary key,name text);
    insert into incident_types values('${id(800)}','Theft');
    create table reports(id uuid primary key,user_id uuid,incident_type_id uuid,location text,status text,is_verified boolean,
      created_at timestamptz default now(),latitude numeric,longitude numeric,
      constraint reports_status_check check(status in ('Pending Review','Under Verification','Resolved','Rejected','Archived','Marked Fake')));
    insert into reports(id,user_id,incident_type_id,location,status,is_verified,latitude,longitude) values
      ('${id(1)}','${id(901)}','${id(800)}','Lamacan','Pending Review',false,9.88,123.59),
      ('${id(2)}',null,'${id(800)}','Tulic','Pending Review',false,9.88,123.59),
      ('${id(3)}',null,'${id(800)}','Tulic','Resolved',false,9.88,123.59);
    create table report_validations(id uuid primary key,action text constraint report_validations_action_check check(action in ('Under Verification','Resolved','Rejected','Archived','Marked Fake')));
    create table report_credibility_analysis(report_id uuid,severity text);
    create table report_comments(id uuid primary key,report_id uuid);
    create table audit_logs(id uuid primary key default gen_random_uuid(),actor_id uuid,actor_name text,action_type text,title text,details text,report_id uuid,old_value text,new_value text);
    create table user_credibility(user_id uuid primary key,score numeric);
    insert into user_credibility values('${id(901)}',50);
    create table credibility_events(id uuid default gen_random_uuid(),user_id uuid not null,event_type text,points numeric,reason text,report_id uuid);
    create table credibility_report_effects(report_id uuid,user_id uuid,event_type text,applied numeric,active boolean,corrected boolean default false,primary key(report_id,event_type));
    create function refresh_credibility_suspension(uuid) returns void language plpgsql as $$ begin return; end $$;`);
  await db.exec(await readFile(new URL("../../DB_Schema/migrations/admin_analysis_jobs.sql", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../../DB_Schema/migrations/verified_report_status.sql", import.meta.url), "utf8");
  await db.exec(migration);
  // These triggers already exist after the prerequisite credibility migration.
  await db.exec(`create trigger credibility_protect_review_fields before insert or update on reports for each row execute function protect_report_review_fields();
    create trigger credibility_review_score after update of status,is_verified on reports for each row execute function score_reviewed_report();`);
  await db.exec(migration);
});
after(() => db.close());

test("migration is rerunnable without rewriting historical report flags", async () => {
  assert.equal(await scalar("select is_verified v from reports where id=$1", [id(3)]), false);
  assert.equal(await scalar("select count(*)::int v from credibility_events"), 0);
});

test("Verified is a persisted status with one verification reward and an audited notification outbox", async () => {
  const verified = await save(1, "Verified", false);
  assert.equal(verified.status, "Verified");
  assert.equal(verified.is_verified, true, "explicit false cannot contradict the status");
  assert.equal(await scalar("select score v from user_credibility where user_id=$1", [id(901)]), "65");
  assert.equal(await scalar("select count(*)::int v from credibility_events where event_type='report_verified'"), 1);
  assert.equal(await scalar("select payload->>'status' v from admin_analysis_jobs where id=$1", [verified.jobId]), "Verified");
  assert.equal(await scalar("select action_type v from audit_logs where report_id=$1 order by id limit 1", [id(1)]), "Report Verified");
  const repeat = await save(1, "Verified");
  assert.equal(repeat.jobId, null);
});

test("resolving a verified report does not pay a second verification reward", async () => {
  const resolved = await save(1, "Resolved");
  assert.equal(resolved.status, "Resolved");
  assert.equal(resolved.is_verified, true);
  assert.equal(await scalar("select score v from user_credibility where user_id=$1", [id(901)]), "65");
  assert.equal(await scalar("select count(*)::int v from credibility_events where event_type='report_verified'"), 1);
  assert.equal(await scalar("select action_type v from audit_logs where report_id=$1 and new_value='Resolved'", [id(1)]), "Report Status Updated");
});

test("ownerless seed reports can be verified and resolved without null-user events", async () => {
  assert.equal((await save(2, "Verified")).status, "Verified");
  assert.equal((await save(2, "Resolved")).status, "Resolved");
  assert.equal(await scalar("select count(*)::int v from credibility_events where report_id=$1", [id(2)]), 0);
  await db.exec(`insert into report_validations values('${id(700)}','Verified')`);
});

test("reopening clears verification and does not repay an already recorded reward", async () => {
  assert.equal((await save(1, "Under Verification", true)).is_verified, false);
  await save(1, "Verified");
  assert.equal(await scalar("select count(*)::int v from credibility_events where event_type='report_verified'"), 1);
  assert.equal((await save(2, "Archived", true)).is_verified, false);
  await assert.rejects(save(2, null, true), /choose an active status/);
});

test("active safety metadata includes Verified and excludes Resolved", async () => {
  const rows = await scalar("select feed_safety_reports(now()-interval '1 day',now()+interval '1 day') v");
  assert.equal(rows.some(row => row.id === id(1) && row.status === "Verified"), true);
  assert.equal(rows.some(row => row.status === "Resolved"), false);
});

test("ordinary users cannot self-verify or invoke the administrator status writer", async () => {
  await db.exec(`select set_config('request.jwt.claims','{"role":"authenticated"}',false);
    select set_config('test.user_id','${id(901)}',false);`);
  await assert.rejects(db.exec(`update reports set status='Verified' where id='${id(3)}'`), /Only admins/);
  await db.exec("select set_config('request.jwt.claims','',false)");
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await scalar("select has_function_privilege($1,'save_admin_report_status(uuid,uuid,text,text,boolean)','execute') v", [role]), false);
  }
});
