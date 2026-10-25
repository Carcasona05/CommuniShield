import assert from 'node:assert/strict';
import {before,beforeEach,after,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const actor='10000000-0000-4000-8000-000000000001';
const langs=['cebuano','english','filipino'];
const names=['language_id.onnx',...langs.map(l=>`sentiment_${l}.onnx`)];
const hashes=Object.fromEntries(names.map(n=>[n,'a'.repeat(64)]));
const call=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.v;
const worker=(action,job=null,payload={})=>call('select public.sentiment_training_worker($1,$2,$3,$4) v',[action,job?.id||null,job?.lease_token||null,JSON.stringify(payload)]);
const state=()=>call('select generation v from public.sentiment_model_state where id=1');
async function approve(languages){
  const rows=languages.map(language=>{const text=randomUUID();return {text,language,label:'positive',text_key:createHash('sha256').update(text).digest('hex')};});
  const d=await call("select public.manage_sentiment_dataset($1,'submit',$2) v",[actor,JSON.stringify({name:'Scope fixture',source:'csv',privacy_reviewed:true,rows})]);
  await call("select public.manage_sentiment_dataset($1,'approve',$2) v",[actor,JSON.stringify({dataset_id:d.id,version:1})]);
  return d.id;
}
async function queue(ids){
  await call("select public.manage_sentiment_training($1,'queue',null,null,$2) v",[actor,JSON.stringify({mode:'fresh',...(ids?{dataset_ids:ids}:{})})]);
  await db.exec("update public.sentiment_training_jobs set available_at=now()-interval '1 second' where status='queued'");
  return worker('claim',null,{pool_protocol:1,worker_protocol:'supporting-pool-v2',admission_protocol:'independent-v1',language_scope_protocol:1,builtin_hashes:hashes});
}
const metric=()=>({macro_f1:.7,per_class:Object.fromEntries(['negative','neutral','positive'].map(l=>[l,{support:40,precision:.7,recall:.7}]))});
function payload(job,qualified){
  qualified=[...qualified].sort();
  const checks=Object.fromEntries(job.snapshot.requested_languages.map(l=>[l,qualified.includes(l)?{passed:true,metrics:metric(),validation_metrics:metric(),precision:.8,support:30}:{passed:false,reasons:['Quality failed']} ]));
  const policy={version:2,scope_version:1,requested_languages:job.snapshot.requested_languages,admission:'independent-v1',passed:true,builtin_hashes:hashes,evaluated_pool_ids:[],
    languages:Object.fromEntries(qualified.map(l=>[l,{primary_confidence:.85,primary_margin:.2,support_confidence:.6,support_margin:.1,validation_precision:.8,validation_support:30}])),
    independent_test:{passed:true,languages:checks}};
  const file=name=>({path:`${job.id}/${job.lease_token}/${name}`,sha256:'b'.repeat(64),size:10});
  return {metrics:{passed:true,admission:'independent-v1',pool_protocol:1,training_mode:'fresh',requested_languages:job.snapshot.requested_languages,qualified_languages:qualified,routing_policy:policy},
    manifest:{languages:qualified,files:Object.fromEntries(['language_id.onnx',...qualified.map(l=>`sentiment_${l}.onnx`)].map(n=>[n,file(n)])),training_files:Object.fromEntries(qualified.map(l=>[`sentiment_${l}.joblib`,file(`sentiment_${l}.joblib`)]))}};
}
before(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key,role text,status text,fullname text,user_name text);
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  await db.query('insert into auth.users values ($1)',[actor]);
  await db.query("insert into public.profiles values ($1,'super_admin','Active','Test','test')",[actor]);
  for(const name of ['sentiment_datasets.sql','sentiment_training_jobs.sql','sentiment_continued_training.sql','sentiment_supporting_pool.sql','sentiment_fresh_candidates.sql','sentiment_independent_admission.sql','sentiment_pending_training_summary.sql','sentiment_language_scoped_training.sql','sentiment_language_scoped_training.sql']) await db.exec(await readFile(new URL(`../../DB_Schema/migrations/${name}`,import.meta.url),'utf8'));
});
beforeEach(async()=>db.exec(`update public.sentiment_model_state set active_job_id=null,previous_job_id=null,generation=0,data_revision=0;
  delete from public.sentiment_supporting_models; delete from public.sentiment_training_events; delete from public.sentiment_training_jobs;
  delete from public.sentiment_dataset_events; delete from public.sentiment_training_samples; delete from public.sentiment_datasets;`));
after(async()=>db.close());
for(const combination of [['cebuano'],['english'],['filipino'],['english','cebuano'],['filipino','english'],['filipino','cebuano'],['filipino','english','cebuano']]){
  test(`declared dataset languages ${combination.join('+')} determine scope and qualify separately`,async()=>{
    await approve(combination); const job=await queue();
    assert.deepEqual(job.snapshot.requested_languages,[...combination].sort());
    await worker('evaluating',job);
    const body=payload(job,[combination[0]]);
    await worker('complete',job,body);
    const row=(await db.query('select status,routing_policy from public.sentiment_supporting_models where id=$1',[job.id])).rows[0];
    assert.equal(row.status,'disabled');
    assert.deepEqual(Object.keys(row.routing_policy.languages),[combination[0]]);
    await call("select public.manage_sentiment_supporting_model($1,'enable',$2,$3,$4) v",[actor,job.id,await state(),JSON.stringify({builtin_hashes:hashes})]);
    assert.equal((await db.query('select status from public.sentiment_supporting_models where id=$1',[job.id])).rows[0].status,'enabled');
    assert.equal(await call('select active_job_id v from public.sentiment_model_state where id=1'),null);
  });
}
test('older attempted mixed uploads do not force new Cebuano-only work to train every language',async()=>{
  await approve(langs); const old=await queue(); await worker('fail',old,{error:'old failure'});
  const id=await approve(['cebuano']); const job=await queue();
  assert.deepEqual(job.snapshot.requested_languages,['cebuano']);
  assert.ok(job.snapshot.samples.some(r=>r.language==='filipino'),'prior approved examples remain in snapshot, not in fitting scope');
  await worker('fail',job,{error:'retry'});
  const retry=await queue();assert.deepEqual(retry.snapshot.requested_languages,['cebuano']);
  await worker('fail',retry,{error:'retry again'});
  const explicit=await queue([id]); assert.deepEqual(explicit.snapshot.requested_languages,['cebuano']);
});
test('scope cannot be broadened by a completion payload or weak evidence',async()=>{
  await approve(['cebuano']);const job=await queue();await worker('evaluating',job);
  const outside=payload(job,['english']);
  await assert.rejects(worker('complete',job,outside),{code:'22023'});
  const weak=payload(job,['cebuano']);weak.metrics.routing_policy.independent_test.languages.cebuano.precision=.74;
  await assert.rejects(worker('complete',job,weak),{code:'22023'});
  const absent=payload(job,['cebuano']);delete absent.manifest.training_files['sentiment_cebuano.joblib'];
  await assert.rejects(worker('complete',job,absent),{code:'22023'});
  const zero=payload(job,[]);await assert.rejects(worker('complete',job,zero),{code:'22023'});
  await worker('complete',job,payload(job,['cebuano']));
});
test('outdated workers are rejected and private wrappers cannot bypass checks',async()=>{
  await assert.rejects(worker('claim',null,{}),{code:'22023'});
  for(const role of ['anon','authenticated','service_role']) assert.equal(await call("select has_function_privilege($1,'public.sentiment_training_worker_scope_legacy(text,uuid,uuid,jsonb)','execute') v",[role]),false);
});
