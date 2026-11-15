import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");

test("endpoint cleanup removes only the retired row, is rerunnable, and leaves table columns unchanged", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table system_settings(key text primary key,value text not null,updated_at timestamptz default now());
      insert into system_settings(key,value) values('ai_api_endpoint','https://old.example/models'),
        ('ai_model_version','gemini-2.5-flash'),('sentiment_local_model_enabled','true'),('sentiment_cebuano_mode','gemini');`);
    const before = (await db.query("select * from system_settings where key<>'ai_api_endpoint' order by key")).rows;
    const columns = (await db.query("select column_name,data_type from information_schema.columns where table_name='system_settings' order by ordinal_position")).rows;
    const migration = await readFile(new URL("../../DB_Schema/migrations/remove_ai_api_endpoint.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual((await db.query("select * from system_settings order by key")).rows, before);
    assert.deepEqual((await db.query("select column_name,data_type from information_schema.columns where table_name='system_settings' order by ordinal_position")).rows, columns);
  } finally { await db.close(); }
});
