import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const actor = randomUUID(), admin = randomUUID();
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) v`, args)).rows[0].v;
const preview = (model, who = actor) => rpc('sentiment_supporting_delete_preview', [who, model]);
const remove = (model, generation, datasets = [], who = actor) => rpc('delete_sentiment_supporting_with_datasets', [who,model,generation,JSON.stringify(datasets)]);
const value = async (sql, args = []) => (await db.query(sql, args)).rows[0].v;
const generation = () => value('select generation v from public.sentiment_model_state where id=1');
async function dataset() {
  const id = randomUUID();
  await db.query("insert into public.sentiment_datasets(id,name,source,status,created_by_name) values($1,'Examples','manual','approved','Admin')", [id]);
  await db.query("insert into public.sentiment_training_samples(dataset_id,text,language,label,text_key) values($1,'Good','english','positive',$2)", [id,id.replaceAll('-','').repeat(2)]);
  return { id, version: 1 };
}
async function model(datasets, status = 'archived') {
  const id = randomUUID();
  await db.query('insert into public.sentiment_supporting_models(id,status,datasets) values($1,$2,$3)',[id,status,JSON.stringify(datasets)]);
  return id;
}
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key,role text,status text,fullname text,user_name text);
    create table public.sentiment_model_state(id integer primary key,generation bigint,data_revision bigint,updated_at timestamptz);
    insert into public.sentiment_model_state values(1,0,0,now());
    create table public.sentiment_supporting_models(id uuid primary key,status text,datasets jsonb,metrics jsonb,routing_policy jsonb,updated_at timestamptz,deleted_at timestamptz);
    create table public.sentiment_supporting_settings(id integer,max_enabled integer);
    insert into public.sentiment_supporting_settings values(1,3);
    create table public.sentiment_training_jobs(id uuid primary key,status text,lease_until timestamptz,base_job_id uuid,snapshot jsonb);
    create table public.sentiment_training_events(job_id uuid,actor_id uuid,action text,details jsonb);`);
  for (const [id,role] of [[actor,'super_admin'],[admin,'admin']]) {
    await db.query('insert into auth.users values($1)',[id]);
    await db.query("insert into public.profiles values($1,$2,'Active','Admin','Admin')",[id,role]);
  }
  await db.exec(await readFile(new URL('../../DB_Schema/migrations/sentiment_datasets.sql',import.meta.url),'utf8'));
  const functions = await readFile(new URL('../../DB_Schema/finalized/shared/02_functions.sql',import.meta.url),'utf8');
  for (const name of ['manage_sentiment_supporting_model_independent_legacy','manage_sentiment_supporting_model','queue_approved_sentiment_training']) {
    const start = functions.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start>=0);
    await db.exec(functions.slice(start,functions.indexOf('$function$;',start)+'$function$;'.length));
  }
  await db.exec(`create trigger sentiment_dataset_approval_training after update of status on public.sentiment_datasets
    for each row when (old.status is distinct from new.status and (new.status='approved' or old.status='approved'))
    execute function public.queue_approved_sentiment_training();`);
  const migration = await readFile(new URL('../../DB_Schema/migrations/sentiment_supporting_delete_datasets.sql',import.meta.url),'utf8');
  await db.exec(migration); await db.exec(migration);
});
after(async () => db.close());

test('delete only leaves datasets active and preserves artifacts/history semantics', async () => {
  const d = await dataset(), m = await model([d]);
  await remove(m,await generation());
  assert.equal(await value('select status v from public.sentiment_supporting_models where id=$1',[m]),'deleted');
  assert.equal(await value('select status v from public.sentiment_datasets where id=$1',[d.id]),'approved');
  assert.equal(await value('select active v from public.sentiment_training_samples where dataset_id=$1',[d.id]),true);
});
test('disabled models delete directly without an archive transition or changes to other models', async () => {
  const d = await dataset(), m = await model([d],'disabled');
  const other = await model([],'enabled');
  const g = await generation();
  assert.equal((await preview(m)).modelId,m);
  await remove(m,g);
  assert.equal(await value('select status v from public.sentiment_supporting_models where id=$1',[m]),'deleted');
  assert.equal(await generation(),g+1);
  assert.equal(await value('select status v from public.sentiment_supporting_models where id=$1',[other]),'enabled');
  assert.equal(await value('select status v from public.sentiment_datasets where id=$1',[d.id]),'approved');
  const events=(await db.query('select action from public.sentiment_training_events where job_id=$1',[m])).rows;
  assert.deepEqual(events.map(row=>row.action),['support_delete']);
  assert.ok(await value('select deleted_at v from public.sentiment_supporting_models where id=$1',[m]));
});
test('disabled models can optionally archive explicitly selected datasets in the same deletion', async () => {
  const d = await dataset(), m = await model([d],'disabled');
  await remove(m,await generation(),[d]);
  assert.equal(await value('select status v from public.sentiment_supporting_models where id=$1',[m]),'deleted');
  assert.equal(await value('select status v from public.sentiment_datasets where id=$1',[d.id]),'archived');
});
test('explicit selection archives only chosen linked datasets, retaining samples and audit', async () => {
  const selected = await dataset(), kept = await dataset(), m = await model([selected,kept]);
  const revision = await value('select data_revision v from public.sentiment_model_state where id=1');
  const result = await remove(m,await generation(),[selected]);
  assert.deepEqual(result.archivedDatasetIds,[selected.id]);
  assert.equal(await value('select status v from public.sentiment_datasets where id=$1',[selected.id]),'archived');
  assert.equal(await value('select version v from public.sentiment_datasets where id=$1',[selected.id]),2);
  assert.equal(await value('select active v from public.sentiment_training_samples where dataset_id=$1',[selected.id]),false);
  assert.equal(await value('select status v from public.sentiment_datasets where id=$1',[kept.id]),'approved');
  assert.match(await value("select details->>'note' v from public.sentiment_dataset_events where dataset_id=$1 and action='archived'",[selected.id]),new RegExp(m));
  assert.equal(await value('select data_revision v from public.sentiment_model_state where id=1'),revision+1);
  assert.equal(await value('select count(*)::integer v from public.sentiment_training_jobs'),0);
});
test('preview flags shared datasets regardless of other model status or version', async () => {
  for (const status of ['enabled','disabled','archived']) {
    const d = await dataset(), m = await model([d]);
    await model([{...d,version:99}],status);
    assert.equal((await preview(m)).datasets[0].shared,true);
    await assert.rejects(remove(m,await generation(),[d]),{code:'22023'});
    assert.equal(await value('select status v from public.sentiment_supporting_models where id=$1',[m]),'archived');
  }
});
test('deleted models no longer block optional archive', async () => {
  const d = await dataset(), m = await model([d]); await model([d],'deleted');
  assert.equal((await preview(m)).datasets[0].shared,false);
  await remove(m,await generation(),[d]);
});
test('updated, unrelated, duplicate and stale dataset selections leave model untouched', async () => {
  const d = await dataset(), unrelated = await dataset(), m = await model([d]);
  for (const [selection,code] of [[[unrelated],'22023'],[[d,d],'22023'],[[{...d,version:2}],'40001']]) {
    await assert.rejects(remove(m,await generation(),selection),{code});
  }
  await db.query('update public.sentiment_datasets set version=2 where id=$1',[d.id]);
  assert.equal((await preview(m)).datasets[0].unchanged,false);
  await assert.rejects(remove(m,await generation(),[{...d,version:2}]),{code:'22023'});
  assert.equal(await value('select status v from public.sentiment_supporting_models where id=$1',[m]),'archived');
});
test('new sharing after preview is rechecked at confirmation', async () => {
  const d = await dataset(), m = await model([d]); const p = await preview(m);
  await model([d],'disabled');
  await assert.rejects(remove(m,p.generation,[d]),{code:'22023'});
});
test('role, stale generation, model state and live training checks remain enforced', async () => {
  const d = await dataset(), m = await model([d]);
  await assert.rejects(preview(m,admin),{code:'42501'});
  await assert.rejects(remove(m,await generation(),[d],admin),{code:'42501'});
  await assert.rejects(remove(m,-1,[d]),{code:'40001'});
  const enabled = await model([],'enabled');
  await assert.rejects(preview(enabled),{code:'22023'});
  await assert.rejects(remove(enabled,await generation()),{code:'22023'});
  assert.equal(await value('select status v from public.sentiment_supporting_models where id=$1',[enabled]),'enabled');
  await db.query("insert into public.sentiment_training_jobs values($1,'training',now()+interval '5 minutes',$2,'{}')",[randomUUID(),m]);
  await assert.rejects(remove(m,await generation(),[d]),{code:'22023'});
  assert.equal(await value('select status v from public.sentiment_datasets where id=$1',[d.id]),'approved');
});
test('disabled models still enforce permissions, current generation and live-job protection', async () => {
  const d = await dataset(), m = await model([d],'disabled');
  await assert.rejects(remove(m,await generation(),[],admin),{code:'42501'});
  await assert.rejects(remove(m,-1),{code:'40001'});
  await db.query("insert into public.sentiment_training_jobs values($1,'evaluating',now()+interval '5 minutes',null,$2)",
    [randomUUID(),JSON.stringify({supporting_models:[{id:m}]})]);
  await assert.rejects(remove(m,await generation()),{code:'22023'});
  assert.equal(await value('select status v from public.sentiment_supporting_models where id=$1',[m]),'disabled');
});
test('dataset archive failure rolls model deletion and preceding archives back', async () => {
  const d = await dataset(), second = await dataset(), m = await model([d,second]);
  await db.exec(`create function public.fail_archive() returns trigger language plpgsql as $$ begin
    if new.status='archived' and new.name='Fail archive' then raise exception 'test failure' using errcode='22023'; end if;
    return new; end $$; create trigger fail_archive before update on public.sentiment_datasets for each row execute function public.fail_archive();`);
  await db.query("update public.sentiment_datasets set name='Fail archive' where id=$1",[second.id]);
  const g = await generation();
  await assert.rejects(remove(m,g,[d,second]),{code:'22023'});
  assert.equal(await generation(),g);
  assert.equal(await value('select status v from public.sentiment_supporting_models where id=$1',[m]),'archived');
  assert.equal(await value('select status v from public.sentiment_datasets where id=$1',[d.id]),'approved');
  assert.equal(await value('select count(*)::integer v from public.sentiment_dataset_events where dataset_id=$1',[d.id]),0);
});
test('browser roles cannot call preview or combined mutation directly', async () => {
  for (const role of ['anon','authenticated']) for (const signature of [
    'public.sentiment_supporting_delete_preview(uuid,uuid)',
    'public.delete_sentiment_supporting_with_datasets(uuid,uuid,bigint,jsonb)',
  ]) assert.equal(await value('select has_function_privilege($1,$2,\'execute\') v',[role,signature]),false);
});
