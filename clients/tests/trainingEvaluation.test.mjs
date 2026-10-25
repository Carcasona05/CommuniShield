import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluationLanguages, gateValue } from '../services/trainingEvaluation.js';

const metric = () => ({ macro_f1: .722, per_class: Object.fromEntries(['negative','neutral','positive'].map(l => [l, {precision:.8,recall:.7,support:100}])) });
function fixture() {
  return { admission:'independent-v1', passed:true,
    languages:Object.fromEntries(['cebuano','english','filipino'].map(l => [l,{candidate:metric(),validation:metric()}])),
    routing_policy:{thresholds:{},languages:{},independent_test:{languages:Object.fromEntries(['cebuano','english','filipino'].map(l => [l,{
      passed:true,precision:.8,support:30,validation_acceptance:{precision:.8,support:40},reasons:[]}]))}} };
}
test('all checks, not just macro-F1, are represented for both splits', () => {
  for (const language of evaluationLanguages(fixture())) {
    assert.equal(language.status,'passed');
    assert.equal(language.rows.length,24);
    assert.equal(language.failed.length,0);
    assert.equal(language.missing.length,0);
  }
});
test('screenshot regression: macro-F1 passes while English acceptance and Filipino neutral precision fail', () => {
  const data = fixture(); data.passed=false;
  data.routing_policy.independent_test.languages.english.passed=false;
  data.routing_policy.independent_test.languages.english.precision=.72;
  data.routing_policy.independent_test.languages.filipino.passed=false;
  data.languages.filipino.validation.per_class.neutral.precision=.45;
  data.languages.filipino.candidate.per_class.neutral.precision=.46;
  const [ceb,eng,fil] = evaluationLanguages(data);
  assert.equal(ceb.status,'passed'); assert.equal(eng.status,'failed'); assert.equal(fil.status,'failed');
  assert.deepEqual(eng.failed.map(r => r.label),['Test: accepted-prediction precision']);
  assert.deepEqual(fil.failed.map(r => r.label),['Validation: neutral precision','Test: neutral precision']);
  assert.equal(eng.rows.find(r => r.id==='Test-macro-F1').status,'passed');
});
test('absent and malformed measurements never become passes or fabricated zeroes', () => {
  const data = fixture();
  delete data.languages.english.candidate.per_class.neutral.precision;
  data.languages.english.validation.macro_f1='0.8';
  data.routing_policy.independent_test.languages.english.support=null;
  const eng = evaluationLanguages(data).find(l => l.language==='english');
  assert.equal(eng.status,'missing'); assert.equal(eng.missing.length,3);
  assert.ok(eng.missing.every(r => r.value===null));
  assert.equal(gateValue(null),'Not recorded');
  assert.equal(gateValue('0.8'),'Not recorded');
});
test('historical passing policies supply recorded validation acceptance when available', () => {
  const data = fixture();
  delete data.routing_policy.independent_test.languages.english.validation_acceptance;
  data.routing_policy.languages.english={validation_precision:.8,validation_support:40};
  assert.equal(evaluationLanguages(data).find(l => l.language==='english').status,'passed');
  delete data.routing_policy.languages.english;
  assert.equal(evaluationLanguages(data).find(l => l.language==='english').missing.length,2);
});
test('skipped acceptance tests are not displayed as measured zero precision', () => {
  const data=fixture();
  Object.assign(data.routing_policy.independent_test.languages.english,{passed:false,precision:0,support:0,reasons:['No validation threshold meets 20 accepted predictions at 0.75 precision']});
  const result=evaluationLanguages(data).find(l => l.language==='english');
  assert.equal(result.status,'failed');
  assert.equal(result.rows.find(r => r.label==='Test: accepted-prediction precision').status,'missing');
  assert.equal(result.rows.find(r => r.label==='Test: accepted predictions').value,null);
});
test('recorded thresholds and exact boundaries are respected', () => {
  const data=fixture(); data.policy={minimum_macro_f1:.75};
  assert.ok(evaluationLanguages(data).every(l => l.failed.filter(r => r.label.includes('macro-F1')).length===2));
  data.policy.minimum_macro_f1=.722;
  assert.ok(evaluationLanguages(data).every(l => l.failed.length===0));
});
test('rounding does not hide a near-boundary failure and counts are not percentages', () => {
  assert.equal(gateValue(.74999,false,.75),'74.999%');
  assert.equal(gateValue(.75,false,.75),'75.0%');
  assert.equal(gateValue(9,true),'9');
});
test('unincluded languages have no fabricated failed or missing checks',()=>{
  const data=fixture();data.requested_languages=['cebuano'];data.routing_policy.scope_version=1;
  delete data.languages.english;delete data.languages.filipino;
  delete data.routing_policy.independent_test.languages.english;delete data.routing_policy.independent_test.languages.filipino;
  const results=evaluationLanguages(data);
  assert.equal(results[0].status,'passed');
  assert.ok(results.slice(1).every(l=>l.status==='skipped' && l.rows.length===0));
});
