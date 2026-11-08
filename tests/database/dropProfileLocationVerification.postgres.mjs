import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const sql = await readFile(new URL("../../DB_Schema/migrations/drop_unused_profile_location_verifications.sql", import.meta.url), "utf8");

test("cleanup drops only GPS verification, preserves users/addresses and is repeatable", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table profiles(id text primary key,location text);
      insert into profiles values('user','Lahug, Cebu City, Cebu');
      create table profile_location_verifications(user_id text references profiles(id),latitude float,longitude float);
      insert into profile_location_verifications values('user',10.3,123.9);`);
    await db.exec(sql); await db.exec(sql);
    assert.equal((await db.query("select to_regclass('public.profile_location_verifications') as name")).rows[0].name, null);
    assert.deepEqual((await db.query("select * from profiles")).rows, [{ id: "user", location: "Lahug, Cebu City, Cebu" }]);
  } finally { await db.close(); }
});

test("cleanup refuses to remove unexpected dependent objects instead of cascading", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table profile_location_verifications(user_id text); create view verification_dependency as select * from profile_location_verifications;");
    await assert.rejects(db.exec(sql), /depend/);
    await db.exec("rollback");
    assert.equal((await db.query("select to_regclass('public.profile_location_verifications') as name")).rows[0].name, "profile_location_verifications");
  } finally { await db.close(); }
});
