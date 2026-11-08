import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");

test("manual address migration is repeatable and preserves existing addresses without guessing barangays", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table profiles(id text primary key,location text); insert into profiles values('user','Old street, Cebu City');");
    const sql = await readFile(new URL("../../DB_Schema/migrations/manual_profile_address.sql", import.meta.url), "utf8");
    await db.exec(sql); await db.exec(sql);
    const row = (await db.query("select * from profiles")).rows[0];
    assert.deepEqual(row, { id: "user", location: "Old street, Cebu City", address_barangay: "", address_line: "" });
    await db.exec("update profiles set address_barangay='Lahug',address_line='Cebu City, Cebu',location='Barangay Lahug, Cebu City, Cebu' where id='user'");
    await db.exec(sql);
    assert.equal((await db.query("select address_barangay from profiles")).rows[0].address_barangay, "Lahug");
  } finally { await db.close(); }
});
