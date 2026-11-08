import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
const source=readFileSync(new URL('../../clients/components/Admin_compo/SupportingModelsPanel.jsx',import.meta.url),'utf8');
const actionBody=source.match(/const action = async \(kind, modelId = null, limit\) => \{([\s\S]*?)\n  \};/)[1];
async function openDelete(fail=false) {
  const state={confirm:null,calls:[]};
  const context={pool:{generation:2},mounted:{current:true},setBusy:()=>{},setError:()=>{},setConfirm:value=>{state.confirm=value;},
    apiClient:{get:async(path,options)=>{state.calls.push({path,options}); if(fail) throw Error('offline'); return {data:{generation:3,datasets:[{id:'dataset',shared:true}]}};}}};
  await vm.runInNewContext(`(async(kind,modelId,limit)=>{${actionBody}})`,context)('delete','model');
  return JSON.parse(JSON.stringify(state));
}
test('delete confirmation fetches fresh linked data and starts with no datasets selected',async()=>{
  const state=await openDelete();
  assert.equal(state.calls[0].path,'/sentiment/supporting-models/model/delete-preview');
  assert.equal(state.calls[0].options.cacheMode,'network');
  assert.deepEqual(state.confirm.archiveDatasets,[]);
  assert.equal(state.confirm.generation,3);
});
test('preview failure permits model-only deletion and explains datasets are unchanged',async()=>{
  const state=await openDelete(true);
  assert.deepEqual(state.confirm.archiveDatasets,[]);
  assert.deepEqual(state.confirm.datasets,[]);
  assert.match(state.confirm.previewError,/no datasets will be archived/);
});
test('UI blocks shared, updated and archived datasets and offers an explicit model-only action',()=>{
  assert.match(source,/const blocked = dataset.shared \|\| !dataset.unchanged \|\| dataset.status === "archived"/);
  assert.match(source,/accessibilityRole="checkbox"/);
  assert.match(source,/disabled=\{blocked\}/);
  assert.match(source,/"Delete & archive" : "Delete from pool only"/);
});
test('disabled models offer Enable and Delete from pool, enabled models only Disable, archived models retain Restore/Delete',()=>{
  const disabled=source.match(/\{model.status === "disabled" \? (.*?) : null\}/)[1];
  assert.match(disabled,/button\("Enable"/);
  assert.match(disabled,/button\("Delete from pool"/);
  assert.doesNotMatch(disabled,/button\("Archive"/);
  const enabled=source.match(/\{model.status === "enabled" \? (.*?) : null\}/)[1];
  assert.match(enabled,/button\("Disable"/); assert.doesNotMatch(enabled,/Delete/);
  const archived=source.match(/\{model.status === "archived" \? (.*?) : null\}/)[1];
  assert.match(archived,/Restore to disabled/); assert.match(archived,/Delete from pool/);
  assert.match(source,/label === "Delete from pool" \? "danger"/);
});
test('confirmation sends only selected IDs/versions, not preview metadata, then refreshes the pool and training',async()=>{
  const body=source.match(/const execute = async \(\) => \{([\s\S]*?)\n  \};/)[1];
  const calls=[];
  const context={confirm:{action:'delete',modelId:'model',generation:3,archiveDatasets:[{id:'dataset',version:2}],datasets:[{name:'private preview'}]},
    setBusy:()=>{},setError:()=>{},apiClient:{post:async(path,payload)=>calls.push({path,payload:JSON.parse(JSON.stringify(payload))})},
    refresh:async(options)=>calls.push(options),onPoolChange:async()=>calls.push('training-refreshed')};
  await vm.runInNewContext(`(async()=>{${body}})`,context)();
  assert.deepEqual(calls[0].payload,{action:'delete',modelId:'model',generation:3,archiveDatasets:[{id:'dataset',version:2}]});
  assert.equal(calls[1].force,true); assert.equal(calls[2],'training-refreshed');
});
