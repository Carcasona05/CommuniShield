import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { compareRecords } from "../../clients/services/adminBrowsing.js";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rpc = async (options = {}) => (await db.query("select public.admin_browse_page($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as page", [
  options.view || "records", options.from || null, options.to || null, options.status || null, options.kind || null, options.actorRole || null,
  options.page || 1, options.pageSize || 10, options.focusReport || null, Boolean(options.exportAll),
  options.cursor?.created_at || null, options.cursor?.kind || null, options.cursor?.id || null,
  options.cursor?.priority || null,
])).rows[0].page;

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key, fullname text, role text);
    create table incident_categories(id uuid primary key, name text);
    create table incident_types(id uuid primary key, category_id uuid, name text);
    create table reports(id uuid primary key,user_id uuid,incident_type_id uuid,role text,status text,created_at timestamptz,
      details text,location text,latitude numeric,longitude numeric,poster_name text,is_verified boolean default false);
    create table report_credibility_analysis(report_id uuid primary key,severity text,ai_score numeric);
    create table admin_announcement(id uuid primary key,admin_id uuid,type text,title text,created_at timestamptz,details text,location text,pic_url text);
    create table audit_logs(id uuid primary key,actor_id uuid,actor_name text,action_type text,title text,details text,report_id uuid,old_value text,new_value text,created_at timestamptz);`);
  await db.query("insert into profiles values($1,'Admin One','admin'),($2,'Super One','super_admin'),($3,'User One','user')", [id(9001), id(9002), id(9003)]);
  await db.query("insert into incident_categories values($1,'Property-Related Incidents');", [id(9004)]);
  await db.query("insert into incident_types values($1,$2,'Theft');", [id(9005), id(9004)]);
  await db.exec(`insert into reports(id,user_id,incident_type_id,role,status,created_at,details,location)
    select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      case when n%2=0 then '${id(9001)}'::uuid else '${id(9002)}'::uuid end,'${id(9005)}'::uuid,
      case when n%2=0 then 'admin' else 'super_admin' end,'Pending Review','2026-11-12T12:00:00.123456Z'::timestamptz + n * interval '1 second',
      repeat('Narrative ',80),'Lamacan, Argao' from generate_series(1,35) n;
    insert into reports(id,user_id,role,status,created_at,details,location)
      select ('00000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'${id(9003)}','user','Archived',
        '2026-11-12T12:00:00.123456Z'::timestamptz + n * interval '1 second','Archived narrative','Tulic, Argao' from generate_series(1,13) n;
    insert into admin_announcement(id,admin_id,type,title,created_at,details,location)
      select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(9002)}','Announcement','Announcement '||n,
        '2026-11-12T12:00:00.123456Z'::timestamptz + n * interval '1 second','Published details','Lamacan' from generate_series(1,13) n;
    insert into audit_logs(id,actor_id,actor_name,action_type,title,details,report_id,created_at)
      select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        case when n%2=0 then '${id(9001)}'::uuid else '${id(9002)}'::uuid end,'Admin',
        case n%5 when 0 then 'Report Archived' when 1 then 'Report Verified' when 2 then 'Report Mapped' when 3 then 'Report Rejected' else 'AI Analysis Completed' end,
        'Activity '||n,'Log details',case when n=1 then '${id(8000)}'::uuid else null end,
        '2026-11-12T12:00:00.123456Z'::timestamptz + n * interval '1 second' from generate_series(1,500) n;`);
  const sql = await readFile(new URL("../../DB_Schema/migrations/admin_view_more.sql", import.meta.url), "utf8");
  await db.exec(sql); await db.exec(sql);
});
after(() => db.close());

test("mixed records return ten rows, complete metrics and no archived records/actions", async () => {
  const first = await rpc();
  assert.equal(first.items.length, 10); assert.equal(first.total, 448);
  assert.deepEqual(first.stats, { reports: 35, announcements: 13, activities: 400, verified: 200, rejected: 100, ai: 100 });
  const seen = new Set(); let page = first, number = 1;
  do {
    for (const row of page.items) { assert.equal(seen.has(row.id), false); seen.add(row.id); assert.notEqual(row.status, "Archived"); assert.notEqual(row.status, "Report Archived"); }
    if (!page.hasMore) break;
    page = await rpc({ page: ++number, cursor: page.cursor });
  } while (true);
  assert.equal(seen.size, 448);
});

test("database filtering happens before page selection, including roles and local-only kind", async () => {
  const page = await rpc({ kind: "Incident", actorRole: "super_admin", status: "Pending Review" });
  assert.equal(page.total, 18); assert.equal(page.stats.reports, 18); assert.equal(page.items.length, 10);
  assert.ok(page.items.every(row => row.actorRole === "super_admin" && row.kind === "Incident"));
  const recent = await rpc({ kind: "Incident", from: "2026-11-12T12:00:30Z" });
  assert.equal(recent.total, 6);
  assert.equal((await rpc({ kind: "Blotter" })).total, 0, "Local blotters must never be stored or synthesized by the RPC");
});

test("logs are not capped at 200 and off-page notification targets are returned separately", async () => {
  const first = await rpc({ view: "logs", focusReport: id(8000) });
  assert.equal(first.total, 500); assert.equal(first.items.length, 10); assert.equal(first.stats.verified, 200);
  assert.equal(first.focusedItem.id, id(1)); assert.ok(first.items.every(row => row.id !== id(1)));
  const filtered = await rpc({ view: "logs", status: "AI Analysis Completed", actorRole: "admin" });
  assert.equal(filtered.total, 50); assert.equal(filtered.stats.ai, 50);
});

test("keyset continuation neither repeats nor skips old rows when a new log is inserted", async () => {
  const first = await rpc({ view: "logs" });
  await db.query("insert into audit_logs(id,action_type,title,created_at) values($1,'Report Verified','New log','2026-11-12T15:00:00Z')", [id(7000)]);
  const next = await rpc({ view: "logs", page: 2, cursor: first.cursor });
  assert.equal(next.items.length, 10); assert.equal(next.total, 501);
  assert.ok(next.items.every(row => !first.items.some(old => old.id === row.id)));
  assert.equal(next.items[0].id, id(490));
  assert.ok(first.cursor.created_at.includes("123456"), "Preserve PostgreSQL microseconds in the cursor");
});

test("archive browsing is independently paginated and reflects a restored report", async () => {
  const first = await rpc({ view: "archived", actorRole: "user" });
  assert.equal(first.total, 13); assert.ok(first.items.every(row => row.status === "Archived"));
  const second = await rpc({ view: "archived", actorRole: "user", page: 2, cursor: first.cursor });
  assert.equal(second.items.length, 3); assert.equal(second.hasMore, false);
  await db.query("update reports set status='Pending Review' where id=$1", [first.items[0].id]);
  const refreshed = await rpc({ view: "archived" });
  assert.equal(refreshed.total, 12); assert.ok(refreshed.items.every(row => row.id !== first.items[0].id));
});

test("exports include all matching rows and full narratives, not the visible ten or preview excerpt", async () => {
  const page = await rpc({ kind: "Incident" });
  assert.equal(page.items[0].details.length, 240); assert.equal(page.items[0].previewOnly, true);
  const exported = await rpc({ kind: "Incident", exportAll: true });
  assert.equal(exported.items.length, 35); assert.equal(exported.hasMore, false);
  assert.equal(exported.items[0].details.length, 800); assert.equal(exported.items[0].previewOnly, false);
});

test("only service_role can call the pagination function; ordinary clients gain no new access", async () => {
  const signature = "public.admin_browse_page(text,timestamptz,timestamptz,text,text,text,integer,integer,uuid,boolean,timestamptz,text,uuid,jsonb)";
  for (const role of ["anon", "authenticated"]) {
    const result = await db.query("select has_function_privilege($1,$2,'execute') as allowed", [role, signature]);
    assert.equal(result.rows[0].allowed, false);
  }
  assert.equal((await db.query("select has_function_privilege('service_role',$1,'execute') as allowed", [signature])).rows[0].allowed, true);
});

test("record hierarchy and severity ordering apply globally before View more and export", async () => {
  const statuses = ["Pending Review", "Under Verification", "Verified", "Resolved", "Rejected", "Marked Fake"];
  const severities = ["Critical", "High", "Medium", "Low", null];
  for (const [s, status] of statuses.entries()) for (const [level, severity] of severities.entries()) {
    const reportId = id(10000 + s * 10 + level);
    await db.query("insert into reports(id,user_id,role,status,created_at,location) values($1,$2,'admin',$3,$4,'Lamacan')",
      [reportId, id(9001), status, `2030-01-${String(s + 1).padStart(2, "0")}T12:00:00.123456Z`]);
    if (severity) await db.query("insert into report_credibility_analysis values($1,$2,80)", [reportId, severity]);
  }
  await db.query("insert into admin_announcement(id,admin_id,type,title,created_at) values($1,$2,'Announcement','Future announcement','2030-02-01T00:00:00Z')", [id(11000), id(9001)]);
  const filters = { from: "2030-01-01", to: "2030-12-31", pageSize: 7 };
  const exported = await rpc({ ...filters, exportAll: true });
  assert.equal(exported.items.length, 31);
  assert.deepEqual(exported.items.slice(0, 5).map(row => row.severity), ["Critical", "High", "Medium", "Low", "Unknown"]);
  assert.deepEqual([...new Set(exported.items.filter(row => row.kind === "Incident").map(row => row.status))], statuses);
  assert.equal(exported.items.at(-1).kind, "Announcement", "Non-incidents do not jump ahead on recency or severity");
  assert.deepEqual([...exported.items].sort(compareRecords), exported.items, "Local-record merge uses exactly the database order");
  const collected = []; let cursor; let page = 1;
  do {
    const result = await rpc({ ...filters, page: page++, cursor });
    collected.push(...result.items);
    assert.equal(result.total, 31);
    if (!result.hasMore) break;
    assert.equal(result.cursor.priority.version, 1);
    cursor = result.cursor;
  } while (page < 20);
  assert.deepEqual(collected.map(row => row.id), exported.items.map(row => row.id));
  assert.equal(new Set(collected.map(row => row.id)).size, 31);
});

test("a rejected top report moves down on prefix refresh; oldest-first preserves microsecond ties", async () => {
  const filters = { from: "2030-01-01", to: "2030-12-31", kind: "Incident", pageSize: 1 };
  const first = await rpc(filters);
  assert.equal(first.items[0].id, id(10000));
  await db.query("update reports set status='Rejected' where id=$1", [id(10000)]);
  const refreshed = await rpc(filters);
  assert.equal(refreshed.items[0].id, id(10001));
  const all = await rpc({ ...filters, exportAll: true });
  const rejected = all.items.findIndex(row => row.id === id(10000));
  assert.ok(rejected > all.items.findIndex(row => row.status === "Resolved"));
  await db.query("insert into reports(id,role,status,created_at) values($1,'admin','Under Verification','2030-01-02T12:00:00.123455Z'),($2,'admin','Under Verification','2030-01-02T12:00:00.123456Z')", [id(12000), id(12001)]);
  await db.query("insert into report_credibility_analysis values($1,'Critical',80),($2,'Critical',80)", [id(12000), id(12001)]);
  const scope = { ...filters, status: "Under Verification" };
  const a = await rpc(scope);
  const b = await rpc({ ...scope, page: 2, cursor: a.cursor });
  const c = await rpc({ ...scope, page: 3, cursor: b.cursor });
  assert.deepEqual([a.items[0].id, b.items[0].id, c.items[0].id], [id(12000), id(12001), id(10010)]);
});
