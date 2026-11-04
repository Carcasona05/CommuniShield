import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const actor = randomUUID();
const user = randomUUID();
const migration = await readFile(new URL('../../DB_Schema/migrations/sentiment_training_dataset_selection.sql', import.meta.url), 'utf8');
const functions = await readFile(new URL('../../DB_Schema/finalized/shared/02_functions.sql', import.meta.url), 'utf8');
const sqlFunction = (name) => {
  const start = functions.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, name);
  return functions.slice(start, functions.indexOf('$function$;', start) + '$function$;'.length);
};
const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.v;
const summary = () => value('select public.sentiment_training_pool_summary() v');
const queue = (payload = {}, who = actor) => value(
  "select public.manage_sentiment_training($1,'queue',null,null,$2) v", [who, JSON.stringify(payload)]);
async function approve(languages = ['cebuano']) {
  const id = randomUUID();
  await db.query("insert into public.sentiment_datasets(id,name,status,version,reviewed_by) values($1,$2,'approved',1,$3)", [id, `Dataset ${id}`, actor]);
  for (const language of languages) await db.query(
    "insert into public.sentiment_training_samples(dataset_id,language,label,active) values($1,$2,'positive',true)", [id, language]);
  return id;
}
async function claim(result) {
  // The existing worker claim intentionally snapshots ALL approved datasets.
  // Simulate that overwrite to prove receipts survive independently of it.
  await db.query(`update public.sentiment_training_jobs set status='training',lease_until=now()+interval '5 minutes',
    data_revision=0,snapshot=jsonb_build_object('datasets',(select jsonb_agg(jsonb_build_object('id',id,'version',version))
      from public.sentiment_datasets where status='approved')) where id=$1`, [result.job_id]);
}
async function finish(result, status = 'ready', metrics = {}) {
  await db.query("update public.sentiment_training_jobs set status=$2,metrics=$3,finished_at=now(),lease_until=null where id=$1", [result.job_id, status, JSON.stringify(metrics)]);
}
const readyIds = async () => (await summary()).readyDatasets.map(row => row.id).sort();

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.profiles(id uuid primary key,role text,status text,fullname text,user_name text);
    create table public.sentiment_datasets(id uuid primary key,name text,status text,version integer,updated_at timestamptz default now(),reviewed_by uuid);
    create table public.sentiment_training_samples(id uuid default gen_random_uuid(),dataset_id uuid,language text,label text,active boolean);
    create table public.sentiment_model_state(id integer primary key,data_revision bigint,generation bigint);
    insert into public.sentiment_model_state values(1,0,0);
    create table public.sentiment_training_jobs(id uuid primary key default gen_random_uuid(),status text default 'queued',
      created_at timestamptz default now(),available_at timestamptz default now(),finished_at timestamptz,
      lease_until timestamptz,data_revision bigint,training_mode text default 'continue',training_languages text[],snapshot jsonb,metrics jsonb);
    create table public.sentiment_training_events(job_id uuid,actor_id uuid,action text,details jsonb);
    create unique index one_queued on public.sentiment_training_jobs((true)) where status='queued';`);
  await db.query("insert into public.profiles values($1,'super_admin','Active','Admin','admin'),($2,'user','Active','User','user')", [actor, user]);
  await db.exec(sqlFunction('enqueue_sentiment_training'));
  await db.exec(sqlFunction('manage_sentiment_training_eligibility_legacy'));
  await db.exec(migration);
});
beforeEach(async () => db.exec('delete from public.sentiment_training_events; delete from public.sentiment_training_jobs; delete from public.sentiment_training_samples; delete from public.sentiment_datasets;'));
after(async () => db.close());

for (const languages of [['cebuano'], ['english']]) {
  test(`unselected ${languages[0]} dataset stays ready while selected Cebuano is queued, running and complete`, async () => {
    const selected = await approve();
    const other = await approve(languages);
    const run = await queue({ mode: 'fresh', dataset_ids: [selected] });
    assert.deepEqual(run.selected_datasets, [{ id: selected, version: 1 }]);
    assert.deepEqual(await readyIds(), [other]);
    await claim(run);
    assert.deepEqual(await readyIds(), [other]);
    assert.equal(await value("select jsonb_array_length(snapshot->'datasets') v from public.sentiment_training_jobs where id=$1", [run.job_id]), 2);
    await finish(run);
    assert.deepEqual(await readyIds(), [other]);
    const next = await queue({ dataset_ids: [other] });
    assert.deepEqual(next.selected_datasets, [{ id: other, version: 1 }]);
  });
}
test('no selection resolves and records every ready dataset exactly once', async () => {
  const ids = [await approve(), await approve(['english'])].sort();
  const run = await queue();
  assert.deepEqual(run.selected_datasets.map(row => row.id), ids);
  assert.deepEqual(run.requested_languages, ['cebuano', 'english']);
  assert.deepEqual(await readyIds(), []);
  assert.equal((await summary()).datasetSelectionVersion, 1);
});
test('retry keeps the original selection and scope, never the broader pool snapshot', async () => {
  const selected = await approve();
  const other = await approve(['english']);
  const run = await queue({ mode: 'fresh', dataset_ids: [selected] });
  await claim(run);
  await finish(run, 'failed', { training: { mode: 'fresh' } });
  assert.deepEqual(await readyIds(), [other]);
  const retry = await queue({ retry_job_id: run.job_id });
  assert.deepEqual(retry.selected_datasets, [{ id: selected, version: 1 }]);
  assert.deepEqual(retry.requested_languages, ['cebuano']);
  assert.equal(await value('select training_mode v from public.sentiment_training_jobs where id=$1', [retry.job_id]), 'fresh');
  assert.deepEqual(await readyIds(), [other]);
});
test('crashed or expired selection returns to ready without hiding unselected datasets', async () => {
  const ids = [await approve(), await approve()].sort();
  const run = await queue({ dataset_ids: [ids[0]] });
  await claim(run);
  await db.query("update public.sentiment_training_jobs set lease_until=now()-interval '1 second' where id=$1", [run.job_id]);
  assert.deepEqual(await readyIds(), ids);
  await finish(run, 'failed', { failure_stage: 'worker_shutdown' });
  assert.deepEqual(await readyIds(), ids);
});
test('new dataset versions become eligible and changed versions cannot be retried', async () => {
  const id = await approve();
  const run = await queue({ dataset_ids: [id] });
  await claim(run);
  await finish(run, 'failed', { training: { mode: 'fresh' } });
  await db.query('update public.sentiment_datasets set version=2 where id=$1', [id]);
  assert.deepEqual(await readyIds(), [id]);
  await assert.rejects(queue({ retry_job_id: run.job_id }), { code: '22023' });
  const next = await queue({ dataset_ids: [id] });
  assert.deepEqual(next.selected_datasets, [{ id, version: 2 }]);
});
test('legacy full-pool history is preserved but cannot silently consume or broaden dataset selection', async () => {
  const ids = [await approve(), await approve(['english'])].sort();
  const run = await queue({ dataset_ids: [ids[0]] });
  await claim(run);
  await finish(run, 'failed', { training: { mode: 'fresh' } });
  await db.query('update public.sentiment_training_jobs set selected_dataset_versions=null where id=$1', [run.job_id]);
  const before = await value('select to_jsonb(j) v from public.sentiment_training_jobs j where id=$1', [run.job_id]);
  await db.exec(migration);
  assert.deepEqual(await value('select to_jsonb(j) v from public.sentiment_training_jobs j where id=$1', [run.job_id]), before);
  assert.deepEqual(await readyIds(), ids);
  await assert.rejects(queue({ retry_job_id: run.job_id }), { code: '22023' });
});
test('authorization, active-run guard and private-wrapper grants remain enforced', async () => {
  const id = await approve();
  await assert.rejects(queue({ dataset_ids: [id] }, user), { code: '42501' });
  await assert.rejects(queue({ dataset_ids: [] }), { code: '22023' });
  await assert.rejects(queue({ dataset_ids: [null] }), { code: '22023' });
  await assert.rejects(queue({ dataset_ids: [randomUUID()] }), { code: '22023' });
  await queue({ dataset_ids: [id, id] });
  await assert.rejects(queue(), { code: '40001' });
  for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(await value(
    "select has_function_privilege($1,'public.manage_sentiment_training_eligibility_legacy(uuid,text,uuid,bigint,jsonb)','execute') v", [role]), false);
  for (const role of ['anon', 'authenticated']) assert.equal(await value(
    "select has_function_privilege($1,'public.sentiment_training_pool_summary()','execute') v", [role]), false);
});
