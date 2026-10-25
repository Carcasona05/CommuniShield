import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { postgres, applySources, catalog, directory, build } from '../../DB_Schema/finalized/build.mjs';

let source, fresh, expected;
before(async () => {
  source = await postgres(); fresh = await postgres();
  await applySources(source); expected = await catalog(source);
  const schema = await readFile(resolve(directory,'01_schema.sql'),'utf8');
  await fresh.exec(schema.replace(/create extension if not exists pgcrypto;/gi,''));
  await fresh.exec(await readFile(resolve(directory,'02_reference_data.sql'),'utf8'));
});
after(async()=>{await source?.close();await fresh?.close();});

test('final fresh-install schema matches the complete migration chain, including permissions',async()=>{
  assert.deepEqual(await catalog(fresh),expected);
  assert.equal(expected.tables.length,32);
  assert.equal(expected.functions.length,25);
});
test('generated SQL and provenance manifest are reproducible and current',async()=>{
  await build({check:true});
});
test('per-table files install to the same schema as the bundle and migration chain',async()=>{
  const db = await postgres();
  try {
    const manifest = JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
    const tableFiles = manifest.schema_install_order.filter(name => name.startsWith('tables/'));
    assert.deepEqual(tableFiles,expected.tables.map(table => `tables/${table.name}.sql`));
    const scripts = await Promise.all(manifest.schema_install_order.map(name => readFile(resolve(directory,name),'utf8')));
    const bundle = await readFile(resolve(directory,'01_schema.sql'),'utf8');
    assert.equal(scripts.join('\n'),bundle);
    await db.exec(scripts.join('\n').replace(/create extension if not exists pgcrypto;/gi,''));
    assert.deepEqual(await catalog(db),expected);
    await db.exec(await readFile(resolve(directory,'02_reference_data.sql'),'utf8'));
    await db.exec(await readFile(resolve(directory,'03_verify.sql'),'utf8'));
  } finally { await db.close(); }
});
test('read-only verification works on the finalized fresh install',async()=>{
  await fresh.exec(await readFile(resolve(directory,'03_verify.sql'),'utf8'));
});
test('defaults contain no user/report/dataset/model rows and stay unchanged when reapplied',async()=>{
  for(const table of ['profiles','reports','sentiment_analysis','sentiment_datasets','sentiment_training_samples','sentiment_training_jobs','sentiment_supporting_models']) {
    assert.equal((await fresh.query(`select count(*)::int count from public.${table}`)).rows[0].count,0);
  }
  const before = (await fresh.query('select * from public.system_settings order by key')).rows;
  await fresh.exec(await readFile(resolve(directory,'02_reference_data.sql'),'utf8'));
  assert.deepEqual((await fresh.query('select * from public.system_settings order by key')).rows,before);
  assert.equal((await fresh.query("select public from storage.buckets where id='sentiment-models'")).rows[0].public,false);
  const capabilities=(await fresh.query('select public.sentiment_training_capabilities() c')).rows[0].c;
  assert.equal(capabilities.language_scoped_training,true);
  assert.equal(capabilities.manual_enable,true);
  assert.equal(capabilities.automatic_activation,false);
});
test('fresh schema guard refuses existing deployments instead of overwriting data',async()=>{
  const schema=await readFile(resolve(directory,'01_schema.sql'),'utf8');
  await assert.rejects(fresh.exec(schema.replace(/create extension if not exists pgcrypto;/gi,'')),/Application tables already exist/);
  await fresh.exec('rollback');
  assert.deepEqual(await catalog(fresh),expected);
});
test('auth triggers, one-row review, scoped queue and immutable primary work on finalized SQL',async()=>{
  const actor=randomUUID();
  await fresh.query("insert into auth.users(id,raw_user_meta_data) values($1,'{\"firstName\":\"Schema\",\"lastName\":\"Test\",\"userName\":\"fixture\"}')",[actor]);
  const profile=(await fresh.query('select fullname,role from public.profiles where id=$1',[actor])).rows[0];
  assert.deepEqual(profile,{fullname:'Schema Test',role:'user'});
  assert.equal((await fresh.query('select count(*)::int count from public.user_credibility where user_id=$1',[actor])).rows[0].count,1);
  await fresh.query("update public.profiles set role='super_admin' where id=$1",[actor]);
  const text='Excellent assistance from the schema fixture';
  const dataset=(await fresh.query("select public.manage_sentiment_dataset($1,'submit',$2) d",[actor,JSON.stringify({name:'Schema fixture',source:'manual',privacy_reviewed:true,
    rows:[{text,language:'cebuano',label:'positive',text_key:createHash('sha256').update(text).digest('hex')} ]})])).rows[0].d;
  await fresh.query("select public.manage_sentiment_dataset($1,'approve',$2)",[actor,JSON.stringify({dataset_id:dataset.id,version:1})]);
  assert.equal((await fresh.query('select count(*)::int count from public.sentiment_training_jobs')).rows[0].count,0,'approval must not auto-train');
  await fresh.query("select public.manage_sentiment_training($1,'queue',null,null,'{\"mode\":\"fresh\"}')",[actor]);
  assert.deepEqual((await fresh.query('select training_languages from public.sentiment_training_jobs')).rows[0].training_languages,['cebuano']);
  const pointers=(await fresh.query('select active_job_id,previous_job_id from public.sentiment_model_state where id=1')).rows[0];
  assert.deepEqual(pointers,{active_job_id:null,previous_job_id:null});
  for(const role of ['anon','authenticated']){
    assert.equal((await fresh.query("select has_table_privilege($1,'public.sentiment_training_samples','select') allowed",[role])).rows[0].allowed,false);
    assert.equal((await fresh.query("select has_function_privilege($1,'public.sentiment_training_worker(text,uuid,uuid,jsonb)','execute') allowed",[role])).rows[0].allowed,false);
  }
  assert.equal((await fresh.query("select has_function_privilege('service_role','public.sentiment_training_worker_scope_legacy(text,uuid,uuid,jsonb)','execute') allowed")).rows[0].allowed,false);
});
