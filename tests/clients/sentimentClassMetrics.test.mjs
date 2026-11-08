import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { evaluationMetricSummaries } from '../../clients/services/trainingEvaluation.js';

const scores = (precision=.48) => ({macro_f1:.65,per_class:{
  negative:{precision:.7,recall:.8,support:120},
  neutral:{precision,recall:.55,support:90},
  positive:{precision:.8,recall:.7,support:150},
}});

test('Filipino rejected during validation gets all three class scores from stored diagnostics, not test labels',()=>{
  const validation=scores();
  const metrics={requested_languages:['english','filipino'],languages:{english:{candidate:scores(.72)}},
    routing_policy:{scope_version:1,independent_test:{languages:{filipino:{passed:false,failure_stage:'validation_selection',
      validation_diagnostics:{version:1,representative:{metrics:validation}}}}}}};
  const summaries=evaluationMetricSummaries(metrics);
  assert.equal(summaries.length,2);
  const filipino=summaries.find(row=>row.language==='filipino');
  assert.equal(filipino.split,'Validation'); assert.equal(filipino.diagnostic,true);
  assert.equal(filipino.macroF1,.65);
  assert.deepEqual(filipino.labels.map(row=>row.label),['negative','neutral','positive']);
  assert.equal(filipino.labels[1].precision,.48); assert.equal(filipino.labels[1].recall,.55);
  assert.equal(summaries.find(row=>row.language==='english').split,'Test');
});
test('registered supporting model can use a separate routing policy and retain failed-language scores',()=>{
  const metrics={languages:{english:{candidate:scores(.74)}}};
  const policy={independent_test:{languages:{filipino:{passed:false,validation_metrics:scores()}}}};
  const filipino=evaluationMetricSummaries(metrics,policy).find(row=>row.language==='filipino');
  assert.equal(filipino.split,'Validation'); assert.equal(filipino.labels[1].precision,.48);
});
test('test scores take precedence over validation and remain visible even when qualification fails',()=>{
  const metrics={languages:{filipino:{candidate:scores(.44),validation:scores(.9)}},
    routing_policy:{independent_test:{languages:{filipino:{passed:false}}}}};
  const row=evaluationMetricSummaries(metrics)[0];
  assert.equal(row.split,'Test'); assert.equal(row.diagnostic,false); assert.equal(row.labels[1].precision,.44);
});
test('old generic Filipino failure appears explicitly with missing scores, never fabricated zeroes',()=>{
  const metrics={routing_policy:{independent_test:{languages:{filipino:{passed:false,
    failure_stage:'validation_selection',reasons:['No fitted candidate met validation quality requirements.']}}}}};
  const row=evaluationMetricSummaries(metrics)[0];
  assert.equal(row.language,'filipino'); assert.equal(row.split,null); assert.equal(row.macroF1,null);
  assert.ok(row.labels.every(label=>label.precision===null&&label.recall===null&&label.support===null));
});
test('unrecorded test evaluation is not displayed as a test result and legacy per_label metrics are supported',()=>{
  const validation={macro_f1:.6,per_label:{neutral:{precision:0,recall:.5,support:10}}};
  const metrics={languages:{filipino:{candidate:scores(),validation}},routing_policy:{independent_test:{languages:{
    filipino:{test_evaluated:false}}}}};
  const row=evaluationMetricSummaries(metrics)[0];
  assert.equal(row.split,'Validation'); assert.equal(row.labels[1].precision,0);
  assert.equal(row.labels[1].support,10);
});
test('invalid metric types and unincluded languages do not produce misleading scores',()=>{
  const metrics={requested_languages:['filipino'],languages:{english:{candidate:scores()},filipino:{candidate:{
    macro_f1:NaN,per_class:{neutral:{precision:'0.9',recall:1.3,support:-1}}}}},routing_policy:{scope_version:1}};
  const rows=evaluationMetricSummaries(metrics);
  assert.equal(rows.length,1); assert.equal(rows[0].language,'filipino'); assert.equal(rows[0].macroF1,null);
  assert.equal(rows[0].labels[1].precision,null); assert.equal(rows[0].labels[1].recall,null);
});
test('both evaluation surfaces use the shared per-class summary with larger dark typography',()=>{
  for (const name of ['SupportingModelsPanel','TrainingEvaluation']) {
    const source=readFileSync(new URL(`../../clients/components/Admin_compo/${name}.jsx`,import.meta.url),'utf8');
    assert.match(source,/<SentimentClassMetrics metrics=/);
    assert.match(source,/note: \{ fontSize: 13, lineHeight: 21,.*#475569/);
  }
  const source=readFileSync(new URL('../../clients/components/Admin_compo/SentimentClassMetrics.jsx',import.meta.url),'utf8');
  assert.match(source,/Validation|summary.split/);
  assert.match(source,/not a qualified model/);
  assert.match(source,/fontFamily: "PoppinsSemiBold"/);
  assert.match(source,/Precision/); assert.match(source,/Recall/);
});
