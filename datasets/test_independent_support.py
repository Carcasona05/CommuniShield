import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
import independent_support as admission


class IndependentAdmissionTests(unittest.TestCase):
    def fixture(self, count=12):
        rows = [{'text': str(i), 'language': lang, 'label': label}
                for lang in admission.LANGUAGES for label in admission.LABELS for i in range(count)]
        return {'validation': rows, 'test': rows}

    def perfect(self, path, texts):
        count = len(texts) // 3
        return np.repeat(np.array([[.9, .05, .05], [.05, .9, .05], [.05, .05, .9]]), count, axis=0)

    def test_evaluation_uses_only_candidate_and_fixed_labels(self):
        paths = []
        def predict(path, texts):
            paths.append(path)
            return self.perfect(path, texts)
        with patch.object(admission, 'probabilities', side_effect=predict):
            result = admission.evaluate(self.fixture(), Path('candidate'), {'file': 'fingerprint'})
        self.assertTrue(result['passed'])
        self.assertEqual(len(paths), 6)
        self.assertTrue(all(p.parent == Path('candidate') for p in paths))
        self.assertNotIn('baseline', result['languages']['english'])
        self.assertEqual(result['routing_policy']['version'], 2)
        self.assertEqual(result['routing_policy']['evaluated_pool_ids'], [])
        check = result['routing_policy']['independent_test']['languages']['english']
        self.assertEqual(check['validation_acceptance']['support'], 36)
        self.assertEqual(check['validation_acceptance']['precision'], 1)
        self.assertTrue(check['test_acceptance_evaluated'])

    def test_one_row_per_class_is_not_enough_heldout_evidence(self):
        with patch.object(admission, 'probabilities', side_effect=self.perfect):
            result = admission.evaluate(self.fixture(1), Path('candidate'), {})
        self.assertFalse(result['passed'])
        self.assertTrue(any('held-out examples' in r for r in result['reasons']))

    def test_test_failure_does_not_change_validation_selected_threshold(self):
        scores = self.perfect(None, list(range(36)))
        y = np.repeat(np.arange(3), 12)
        rule = admission.calibrate(scores, y)
        check = admission.accepted(scores, (y + 1) % 3, rule['support_confidence'], rule['support_margin'])
        self.assertEqual(check['precision'], 0)
        self.assertEqual(admission.calibrate(scores, y), rule)

    def test_failed_test_keeps_validation_acceptance_measurements_for_the_ui(self):
        calls = []
        def predict(path, texts):
            calls.append(path)
            values = self.perfect(path, texts)
            return values if len(calls) % 2 else np.roll(values, 1, axis=1)
        with patch.object(admission, 'probabilities', side_effect=predict):
            result = admission.evaluate(self.fixture(), Path('candidate'), {})
        self.assertFalse(result['passed'])
        check = result['routing_policy']['independent_test']['languages']['english']
        self.assertEqual(check['validation_acceptance'], {'support': 36, 'precision': 1})
        self.assertTrue(check['test_acceptance_evaluated'])
        self.assertEqual(check['precision'], 0)
        self.assertNotIn('english', result['routing_policy']['languages'])

    def test_bad_and_missing_classes_cannot_pass(self):
        with patch.object(admission, 'probabilities', side_effect=lambda p, texts: np.tile([.9, .05, .05], (len(texts), 1))):
            result = admission.evaluate(self.fixture(), Path('candidate'), {})
        self.assertFalse(result['passed'])
        self.assertTrue(any('recall below' in r for r in result['reasons']))

    def test_validation_precision_and_minimum_counts_are_enforced(self):
        y = np.repeat(np.arange(3), 12)
        uniform = np.tile([1/3, 1/3, 1/3], (36, 1))
        self.assertIsNone(admission.calibrate(uniform, y))
        self.assertIsNone(admission.calibrate(self.perfect(None, [1, 2, 3]), np.arange(3)))

    def test_validation_selection_rejects_a_barely_passing_precision_estimate(self):
        scores=np.tile([.9,.05,.05],(1000,1))
        fragile=np.array([0]*750+[1]*250)
        self.assertIsNone(admission.calibrate(scores,fragile))
        robust=np.array([0]*850+[1]*150)
        rule=admission.calibrate(scores,robust)
        self.assertIsNotNone(rule)
        self.assertGreaterEqual(rule['validation_precision_lower_bound'],.75)
        self.assertEqual(admission.POLICY['minimum_accepted_precision'],.75,'the test gate is not weakened')

    def test_invalid_probability_distributions_fail_closed(self):
        for values in ([.9, .8, .8], [float('nan'), .5, .5], [1.1, 0, -.1]):
            with patch.object(admission, 'probabilities', side_effect=lambda p, texts: np.tile(values, (len(texts), 1))):
                with self.assertRaisesRegex(ValueError, 'probabilities'):
                    admission.evaluate(self.fixture(), Path('candidate'), {})

    def test_every_single_pair_and_triple_language_scope_is_isolated(self):
        import itertools
        for size in (1,2,3):
            for group in itertools.combinations(admission.LANGUAGES,size):
                paths=[]
                def predict(path,texts):
                    paths.append(path.name)
                    return self.perfect(path,texts)
                with patch.object(admission,'probabilities',side_effect=predict):
                    result=admission.evaluate(self.fixture(),Path('candidate'),{},list(reversed(group)))
                self.assertTrue(result['passed'])
                self.assertEqual(result['qualified_languages'],sorted(group))
                self.assertEqual(set(paths),{f'sentiment_{l}.onnx' for l in group})
                self.assertEqual(len(paths),2*size)

    def test_failed_language_does_not_block_qualified_language_or_get_scored_as_builtin(self):
        with patch.object(admission,'probabilities',side_effect=self.perfect) as predict:
            result=admission.evaluate(self.fixture(),Path('candidate'),{},['cebuano','filipino'],{'filipino':['Validation failed']})
        self.assertTrue(result['passed'])
        self.assertTrue(result['partial_pass'])
        self.assertEqual(result['qualified_languages'],['cebuano'])
        self.assertEqual(predict.call_count,2)
        self.assertNotIn('filipino',result['routing_policy']['languages'])
        with patch.object(admission,'probabilities',side_effect=AssertionError('must not read artifacts')):
            result=admission.evaluate(self.fixture(),Path('candidate'),{},['filipino'],{'filipino':['Validation failed']})
        self.assertFalse(result['passed'])
        self.assertEqual(result['qualified_languages'],[])


if __name__ == '__main__':
    unittest.main()
