import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const sql = await readFile(new URL('../../DB_Schema/migrations/sentiment_raw_confidence_decision.sql', import.meta.url), 'utf8');

test('raw-decision migration preserves historical rows, RLS and grants and is rerunnable', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.sentiment_analysis(id integer primary key,label text,confidence numeric(5,4));
      alter table public.sentiment_analysis enable row level security;
      grant select on public.sentiment_analysis to authenticated;
      grant all on public.sentiment_analysis to service_role;
      insert into public.sentiment_analysis values(1,'neutral',.7542);`);
    await db.exec(sql);
    await db.exec(sql);
    assert.deepEqual((await db.query('select id,label,confidence::text,decision from public.sentiment_analysis')).rows,
      [{ id: 1, label: 'neutral', confidence: '0.7542', decision: null }]);
    assert.equal((await db.query("select relrowsecurity v from pg_class where oid='public.sentiment_analysis'::regclass")).rows[0].v, true);
    assert.equal((await db.query("select has_table_privilege('anon','public.sentiment_analysis','select') v")).rows[0].v, false);
    assert.equal((await db.query("select has_table_privilege('authenticated','public.sentiment_analysis','select') v")).rows[0].v, true);
    const decision = { policy: 'raw-confidence-v1', winnerId: 'gemini', candidates: [
      { id: 'local', confidence: .7772260308265686, label: 'neutral' },
      { id: 'gemini', confidence: .95, label: 'negative' },
    ] };
    await db.query('update public.sentiment_analysis set decision=$1 where id=1', [JSON.stringify(decision)]);
    assert.deepEqual((await db.query('select decision from public.sentiment_analysis')).rows[0].decision, decision);
  } finally { await db.close(); }
});
