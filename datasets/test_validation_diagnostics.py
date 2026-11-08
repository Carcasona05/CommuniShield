import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from unittest.mock import Mock

import numpy as np
import pandas as pd

import train_sentiment as trainer
import sentiment_training_worker as worker
import continue_sentiment as continued
from independent_support import evaluate as evaluate_independent
from validation_diagnostics import observe, report, sanitize


def metric(precision=.42):
    return {'macro_f1': .65, 'per_class': {
        label: {'precision': precision if label == 'neutral' else .8,
                'recall': .7, 'f1': .6, 'support': 20}
        for label in trainer.LABELS}}


def diagnostic():
    trial = {'c': 1.0, 'class_weight': 'balanced'}
    observe(trial, metric(), dict.fromkeys(trainer.LABELS, 0.0))
    return report([trial])


class ValidationDiagnosticsTests(unittest.TestCase):
    def test_diagnostics_do_not_change_selection_and_record_failed_class(self):
        y = pd.Series(list(trainer.LABELS) * 12)
        decisions = np.tile([.0, 1.0, .0], (len(y), 1))
        trial = {'c': 1, 'class_weight': None}
        before = trainer.select_validation_offsets(decisions, trainer.LABELS, y, independent_quality=True)
        after = trainer.select_validation_offsets(decisions, trainer.LABELS, y, independent_quality=True, diagnostics=trial)
        self.assertIsNone(before); self.assertIsNone(after)
        self.assertEqual(trial['settings_evaluated'], len(trainer.LOGIT_OFFSETS) ** 2)
        self.assertEqual(trial['eligible_settings'], 0)
        self.assertTrue(trial['representative']['failures'])
        self.assertEqual(set(trial['representative']['metrics']['per_class']), set(trainer.LABELS))

    def test_passing_selection_is_unchanged(self):
        y = pd.Series(list(trainer.LABELS) * 12)
        decisions = np.tile(np.eye(3) * 10, (12, 1))
        trial = {}
        before = trainer.select_validation_offsets(decisions, trainer.LABELS, y, independent_quality=True)
        after = trainer.select_validation_offsets(decisions, trainer.LABELS, y, independent_quality=True, diagnostics=trial)
        self.assertEqual(before, after)
        self.assertEqual(trial['eligible_settings'], len(trainer.LOGIT_OFFSETS) ** 2)

    def test_too_few_examples_are_reported_without_passing(self):
        y = pd.Series(list(trainer.LABELS) * 2)
        trial = {}
        selected = trainer.select_validation_offsets(np.tile(np.eye(3) * 10, (2, 1)), trainer.LABELS, y,
                                                      independent_quality=True, diagnostics=trial)
        self.assertIsNone(selected)
        self.assertEqual(trial['eligible_settings'], 0)
        self.assertTrue(any('fewer than 10' in reason for reason in trial['representative']['failures']))

    def test_sanitizer_strips_private_fields_and_regenerates_reasons(self):
        value = diagnostic()
        value['private_text'] = 'PRIVATE SENTINEL'
        value['trials'][0]['text'] = 'PRIVATE SENTINEL'
        value['trials'][0]['representative']['failures'] = ['PRIVATE SENTINEL']
        clean = sanitize(value)
        self.assertNotIn('PRIVATE SENTINEL', json.dumps(clean))
        self.assertEqual(clean['representative']['failures'], ['Validation: neutral: precision below 0.50'])
        for invalid in [None, {'version': 1, 'split': 'validation', 'trials': [None]},
                        {**value, 'trials': value['trials'] * 33}]:
            self.assertIsNone(sanitize(invalid))
        bad = copy.deepcopy(value)
        bad['trials'][0]['representative']['metrics']['macro_f1'] = float('nan')
        self.assertIsNone(sanitize(bad))

    def test_worker_preserves_safe_diagnostics_and_legacy_failures(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            marker = {'kind': 'validation_quality', 'language': 'filipino', 'completed_languages': [],
                      'reasons': ['PRIVATE SENTINEL'], 'validation_diagnostics': diagnostic()}
            (directory / 'training_failure.json').write_text(json.dumps(marker), encoding='utf-8')
            found = worker.training_quality_failure(directory)
            self.assertEqual(found[3]['representative']['metrics']['per_class']['neutral']['precision'], .42)
            self.assertNotIn('PRIVATE SENTINEL', json.dumps(found))
            marker.pop('validation_diagnostics')
            (directory / 'training_failure.json').write_text(json.dumps(marker), encoding='utf-8')
            self.assertIsNone(worker.training_quality_failure(directory)[3])

    def test_scoped_worker_transports_failed_validation_diagnostics(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            output = directory / 'language-candidates' / 'filipino'
            output.mkdir(parents=True)
            (output / 'training_failure.json').write_text(json.dumps({
                'kind': 'validation_quality', 'language': 'filipino', 'completed_languages': [],
                'validation_diagnostics': diagnostic()}), encoding='utf-8')
            process = Mock(returncode=2); process.poll.return_value = 2
            with patch.object(worker.subprocess, 'Popen', return_value=process):
                failures = worker.run_scoped_training(['python', '--output-dir', 'placeholder'],
                    directory / 'candidate', ['filipino'], directory, Mock())
            result = evaluate_independent({}, directory / 'candidate', {}, ['filipino'], failures)
            check = result['routing_policy']['independent_test']['languages']['filipino']
            self.assertEqual(check['validation_metrics']['per_class']['neutral']['precision'], .42)
            self.assertFalse(check['passed'])
            self.assertFalse(list((directory / 'candidate').glob('*.onnx')))

    def test_continued_rejection_records_strengths_without_changing_active_state(self):
        from sklearn.pipeline import Pipeline
        frame = pd.DataFrame([{'text': words + f' entry {i}', 'label': label}
            for label, words in [('negative', 'terrible danger'), ('neutral', 'meeting notice'),
                                 ('positive', 'excellent wonderful')] for i in range(12)])
        pipeline = Pipeline([('features', trainer.build_vectorizer()), ('classifier', trainer.build_classifier(1))])
        pipeline.fit(frame.text, frame.label)
        before = [row.coef_.copy() for row in pipeline.named_steps['classifier'].estimators_]
        rejected = {'macro_f1': .65, 'per_label': metric()['per_class']}
        with patch.object(continued, 'evaluate', return_value=rejected):
            with self.assertRaises(continued.ContinuedQualityError) as raised:
                continued.continue_pipeline(pipeline, frame, frame, frame, None)
        evidence = sanitize(raised.exception.diagnostics)
        self.assertEqual(len(evidence['trials']), len(continued.UPDATE_STRENGTHS))
        self.assertEqual(evidence['representative']['failures'], ['Validation: neutral: precision below 0.50'])
        for original, estimator in zip(before, pipeline.named_steps['classifier'].estimators_):
            np.testing.assert_array_equal(original, estimator.coef_)

    def test_rejected_language_receipt_contains_validation_only_and_cannot_qualify(self):
        with patch('independent_support.probabilities', side_effect=AssertionError('must not score test or missing model')):
            result = evaluate_independent({}, Path('missing'), {}, ['filipino'],
                                          {'filipino': {'validation_diagnostics': diagnostic()}})
        check = result['routing_policy']['independent_test']['languages']['filipino']
        self.assertFalse(result['passed']); self.assertFalse(check['passed'])
        self.assertEqual(result['qualified_languages'], [])
        self.assertEqual(check['reasons'], ['Validation: neutral: precision below 0.50'])
        self.assertFalse(check['test_evaluated'])
        self.assertNotIn('metrics', check)
        self.assertEqual(check['validation_metrics']['per_class']['neutral']['precision'], .42)

    def test_failed_training_exception_preserves_per_configuration_diagnostics(self):
        # Real tiny fits; no model export and no held-out test access.
        frame = pd.DataFrame([{'text': 'identical shared ' + ('alpha' if i % 2 else 'beta'), 'language': 'filipino',
                               'label': label, 'split': 'train'} for label in trainer.LABELS for i in range(12)])
        validation = frame.copy(); validation['split'] = 'validation'
        with tempfile.TemporaryDirectory() as temporary, patch.object(trainer, 'CANDIDATES', (1.0,)):
            with self.assertRaises(trainer.TrainingQualityError) as raised:
                trainer.train_language('filipino', frame, validation, pd.DataFrame(), Path(temporary),
                                       independent_quality=True, evaluate_test=False)
            diagnostics = raised.exception.diagnostics
            self.assertEqual(len(diagnostics['trials']), 2)
            self.assertTrue(diagnostics['representative']['failures'])
            self.assertIsNotNone(sanitize(diagnostics))
            self.assertFalse(list(Path(temporary).glob('*.onnx')))


if __name__ == '__main__':
    unittest.main()
