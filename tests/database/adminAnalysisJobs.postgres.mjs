import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.v;
const enqueue = report => scalar("select enqueue_admin_analysis($1,$2::uuid[]) v", [id(900), [report]]);
const progress = batch => scalar("select admin_analysis_progress($1) v", [batch]);
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table reports(id uuid primary key,user_id uuid,incident_type_id uuid,location text,status text,is_verified boolean);
    create table incident_types(id uuid primary key,name text);
    create table profiles(id uuid primary key);
    insert into profiles values('${id(900)}');
    create table report_comments(id uuid primary key,report_id uuid);
    create table audit_logs(id uuid primary key default gen_random_uuid(),actor_id uuid,actor_name text,action_type text,title text,details text,report_id uuid,old_value text,new_value text);
    insert into reports values('${id(1)}','${id(901)}','${id(800)}','Lamacan','Pending Review',false),('${id(2)}',null,'${id(800)}','Tulic','Pending Review',false);
    insert into incident_types values('${id(800)}','Theft');
    insert into report_comments values('${id(10)}','${id(1)}'),('${id(11)}','${id(1)}');`);
  const sql = await readFile(new URL("../../DB_Schema/migrations/admin_analysis_jobs.sql", import.meta.url), "utf8");
  await db.exec(sql); await db.exec(sql);
});
after(() => db.close());
test("queue persists individual credibility, report and comment tasks and deduplicates active work", async () => {
  const first = await enqueue(id(1)), second = await enqueue(id(1));
  assert.notEqual(first, second);
  assert.equal((await progress(first)).total, 4);
  assert.equal((await progress(second)).total, 4);
  assert.equal(await scalar("select count(*)::int v from admin_analysis_jobs"), 4);
  assert.equal((await progress(first)).state, "queued");
  const active = await scalar("select active_admin_analysis($1) v", [id(900)]);
  assert.equal(active.length, 2);
  assert.equal((await scalar("select active_admin_analysis($1) v", [id(902)])).length, 0);
});
test("leases claim distinct tasks and progress distinguishes completion, failures and skips", async () => {
  const batch = await enqueue(id(1));
  const a = (await db.query("select * from claim_admin_analysis_job()")).rows[0];
  const b = (await db.query("select * from claim_admin_analysis_job()")).rows[0];
  assert.notEqual(a.id, b.id); assert.notEqual(a.lease_token, b.lease_token);
  assert.equal((await progress(batch)).state, "running");
  await db.query("update admin_analysis_jobs set state='succeeded',lease_token=null,lease_until=null where id=$1", [a.id]);
  await db.query("update admin_analysis_jobs set state='failed',last_error='Provider timeout',lease_token=null,lease_until=null where id=$1", [b.id]);
  await db.exec("update admin_analysis_jobs set state='skipped' where state='queued'");
  const result = await progress(batch);
  assert.equal(result.state, "failed"); assert.equal(result.done, 4); assert.equal(result.failed, 1); assert.equal(result.skipped, 2);
  assert.equal(await scalar("select count(*)::int v from audit_logs where action_type='AI Analysis Completed'"), 1);
  const retry = await enqueue(id(1));
  assert.equal((await progress(retry)).state, "queued");
});
test("expired jobs recover with a new token and stop after three attempts", async () => {
  await db.exec("update admin_analysis_jobs set state='skipped' where state in ('running','queued')");
  await enqueue(id(2));
  const job = (await db.query("select * from claim_admin_analysis_job()")).rows[0];
  await db.query("update admin_analysis_jobs set lease_until=now()-interval '1 second' where id=$1", [job.id]);
  const recovered = (await db.query("select * from claim_admin_analysis_job()")).rows[0];
  assert.equal(recovered.id, job.id); assert.notEqual(recovered.lease_token, job.lease_token); assert.equal(recovered.attempts, 2);
  await db.query("update admin_analysis_jobs set attempts=3,lease_until=now()-interval '1 second' where id=$1", [job.id]);
  await db.query("select * from claim_admin_analysis_job()");
  assert.equal(await scalar("select state v from admin_analysis_jobs where id=$1", [job.id]), "failed");
});
test("status, audit and notification/AI outbox commit atomically with effective verification", async () => {
  const saved = await scalar("select save_admin_report_status($1,$2,'Ada','Resolved',true) v", [id(1), id(900)]);
  assert.equal(saved.status, "Resolved"); assert.equal(saved.is_verified, true); assert.ok(saved.jobId);
  assert.equal(await scalar("select status v from reports where id=$1", [id(1)]), "Resolved");
  assert.equal(await scalar("select count(*)::int v from audit_logs where report_id=$1 and new_value='Resolved'", [id(1)]), 1);
  const archived = await scalar("select save_admin_report_status($1,$2,'Ada','Archived',true) v", [id(1), id(900)]);
  assert.equal(archived.is_verified, false);
  assert.equal(await scalar("select payload->>'status' v from admin_analysis_jobs where id=$1", [archived.jobId]), "Archived");
  const count = await scalar("select count(*)::int v from admin_analysis_jobs");
  await assert.rejects(scalar("select save_admin_report_status($1,$2,'Ada','INVALID',true) v", [id(1), id(900)]), /Invalid/);
  assert.equal(await scalar("select status v from reports where id=$1", [id(1)]), "Archived");
  assert.equal(await scalar("select count(*)::int v from admin_analysis_jobs"), count);
  await db.exec("create function reject_status_audit() returns trigger language plpgsql as $$ begin if new.new_value='Rejected' then raise exception 'audit failed'; end if; return new; end $$; create trigger fail_test before insert on audit_logs for each row execute function reject_status_audit();");
  await assert.rejects(scalar("select save_admin_report_status($1,$2,'Ada','Rejected',false) v", [id(1), id(900)]), /audit failed/);
  assert.equal(await scalar("select status v from reports where id=$1", [id(1)]), "Archived", "Audit failure must roll back status");
});
test("ordinary clients cannot inspect or execute the worker queue", async () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await scalar("select has_table_privilege($1,'admin_analysis_jobs','select') v", [role]), false);
    for (const signature of ["enqueue_admin_analysis(uuid,uuid[])", "claim_admin_analysis_job()", "admin_analysis_progress(uuid)", "save_admin_report_status(uuid,uuid,text,text,boolean)"]) {
      assert.equal(await scalar("select has_function_privilege($1,$2,'execute') v", [role, signature]), false);
    }
  }
});
