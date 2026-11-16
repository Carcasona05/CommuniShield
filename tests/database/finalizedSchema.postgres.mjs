import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { postgres, applySources, catalog, directory, root, build } from '../../DB_Schema/finalized/build.mjs';
import { validateInventory } from '../../DB_Schema/finalized/inventory.mjs';

let source, fresh, expected;
before(async () => {
  source = await postgres(); fresh = await postgres();
  await applySources(source); expected = await catalog(source);
   await applySources(fresh);
});
after(async()=>{await source?.close();await fresh?.close();});

test('fresh split install matches all 39 supplied tables, types and nullability',async()=>{
  assert.deepEqual(await catalog(fresh),expected);
   validateInventory(expected);
   assert.equal(expected.tables.length,39);
   assert.equal(expected.functions.length,50);
   assert.deepEqual((await fresh.query("select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' order by enumsortorder")).rows.map(r=>r.enumlabel),['user','admin','super_admin']);
});
test('generated SQL and provenance manifest are reproducible and current',async()=>{
  await build({check:true});
});
test('all literal backend RPC calls resolve to exported functions with service-role access',async()=>{
  const files = await readdir(resolve(root,'server/src'), { recursive:true });
  const calls = new Set();
  for (const file of files.filter(f=>f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
    const text=await readFile(resolve(root,'server/src',file),'utf8');
    for (const match of text.matchAll(/\.rpc\(\s*["']([^"']+)["']/g)) calls.add(match[1]);
  }
  assert.ok(calls.size>=20);
  for (const name of calls) {
    const functions=expected.functions.filter(f=>f.name===name);
    assert.ok(functions.length,`Missing backend RPC: ${name}`);
    for (const f of functions) assert.ok(expected.functionGrants.some(g=>g.name===name && g.arguments===f.arguments && ['PUBLIC','service_role'].includes(g.grantee)),`Service role cannot call ${name}`);
  }
});
test('client policy commands have grants; no private worker table exposes client access',async()=>{
  for(const p of expected.policies) for(const role of ['anon','authenticated']) {
    if (!p.roles.includes('public') && !p.roles.includes(role)) continue;
    assert.ok(expected.tableGrants.some(g=>g.table_name===p.table_name && g.grantee===role && g.privilege===p.cmd),`${role} cannot use policy ${p.name}`);
  }
  for(const name of ['sentiment_training_jobs','sentiment_training_samples','sentiment_model_state','sentiment_supporting_models','credibility_usage','credibility_report_effects','credibility_suspensions','comment_sentiment_jobs','admin_analysis_jobs','admin_analysis_batches','admin_analysis_batch_jobs','admin_blotters']) {
    assert.equal(expected.tables.find(t=>t.name===name).rls,true,name);
    assert.equal(expected.tableGrants.some(g=>g.table_name===name && ['PUBLIC','anon','authenticated'].includes(g.grantee)),false,name);
  }
  assert.ok(expected.policies.some(p=>p.table_name==='app_settings' && p.name==='read_app_settings'));
});
test('primary and supplied unique keys are preserved',()=>{
  const composite={report_likes:['report_id','user_id'],credibility_usage:['kind','source_id'],credibility_report_effects:['report_id','event_type'],admin_analysis_batch_jobs:['batch_id','job_id']};
  const single={system_settings:'key',notification_report_status:'notification_id',notification_nearby_incident:'notification_id',comment_sentiment_jobs:'comment_id'};
  for(const table of expected.tables){
    const pk=expected.constraints.find(c=>c.table_name===table.name && c.type==='p');
    const cols=composite[table.name] || [single[table.name] || 'id'];
    assert.ok(pk,table.name);
    assert.equal(pk.definition,`PRIMARY KEY (${cols.join(', ')})`,table.name);
  }
  for(const [table,column] of [['incident_categories','name'],['notification_types','name'],['emergency_facilities','name'],['user_credibility','user_id'],['report_credibility_analysis','report_id'],['admin_blotters','blotter_no']]) {
    assert.ok(expected.constraints.some(c=>c.table_name===table && c.type==='u' && c.definition===`UNIQUE (${column})`),`${table}.${column}`);
  }
});
test('real authenticated role can update only its report and read only its notifications',async()=>{
  const db=await postgres();
  try {
    await applySources(db);
    const a=randomUUID(), b=randomUUID(), ar=randomUUID(), br=randomUUID();
    await db.query('insert into auth.users(id) values($1),($2)',[a,b]);
    await db.query('insert into public.reports(id,user_id,details) values($1,$2,\'A\'),($3,$4,\'B\')',[ar,a,br,b]);
    await db.query("insert into public.sentiment_analysis(subject_type,subject_id,status,label) values('report',$1,'succeeded','positive'),('report',$2,'succeeded','neutral')",[ar,br]);
    await db.query("insert into public.notifications(user_id,type_id,title) select u.id,t.id,'Fixture' from auth.users u cross join public.notification_types t where t.name='system'");
    await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
      grant usage on schema auth to authenticated;`);
    await db.query("select set_config('test.user',$1,false)",[a]);
    await db.exec("set request.jwt.claim.role='authenticated'; set role authenticated");
    assert.equal((await db.query('select id from public.reports')).rows.length,2);
    assert.equal((await db.query("update public.reports set details='Own edit' where id=$1 returning id",[ar])).rows.length,1);
    assert.equal((await db.query("update public.reports set details='Forbidden' where id=$1 returning id",[br])).rows.length,0);
    assert.deepEqual((await db.query('select subject_id from public.sentiment_analysis')).rows,[{subject_id:br}],'own edit invalidates only its cached analysis');
    await assert.rejects(db.query("update public.reports set status='Verified' where id=$1",[ar]),/Only admins/);
    assert.equal((await db.query('select user_id from public.notifications')).rows.length,1);
    assert.equal((await db.query('select user_id from public.notifications')).rows[0].user_id,a);
    await assert.rejects(db.query('select * from public.admin_analysis_jobs'),/permission denied/);
    await assert.rejects(db.query('select * from public.sentiment_training_samples'),/permission denied/);
  } finally { await db.close(); }
});
test('ordered per-table files install successfully and pass read-only checks',async()=>{
  const db = await postgres();
  try {
    const manifest = JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
    const tableFiles = manifest.schema_install_order.filter(name => name.startsWith('tables/'));
    assert.deepEqual(tableFiles,expected.tables.map(table => `tables/${table.name}.sql`));
    const scripts = await Promise.all(manifest.schema_install_order.map(name => readFile(resolve(directory,name),'utf8')));
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
   await assert.rejects(applySources(fresh),/Application tables already exist/);
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
