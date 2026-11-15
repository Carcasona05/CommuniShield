import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const retired = ["map_auto_map_verified", "map_cluster_overlay", "map_heatmap_overlay", "map_default_zoom", "map_center", "notification_email", "notification_push", "ai_high_threshold", "ai_medium_threshold", "ai_api_endpoint"];

test("cleanup deletes only retired settings and preserves Cebuano, model metadata and active controls", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table system_settings(key text primary key,value text not null,updated_at timestamptz default now());");
    const kept = { ai_scoring_enabled: "false", sentiment_local_model_enabled: "true", sentiment_gemini_enabled: "true", sentiment_cebuano_mode: "gemini", ai_model_name: "gemini-2.5-flash", ai_model_version: "existing", custom_key: "preserved" };
    for (const key of retired) await db.query("insert into system_settings(key,value) values($1,'old')", [key]);
    for (const [key, value] of Object.entries(kept)) await db.query("insert into system_settings(key,value) values($1,$2)", [key, value]);
    const before = (await db.query("select * from system_settings where not(key=any($1::text[])) order by key", [retired])).rows;
    const sql = await readFile(new URL("../../DB_Schema/migrations/remove_unused_super_admin_settings.sql", import.meta.url), "utf8");
    await db.exec(sql); await db.exec(sql);
    assert.deepEqual((await db.query("select * from system_settings order by key")).rows, before);
  } finally { await db.close(); }
});
