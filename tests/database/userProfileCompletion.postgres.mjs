import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
test("location verification table is private and normal users cannot forge confirmation", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.profiles(id uuid primary key); grant usage on schema public to service_role,anon,authenticated;");
    const migration = await readFile(new URL("../../DB_Schema/migrations/user_profile_completion.sql", import.meta.url), "utf8");
    await db.exec(migration); await db.exec(migration);
    await db.exec("insert into public.profiles values ('10000000-0000-4000-8000-000000000001')");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from public.profile_location_verifications"), /permission denied/);
      await assert.rejects(db.query("insert into public.profile_location_verifications(user_id,address,latitude,longitude) values('10000000-0000-4000-8000-000000000001','Forged',10,123)"), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await db.exec("insert into public.profile_location_verifications(user_id,address,latitude,longitude) values('10000000-0000-4000-8000-000000000001','Argao',9.88,123.59)");
    assert.equal((await db.query("select address from public.profile_location_verifications")).rows[0].address, "Argao");
  } finally { await db.close(); }
});
