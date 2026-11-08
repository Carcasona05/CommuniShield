import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { MANUAL_DATASET_LIMIT, createManualDraft, manualEntryComplete, manualEntryChanged, clearManualEntry,
  stageManualEntry, editManualEntry, removeManualEntry, finishManualSubmission, manualRowsPayload } from '../../clients/services/manualDatasetDraft.js';

const source=readFileSync(new URL('../../clients/components/Admin_compo/SentimentDatasetManager.jsx',import.meta.url),'utf8');
const table=readFileSync(new URL('../../clients/components/Admin_compo/SentimentManualTable.jsx',import.meta.url),'utf8');
const first={text:'Helpful volunteers',language:'english',label:'positive'};
const second={text:'Bukas ang pulong.',language:'filipino',label:'neutral'};
const plain=value=>JSON.parse(JSON.stringify(value));
const staged=()=>stageManualEntry({...createManualDraft(),entry:first},1);
function body(name,args) {
  const match=source.match(new RegExp(`const ${name} = ${args} => \\{([\\s\\S]*?)\\n  \\};`));
  assert.ok(match,name);return match[1];
}
test('Add to dataset stages one complete entry, clears text and sentiment, and retains language',()=>{
  const state=staged();assert.deepEqual(state.rows,[{...first,draftId:1}]);
  assert.deepEqual(state.entry,{text:'',language:'english',label:''});
  assert.equal(state.editingId,null);assert.equal(manualEntryChanged(state),false);
  const next=stageManualEntry({...state,entry:second},2);
  assert.deepEqual(next.rows,[{...first,draftId:1},{...second,draftId:2}]);
  assert.equal(next.entry.language,'filipino');
});
test('partial entries cannot be staged; language retention alone is not an unadded change',()=>{
  for(const entry of [{text:' ',language:'english',label:'neutral'},{...first,language:''},{...first,label:''}]){
    const state={...createManualDraft(),entry};
    assert.equal(manualEntryComplete(entry),false);assert.equal(stageManualEntry(state,1),state);
  }
  assert.equal(manualEntryChanged({...createManualDraft(),entry:{text:'',language:'filipino',label:''}}),false);
  assert.equal(manualEntryChanged({...createManualDraft(),entry:{text:'pending',language:'filipino',label:''}}),true);
});
test('Edit loads the shared form; saving replaces the row in place with the same ID',()=>{
  let state=editManualEntry(staged(),1);
  assert.equal(state.editingId,1);assert.deepEqual(state.entry,first);
  assert.equal(manualEntryChanged(state),false);
  state={...state,entry:{...state.entry,text:'Very helpful volunteers'}};
  assert.equal(manualEntryChanged(state),true);
  state=stageManualEntry(state,999);
  assert.equal(state.rows.length,1);assert.equal(state.rows[0].draftId,1);
  assert.equal(state.rows[0].text,'Very helpful volunteers');assert.equal(state.editingId,null);
});
test('unsaved form input is not silently replaced by Edit or Remove',()=>{
  const state={...staged(),entry:second};
  assert.equal(editManualEntry(state,1),state);
  const editing={...editManualEntry(staged(),1),entry:{...first,text:'Unsaved edit'}};
  assert.equal(removeManualEntry(editing,1),editing);
  const cancelled=clearManualEntry(editing);
  assert.equal(cancelled.rows[0].text,first.text);assert.equal(cancelled.entry.language,'english');
});
test('all staged rows can be removed; deleting another row keeps the current input',()=>{
  const state={...staged(),entry:second};const next=removeManualEntry(state,1);
  assert.deepEqual(next.rows,[]);assert.deepEqual(next.entry,second);
});
test('the existing batch limit still allows edits without adding rows',()=>{
  const rows=Array.from({length:MANUAL_DATASET_LIMIT},(_,i)=>({...first,draftId:i+1}));
  const state={rows,entry:second,editingId:null};assert.equal(stageManualEntry(state,1001),state);
  const edit={...state,editingId:1};const result=stageManualEntry(edit,1001);
  assert.equal(result.rows.length,1000);assert.equal(result.rows[0].draftId,1);
  assert.equal(result.rows[0].language,'filipino');
});
test('successful submission clears staged rows but retains deliberately excluded input or edits',()=>{
  assert.deepEqual(finishManualSubmission({...staged(),entry:second}),{rows:[],entry:second,editingId:null});
  const editing={...editManualEntry(staged(),1),entry:{...first,text:'Unsaved changes'}};
  assert.equal(finishManualSubmission(editing).entry.text,'Unsaved changes');
  assert.deepEqual(finishManualSubmission(staged()).entry,{text:'',language:'english',label:''});
});
test('preview with dirty input asks for a choice; clean staged rows preview directly',()=>{
  const calls=[];let state={...staged(),entry:second};
  const context={busy:false,manualSamples:state.rows,manualDraft:state,manualEntryChanged,clearManualEntry,
    setManualPrompt:value=>calls.push(value),setManualDraft:update=>{state=update(state);},makePreview:(...args)=>calls.push(args)};
  const run=vm.runInNewContext(`(()=>{${body('requestManualPreview','\\(\\)')}})`,context);
  run();assert.deepEqual(calls,['preview']);
  context.manualDraft=staged();run();assert.deepEqual(plain(calls[1]),[true]);
});
test('Add & preview uses the newly staged row immediately, not an old React-state snapshot',()=>{
  let state={...staged(),entry:second};const calls=[];
  const context={addManualSample:()=>{state=stageManualEntry(state,2);return state.rows;},
    setManualPrompt:value=>calls.push(value),makePreview:(manual,rows)=>calls.push({manual,rows:plain(rows)})};
  vm.runInNewContext(`(()=>{${body('addAndPreview','\\(\\)')}})`,context)();
  assert.equal(calls[0],null);assert.equal(calls[1].manual,true);
  assert.deepEqual(calls[1].rows,[{...first,draftId:1},{...second,draftId:2}]);
});
test('manual preview strips draft IDs; CSV preview stays unchanged',async()=>{
  const calls=[];const context={manualSamples:staged().rows,manualRowsPayload,csv:'csv content',
    setError(){},setBusy(){},resetPreview(){},setSource(){},setName(){},setMode(){},setPreview(){},fail(error){throw error;},
    apiClient:{post:async(path,payload)=>{calls.push({path,payload:plain(payload)});return {data:{rows:[]}};}}};
  const run=vm.runInNewContext(`(async(manual=false,manualRows=manualSamples)=>{${body('makePreview','async \\(manual = false, manualRows = manualSamples\\)')}})`,context);
  await run(true);await run(false);
  assert.deepEqual(calls[0].payload,{rows:[first]});assert.deepEqual(calls[1].payload,{csv:'csv content'});
});
test('submission sends only previewed rows, keeps unadded form input, and preserves drafts on failure',async()=>{
  async function run(fail=false,sourceType='manual'){
    let draft={...staged(),entry:second};const calls=[];
    const context={source:sourceType,name:' Batch ',privateChecked:true,
      preview:{rows:[{...first,status:'valid'}]},finishManualSubmission,
      setManualDraft:update=>{draft=update(draft);},setBusy(){},setError(){},setMode(){},resetPreview(){},
      setActiveTab(){},setDatasetTab(){},setStatus(){},setPages(){},tell(){},load:async()=>{},fail(){},
      apiClient:{post:async(path,payload)=>{calls.push({path,payload:plain(payload)});if(fail)throw Error('offline');}}};
    await vm.runInNewContext(`(async()=>{${body('save','async \\(\\)')}})`,context)();
    return {draft,calls};
  }
  const saved=await run();
  assert.deepEqual(saved.calls[0].payload,{name:'Batch',source:'manual',rows:[first],privacy_reviewed:true});
  assert.deepEqual(saved.draft.rows,[]);assert.deepEqual(saved.draft.entry,second);
  assert.equal((await run(true)).draft.rows.length,1);
  assert.equal((await run(false,'csv')).draft.rows.length,1);
});
test('single entry form and responsive staged table replace stacked forms',()=>{
  const addSection=source.slice(source.indexOf('{activeTab === "add"'),source.indexOf('{activeTab === "datasets"'));
  assert.equal((addSection.match(/<SampleFields /g)||[]).length,1);
  assert.match(addSection,/title="Preview dataset"/);assert.match(addSection,/"Add to dataset"/);
  assert.match(addSection,/disabled=\{busy \|\| !manualSamples.length\}/);
  assert.match(source,/Preview added rows only/);assert.match(source,/Your unadded input will be kept/);
  assert.match(table,/const compact = width < 640/);assert.match(table,/PAGE_SIZE = 20/);
  assert.match(table,/key=\{row.draftId\}/);assert.match(table,/Text \/ phrase/);
  assert.match(table,/onEdit\(row.draftId\)/);assert.match(table,/onRemove\(row.draftId\)/);
});
