import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");

test("station migration corrects old pins in place, preserves other places, and is repeatable", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table emergency_facilities(id uuid primary key default gen_random_uuid(),name text unique,type text,latitude double precision,longitude double precision,address text,phone text);
      insert into emergency_facilities(name,type,latitude,longitude,address,phone) values
      ('Argao Municipal Police Station','police',9.8721,123.5986,'Poblacion','911'),
      ('Argao Fire Station','fire',9.8738,123.5998,'Poblacion','911'),
      ('Other Police Station','police',9.9,123.6,'Other address','12345');`);
    const before = (await db.query("select id,name from emergency_facilities order by name")).rows;
    const sql = await readFile(new URL("../../DB_Schema/migrations/argao_real_emergency_locations.sql", import.meta.url), "utf8");
    await db.exec(sql); await db.exec(sql);
    const rows = (await db.query("select * from emergency_facilities order by name")).rows;
    assert.deepEqual(rows.map(({ id, name }) => ({ id, name })), before);
    assert.equal(rows.find(row => row.type === "fire").phone, "(032)8872837");
    assert.equal(rows.find(row => row.name === "Argao Municipal Police Station").latitude, 9.8807935);
    assert.equal(rows.find(row => row.name === "Other Police Station").phone, "12345");
    await db.exec("delete from emergency_facilities");
    await db.exec(sql); await db.exec(sql);
    assert.equal((await db.query("select * from emergency_facilities")).rows.length, 2);
  } finally { await db.close(); }
});
