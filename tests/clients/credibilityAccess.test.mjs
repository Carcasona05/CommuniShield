import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
const text = path => readFileSync(new URL(`../../clients/${path}`, import.meta.url),'utf8');
function preflight(access, complete=true) {
  const calls=[], notices=[], profiles=[];
  const context=vm.createContext({
    AsyncStorage:{getItem:async()=> 'token'},
    apiClient:{get:async path=>{calls.push(path);return {data:path==='/profile/completion'?{complete,missing:['Birthdate']}:access};}},
    notifyProfileRequirement:missing=>profiles.push(missing),notifyCredibilityNotice:message=>notices.push(message),
  });
  vm.runInContext(text('services/profileCompletion.js').replace(/^import .*;\r?\n/gm,'').replace('export async function','async function')+'\nglobalThis.run=ensureCompleteProfile;',context);
  return {context,calls,notices,profiles};
}
test('profile completion still runs before credibility preflight',async()=>{
  const p=preflight({},false); assert.equal(await p.context.run(),false);assert.equal(p.calls.length,1);assert.equal(p.profiles.length,1);
});
test('reports, comments and edits use their own current access flags',async()=>{
  const p=preflight({reportAllowed:false,commentAllowed:true,editAllowed:true});
  assert.equal(await p.context.run('report'),false);
  assert.equal(await p.context.run('comment'),true);
  assert.equal(await p.context.run('edit'),true);
  assert.equal(p.notices.length,1);
});
test('suspension and low-score commenting show recovery guidance',async()=>{
  let p=preflight({suspended:true,reportAllowed:false,suspension:{endsAt:'2026-11-05T12:00:00Z'}});await p.context.run();assert.match(p.notices[0],/automatically after expiry/);
  p=preflight({suspended:false,commentAllowed:false,commentLimit:0});await p.context.run('comment');assert.match(p.notices[0],/at least 40/);
});
test('account change during access lookup never submits or shows a previous account notice',async()=>{
  const p=preflight({reportAllowed:false});let reads=0;p.context.AsyncStorage.getItem=async()=>++reads<3?'token':'new-token';
  assert.equal(await p.context.run(),false);assert.equal(p.notices.length,0);
});
test('timed suspension uses automatic access checks without a submission form',()=>{
  for(const path of ['components/Admin_compo/Admin_Layout.jsx','components/SAdmin_Compo/SAdmin_Layout.jsx']) {
    const navigation=text(path);
    assert.match(navigation,/label: "Report\s+Management",\s+route: "\/\((?:sadmin|admin)\)\/(?:SAdmin|Admin)_Validation"/);
  }
  assert.match(text('app/(tabs)/User_ProfileSettings.jsx'),/<CredibilityAccessPanel onAccessChange=\{handleAccessChange\} \/>/);
  assert.match(text('components/CredibilityAccessPanel.jsx'),/testID="timed-suspension-details"/);
  assert.doesNotMatch(text('components/CredibilityAccessPanel.jsx'),/apiClient.post/);
  assert.doesNotMatch(text('components/CredibilityAccessPanel.jsx'),/ensureCompleteProfile/);
  assert.match(text('app/(tabs)/_layout.jsx'),/<CredibilityNotice \/>/);
});
