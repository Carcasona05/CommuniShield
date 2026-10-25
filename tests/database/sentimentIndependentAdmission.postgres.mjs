import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const actor = '10000000-0000-4000-8000-000000000001';
const ordinary = '10000000-0000-4000-8000-000000000002';
const names = ['sentiment_english.onnx','sentiment_filipino.onnx','sentiment_cebuano.onnx','language_id.onnx'];
const hashes = Object.fromEntries(names.map(n => [n, 'a'.repeat(64)]));
const call = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
const state = () => call('select to_jsonb(s) value from public.sentiment_model_state s where id=1');
const worker = (action, job = null, payload = {}) => call('select public.sentiment_training_worker($1,$2,$3,$4) value', [action,job?.id || null,job?.lease_token || null,JSON.stringify(payload)]);
async function approve(count = 1, name = 'One-row fixture') {
  const rows = Array.from({length:count}, () => { const text=randomUUID(); return {text,language:'cebuano',label:'positive',text_key:createHash('sha256').update(text).digest('hex')}; });
  const result = await call("select public.manage_sentiment_dataset($1,'submit',$2) value", [actor, JSON.stringify({name,source:'manual',privacy_reviewed:true,rows})]);
  await call("select public.manage_sentiment_dataset($1,'approve',$2) value",[actor,JSON.stringify({dataset_id:result.id,version:1})]);
  return result.id;
}
async function queue() {
  await call("select public.manage_sentiment_training($1,'queue',null,null,'{\"mode\":\"fresh\"}') value",[actor]);
  await db.exec("update public.sentiment_training_jobs set available_at=now()-interval '1 second' where status='queued'");
  return worker('claim',null,{pool_protocol:1,worker_protocol:'supporting-pool-v2',admission_protocol:'independent-v1',builtin_hashes:hashes});
}
const metric = () => ({macro_f1:.7, per_class:Object.fromEntries(['negative','neutral','positive'].map(l => [l,{support:50,precision:.7,recall:.7}]))});
const rule = () => ({primary_confidence:.85,primary_margin:.2,support_confidence:.6,support_margin:.1,validation_precision:.8,validation_support:30});
function policy() {
  return {version:2,admission:'independent-v1',passed:true,builtin_hashes:hashes,evaluated_pool_ids:[],
    languages:Object.fromEntries(['cebuano','english','filipino'].map(l => [l,rule()])),
    independent_test:{passed:true,languages:Object.fromEntries(['cebuano','english','filipino'].map(l => [l,{passed:true,metrics:metric(),validation_metrics:metric(),precision:.8,support:20}]))}};
}
function payload(job) {
  const file = name => ({path:`${job.id}/${job.lease_token}/${name}`,sha256:'b'.repeat(64),size:10});
  return {metrics:{passed:true,admission:'independent-v1',pool_protocol:1,training_mode:'fresh',routing_policy:policy()},manifest:{
    files:Object.fromEntries(names.map(n => [n,file(n)])),training_files:Object.fromEntries(['cebuano','english','filipino'].map(l => [`sentiment_${l}.joblib`,file(`sentiment_${l}.joblib`)]))}};
}
async function complete() { const job = await queue(); await worker('evaluating',job); await worker('complete',job,payload(job)); return job; }
async function manage(action, id, user = actor, generation = null) {
  return call('select public.manage_sentiment_supporting_model($1,$2,$3,$4,$5) value', [user,action,id,generation ?? (await state()).generation,JSON.stringify({builtin_hashes:hashes})]);
}
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key,role text,status text,fullname text,user_name text);
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const [id,role] of [[actor,'super_admin'],[ordinary,'admin']]) {
    await db.query('insert into auth.users values ($1)',[id]);
    await db.query("insert into public.profiles values ($1,$2,'Active','Test','test')",[id,role]);
  }
  for (const name of ['sentiment_datasets.sql','sentiment_training_jobs.sql','sentiment_continued_training.sql','sentiment_supporting_pool.sql','sentiment_fresh_candidates.sql','sentiment_independent_admission.sql','sentiment_independent_admission.sql','sentiment_pending_training_summary.sql','sentiment_pending_training_summary.sql']) {
    await db.exec(await readFile(new URL(`../../DB_Schema/migrations/${name}`,import.meta.url),'utf8'));
  }
});
beforeEach(async () => {
  await db.exec(`update public.sentiment_model_state set active_job_id=null,previous_job_id=null,generation=0,data_revision=0;
    delete from public.sentiment_supporting_models; delete from public.sentiment_training_events; delete from public.sentiment_training_jobs;
    delete from public.sentiment_dataset_events; delete from public.sentiment_training_samples; delete from public.sentiment_datasets;
    update public.sentiment_supporting_settings set max_enabled=3;`);
});
after(async () => db.close());

test('one-row approval accumulates reviewed data and never queues training', async () => {
  await approve();
  assert.equal((await db.query('select * from public.sentiment_training_jobs')).rows.length,0);
  const summary = await call('select public.sentiment_training_pool_summary() value');
  assert.equal(summary.approvedExamples,1); assert.equal(summary.newExamples,1);
  assert.equal(summary.languages.cebuano.positive,1);
  assert.equal((await state()).data_revision,1);
});
test('empty pools cannot queue; claims reject stale workers', async () => {
  await assert.rejects(call("select public.manage_sentiment_training($1,'queue') value",[actor]), {code:'22023'});
  await approve();
  await assert.rejects(worker('claim',null,{pool_protocol:1,worker_protocol:'supporting-pool-v2',builtin_hashes:hashes}), {code:'22023'});
});
test('absolute quality passes without a baseline score but always registers disabled', async () => {
  await approve(); const job = await complete();
  const row = (await db.query('select * from public.sentiment_supporting_models where id=$1',[job.id])).rows[0];
  assert.equal(row.status,'disabled');
  assert.equal(row.routing_policy.version,2);
  assert.equal((await state()).active_job_id,null);
  assert.equal((await call('select public.sentiment_training_pool_summary() value')).newExamples,0);
  await manage('enable',job.id);
  assert.equal((await db.query('select status from public.sentiment_supporting_models where id=$1',[job.id])).rows[0].status,'enabled');
});
test('minimum evidence, per-class quality and validation/test precision are enforced by SQL', async () => {
  await approve(); const job = await queue(); await worker('evaluating',job);
  for (const mutate of [
    p => { p.independent_test.languages.english.metrics.macro_f1=.59; },
    p => { p.independent_test.languages.english.metrics.per_class.neutral.recall=.49; },
    p => { p.independent_test.languages.english.validation_metrics.per_class.positive.precision=.49; },
    p => { p.independent_test.languages.english.metrics.per_class.positive.support=1; },
    p => { p.independent_test.languages.english.precision=.74; },
    p => { p.independent_test.languages.english.support=9; },
    p => { p.languages.english.validation_support=19; },
    p => { p.languages.english.validation_precision=.74; },
    p => { delete p.languages.english; },
    p => { delete p.independent_test.languages.english.metrics; },
    p => { p.languages.english.primary_confidence=1; },
    p => { p.languages.english.validation_support='30'; },
  ]) {
    const body = payload(job); mutate(body.metrics.routing_policy);
    await assert.rejects(worker('complete',job,body),{code:'22023'});
  }
  assert.equal((await db.query('select * from public.sentiment_supporting_models')).rows.length,0);
  const missingArtifact = payload(job);
  delete missingArtifact.manifest.training_files['sentiment_english.joblib'];
  await assert.rejects(worker('complete',job,missingArtifact),{code:'22023'});
  await worker('complete',job,payload(job));
});
test('manual enable enforces role, generation, pool cap, evidence and immutable built-in fingerprint', async () => {
  await approve(); const jobs = [];
  for (let i=0;i<4;i++) jobs.push(await complete());
  await assert.rejects(manage('enable',jobs[0].id,ordinary),{code:'42501'});
  await assert.rejects(manage('enable',jobs[0].id,actor,-1),{code:'40001'});
  await assert.rejects(call('select public.manage_sentiment_supporting_model($1,\'enable\',$2,$3,\'{}\') value',[actor,jobs[0].id,(await state()).generation]),{code:'22023'});
  for (const j of jobs.slice(0,3)) await manage('enable',j.id);
  await assert.rejects(manage('enable',jobs[3].id),{code:'22023'});
  await manage('disable',jobs[0].id);
  assert.equal((await db.query("select * from public.sentiment_supporting_models where status='enabled'")).rows.length,2);
  await manage('archive',jobs[0].id); await manage('restore',jobs[0].id);
  assert.equal((await state()).active_job_id,null);
});
test('data changes still fence completions, and browser roles cannot bypass private helpers', async () => {
  await approve(); const job = await queue(); await worker('evaluating',job); await approve();
  await assert.rejects(worker('complete',job,payload(job)),{code:'40001'});
  for (const role of ['anon','authenticated','service_role']) {
    const permitted = await call("select has_function_privilege($1,'public.sentiment_training_worker_independent_legacy(text,uuid,uuid,jsonb)','execute') value",[role]);
    assert.equal(permitted,false);
  }
  const c = await call('select public.sentiment_training_capabilities() value');
  assert.equal(c.independent_admission,true); assert.equal(c.manual_enable,true); assert.equal(c.manual_training,true);
});
test('independent admission does not depend on the previously enabled pool combination', async () => {
  await approve(); const first = await complete();
  const next = await queue(); await worker('evaluating',next);
  await manage('enable',first.id);
  await worker('complete',next,payload(next));
  const rows = (await db.query('select id,status from public.sentiment_supporting_models order by created_at')).rows;
  assert.equal(rows.find(r => r.id === first.id).status,'enabled');
  assert.equal(rows.find(r => r.id === next.id).status,'disabled');
  assert.equal((await state()).active_job_id,null);
});
test('ready-to-queue summary shows 180 new approvals, not 200 including already-trained examples', async () => {
  await approve(20,'Already trained'); await complete();
  const fresh = await approve(180,'New approval');
  const summary = await call('select public.sentiment_training_pool_summary() value');
  assert.equal(summary.approvedExamples,200);
  assert.equal(summary.readyToQueueExamples,180);
  assert.equal(summary.newExamples,180);
  assert.equal(summary.readyToQueueDatasets,1);
  assert.equal(summary.languages.cebuano.total,180);
  assert.deepEqual(summary.readyDatasets.map(d => d.id),[fresh]);
  const job = await queue();
  assert.equal((await call('select public.sentiment_training_pool_summary() value')).readyToQueueExamples,0);
  await worker('fail',job,{error:'Quality gate failed after fitting',metrics:{training:{models:[]},passed:false}});
  assert.equal((await call('select public.sentiment_training_pool_summary() value')).readyToQueueExamples,0,
    'a quality-rejected but already-trained dataset is not advertised as newly approved');
});
test('failed-before-training jobs do not consume pending approvals; pending and archived datasets are excluded', async () => {
  const id = await approve(20);
  const job = await queue();
  await worker('fail',job,{error:'Trainer could not start'});
  assert.equal((await call('select public.sentiment_training_pool_summary() value')).readyToQueueExamples,20);
  await call("select public.manage_sentiment_dataset($1,'archive',$2) value",[actor,JSON.stringify({dataset_id:id,version:2})]);
  const summary = await call('select public.sentiment_training_pool_summary() value');
  assert.equal(summary.readyToQueueExamples,0); assert.deepEqual(summary.readyDatasets,[]);
});
