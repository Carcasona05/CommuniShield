import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const owner = randomUUID(), other = randomUUID();
const rpc = async (args = []) => (await db.query("select feed_page($1,$2,$3,$4,$5,$6,$7,$8) page", [args[0] ?? null, args[1] ?? null, args[2] ?? null, args[3] ?? null, args[4] ?? "All", args[5] ?? null, args[6] ?? null, args[7] ?? "User"])).rows[0].page;
const value = async (sql, args = []) => (await db.query(sql, args)).rows[0].v;

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table reports(id uuid primary key,user_id uuid,created_at timestamptz,status text,is_verified boolean default false,incident_type_id uuid,latitude numeric,longitude numeric);
    create table admin_announcement(id uuid primary key,created_at timestamptz);
    create table report_comments(id uuid primary key,report_id uuid references reports(id),user_id uuid,created_at timestamptz default now(),content text);
    create table report_likes(report_id uuid,user_id uuid);
    create table incident_types(id uuid primary key,name text);
    create table report_credibility_analysis(report_id uuid primary key,severity text);`);
  const migration = await readFile(new URL("../../DB_Schema/migrations/feed_pagination_comment_jobs.sql", import.meta.url), "utf8");
  await db.exec(migration); await db.exec(migration);
  for (let i = 0; i < 35; i++) {
    await db.query("insert into reports(id,user_id,created_at,status) values($1,$2,$3,$4)",
      [randomUUID(), owner, `2026-11-08T10:00:${String(i).padStart(2, "0")}.123456Z`, i < 15 ? "Pending Review" : i < 23 ? "Under Verification" : i < 33 ? "Resolved" : "Rejected"]);
  }
  await db.query("insert into reports(id,user_id,created_at,status) values($1,$2,now(),'Archived'),($3,$4,'2026-11-08T10:01:00Z','Pending Review')", [randomUUID(), owner, randomUUID(), other]);
  for (let i = 0; i < 13; i++) await db.query("insert into admin_announcement values($1,$2)", [randomUUID(), `2026-11-08T10:00:${String(i * 2).padStart(2, "0")}Z`]);
});
after(() => db.close());

test("owner totals and status counts cover all 35 own reports, never another user", async () => {
  const first = await rpc([owner]);
  assert.equal(first.total, 35);
  assert.equal(first.items.length, 11, "ten visible + one lookahead");
  assert.deepEqual(first.statusCounts, { "All Status": 35, "Pending Review": 15, "Under Verification": 8, Resolved: 10, Rejected: 2 });
  assert.ok(first.items.every(row => row.source === "User"));
  const filtered = await rpc([owner, null, null, "Pending Review"]);
  assert.equal(filtered.total, 15);
  assert.deepEqual(filtered.statusCounts, first.statusCounts);
  const last = filtered.items[9];
  const second = await rpc([owner, null, null, "Pending Review", "All", last.created_at, last.id, last.source]);
  assert.equal(second.items.length, 5);
  assert.equal(second.total, 15);
  assert.equal(new Set([...filtered.items.slice(0, 10), ...second.items].map(row => row.id)).size, 15);
});

test("mixed Home feed is globally ordered and all batches have at most ten visible rows", async () => {
  const seen = new Set();
  let cursor;
  do {
    const result = await rpc([null, null, null, null, "All", cursor?.created_at, cursor?.id, cursor?.source]);
    const visible = result.items.slice(0, 10);
    for (const row of visible) { assert.equal(seen.has(`${row.source}:${row.id}`), false); seen.add(`${row.source}:${row.id}`); }
    cursor = result.items.length > 10 ? visible.at(-1) : null;
  } while (cursor);
  assert.equal(seen.size, 49);
  const admin = await rpc([null, null, null, null, "Admin"]);
  assert.equal(admin.total, 13); assert.ok(admin.items.every(row => row.source === "Admin"));
  assert.equal((await rpc([null, null, null, "Pending Review", "Admin"])).total, 0);
});

test("newly inserted posts do not shift the next cursor batch", async () => {
  const first = await rpc([owner]);
  const last = first.items[9];
  await db.query("insert into reports values($1,$2,'2026-11-08T10:02:00Z','Pending Review',false,null,null,null)", [randomUUID(), owner]);
  const next = await rpc([owner, null, null, null, "All", last.created_at, last.id, last.source]);
  assert.equal(next.total, 36);
  assert.ok(next.items.every(row => !first.items.slice(0, 10).some(old => old.id === row.id)));
});

test("database windows filter content before pagination", async () => {
  const page = await rpc([null, "2026-11-08T10:00:30Z", "2026-11-08T10:00:34.999999Z"]);
  assert.equal(page.total, 5);
  assert.ok(page.items.every(row => row.created_at >= "2026-11-08T10:00:30"));
});

test("database engagement counts exceed response row caps without downloading comments", async () => {
  const report = (await rpc([owner])).items[0].id;
  await db.query("insert into report_comments(id,report_id,user_id,content) select gen_random_uuid(),$1,$2,'Test' from generate_series(1,1100)", [report, owner]);
  await db.query("insert into report_likes values($1,$2),($1,$3)", [report, owner, other]);
  const result = (await db.query("select * from report_engagement_counts(array[$1::uuid],$2)", [report, owner])).rows[0];
  assert.equal(Number(result.comments), 1100); assert.equal(Number(result.likes), 2); assert.equal(result.is_liked, true);
  assert.equal(Number(await value("select count(*) v from comment_sentiment_jobs")), 1100);
});

test("queue insertion is atomic with the saved comment and rolls back together", async () => {
  const report = (await rpc([owner])).items[0].id, id = randomUUID();
  await db.exec("begin");
  await db.query("insert into report_comments(id,report_id,user_id,content) values($1,$2,$3,'Rollback')", [id, report, owner]);
  assert.equal(Number(await value("select count(*) v from comment_sentiment_jobs where comment_id=$1", [id])), 1);
  await db.exec("rollback");
  assert.equal(Number(await value("select count(*) v from comment_sentiment_jobs where comment_id=$1", [id])), 0);
});

test("claims lease distinct jobs and an expired job can be recovered with a new token", async () => {
  const first = (await db.query("select * from claim_comment_sentiment_job()")).rows[0];
  const second = (await db.query("select * from claim_comment_sentiment_job()")).rows[0];
  assert.notEqual(first.comment_id, second.comment_id);
  await db.query("update comment_sentiment_jobs set lease_until=now()-interval '1 second',available_at=now()-interval '1 hour' where comment_id=$1", [first.comment_id]);
  const recovered = (await db.query("select * from claim_comment_sentiment_job()")).rows[0];
  assert.equal(recovered.comment_id, first.comment_id);
  assert.notEqual(recovered.lease_token, first.lease_token);
  assert.equal(recovered.attempts, 2);
  const staleUpdate = await db.query("update comment_sentiment_jobs set completed_at=now() where comment_id=$1 and lease_token=$2 returning comment_id", [first.comment_id, first.lease_token]);
  assert.equal(staleUpdate.rows.length, 0);
});

test("pagination RPCs and job queue are not executable/readable by ordinary clients", async () => {
  assert.equal(await value("select has_function_privilege('authenticated','feed_page(uuid,timestamptz,timestamptz,text,text,timestamptz,uuid,text)','execute') v"), false);
  assert.equal(await value("select has_function_privilege('anon','claim_comment_sentiment_job()','execute') v"), false);
  assert.equal(await value("select has_table_privilege('authenticated','comment_sentiment_jobs','select') v"), false);
});

test("mixed-feed cursor disambiguates the same UUID and timestamp in both sources", async () => {
  const tied = "00000000-0000-4000-8000-000000000001";
  await db.query("insert into reports(id,user_id,created_at,status) values($1,$2,'2030-01-01','Pending Review')", [tied, other]);
  await db.query("insert into admin_announcement values($1,'2030-01-01')", [tied]);
  for (let i = 2; i <= 10; i++) await db.query("insert into admin_announcement values($1,'2030-01-01')", [`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`]);
  const first = await rpc([null, "2030-01-01", "2030-01-02"]);
  const last = first.items[9];
  assert.equal(last.id, tied); assert.equal(last.source, "User");
  const next = await rpc([null, "2030-01-01", "2030-01-02", null, "All", last.created_at, last.id, last.source]);
  assert.equal(next.items.length, 1); assert.equal(next.items[0].id, tied); assert.equal(next.items[0].source, "Admin");
});

test("comment cursors page all 100 tied-timestamp comments while new replies arrive", async () => {
  const report = randomUUID();
  await db.query("insert into reports(id,user_id,created_at,status) values($1,$2,'2031-01-01','Pending Review')", [report, other]);
  await db.query("insert into report_comments(id,report_id,content,created_at) select gen_random_uuid(),$1,'Original','2031-01-01T12:00:00.123456Z' from generate_series(1,100)", [report]);
  const page = async cursor => (await db.query(`select id, to_jsonb(created_at) as created_at from report_comments
    where report_id=$1 and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid))
    order by created_at desc,id desc limit 11`, [report, cursor?.created_at ?? null, cursor?.id ?? null])).rows;
  let rows = await page();
  assert.equal(rows.length, 11);
  assert.match(rows[0].created_at, /123456/);
  const seen = new Set(rows.slice(0, 10).map(row => row.id));
  let cursor = rows[9];
  await db.query("insert into report_comments(id,report_id,content,created_at) values(gen_random_uuid(),$1,'New','2031-01-01T12:00:00.123457Z')", [report]);
  do {
    rows = await page(cursor);
    for (const row of rows.slice(0, 10)) { assert.equal(seen.has(row.id), false); seen.add(row.id); }
    cursor = rows[9];
  } while (rows.length > 10);
  assert.equal(seen.size, 100);
  assert.equal(Number(await value("select count(*) v from report_comments where report_id=$1", [report])), 101);
});
