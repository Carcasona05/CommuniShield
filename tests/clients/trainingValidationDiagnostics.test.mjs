import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluationLanguages } from '../../clients/services/trainingEvaluation.js';

function metrics() {
  const validation = {macro_f1:.65,per_class:Object.fromEntries(['negative','neutral','positive'].map(label=>
    [label,{precision:label==='neutral'?.42:.8,recall:.7,support:20,f1:.6}]))};
  return {admission:'independent-v1',passed:false,requested_languages:['filipino'],routing_policy:{scope_version:1,
    independent_test:{languages:{filipino:{passed:false,failure_stage:'validation_selection',
      validation_metrics:validation,validation_diagnostics:{version:1,trials:[{representative:{metrics:validation}}]},
      reasons:['Validation: neutral: precision below 0.50'],test_evaluated:false,test_acceptance_evaluated:false}}}}};
}
test('rejected Filipino shows the exact failed validation gate, without fake missing test results',()=>{
  const languages=evaluationLanguages(metrics());
  const filipino=languages.find(row=>row.language==='filipino');
  assert.equal(filipino.status,'failed');
  assert.deepEqual(filipino.failed.map(row=>row.id),['Validation-neutral precision']);
  assert.equal(filipino.failed[0].value,.42); assert.equal(filipino.failed[0].minimum,.5);
  assert.equal(filipino.missing.length,0);
  assert.equal(filipino.rows.length,10);
  assert.ok(filipino.rows.every(row=>row.id.startsWith('Validation-')));
  assert.ok(filipino.diagnostics);
  assert.equal(languages.find(row=>row.language==='english').status,'skipped');
});
test('legacy generic failures remain failed and missing, not invented scores',()=>{
  const value=metrics();
  const evidence=value.routing_policy.independent_test.languages.filipino;
  delete evidence.validation_metrics; delete evidence.validation_diagnostics;
  const filipino=evaluationLanguages(value).find(row=>row.language==='filipino');
  assert.equal(filipino.status,'failed'); assert.ok(filipino.missing.length>0);
  assert.equal(filipino.diagnostics,null);
});
