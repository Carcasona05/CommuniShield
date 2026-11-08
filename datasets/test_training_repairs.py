import csv
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from sklearn.pipeline import Pipeline
from skl2onnx import to_onnx
from skl2onnx.common.data_types import StringTensorType

from continued_validation import prepare, verify
from import_approved_sentiment import text_key
from portable_sentiment_features import adapt_pipeline, verify_export, pin_padding
from train_sentiment import build_classifier, build_vectorizer, export_onnx


class TrainingRepairsTests(unittest.TestCase):
    def fixture(self, root, examples_per_class=12):
        original, snapshot = root / 'original', root / 'snapshot'
        original.mkdir(); snapshot.mkdir()
        columns = ['text', 'language', 'label', 'split']
        def write(path, rows):
            with path.open('w', encoding='utf-8', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=columns); writer.writeheader(); writer.writerows(rows)
        for split in ('train', 'validation', 'test'):
            rows = [{'text': f'original {split} {label}', 'language': 'filipino', 'label': label, 'split': split}
                    for label in ('negative', 'neutral', 'positive')]
            write(original / f'{split}.csv', rows); write(snapshot / f'{split}.csv', rows)
        additions = [{'text': f'genuinely new {label} sample {i}', 'language': 'filipino', 'label': label, 'split': 'train'}
                     for label in ('negative', 'neutral', 'positive') for i in range(examples_per_class)]
        with (snapshot / 'train.csv').open(encoding='utf-8') as handle: training = list(csv.DictReader(handle))
        write(snapshot / 'train.csv', training + additions)
        (snapshot / 'approved_training_samples.json').write_text(json.dumps(additions), encoding='utf-8')
        return original, snapshot

    def test_continued_validation_is_new_disjoint_and_keeps_sources_and_test_unchanged(self):
        with tempfile.TemporaryDirectory() as temporary:
            original, snapshot = self.fixture(Path(temporary))
            before = {p.name: p.read_bytes() for p in original.glob('*.csv')}
            receipt = prepare(snapshot, original, ['filipino'])
            self.assertEqual(receipt['validation_samples'], 30)
            self.assertEqual(receipt['training_additions'], 6)
            self.assertEqual(verify(snapshot, ['filipino']), receipt)
            self.assertEqual(before, {p.name: p.read_bytes() for p in original.glob('*.csv')})
            self.assertEqual((snapshot / 'test.csv').read_bytes(), before['test.csv'])
            with (snapshot / 'validation.csv').open() as handle: heldout = list(csv.DictReader(handle))
            with (snapshot / 'train.csv').open() as handle: training = list(csv.DictReader(handle))
            self.assertFalse({text_key(row) for row in heldout} & {text_key(row) for row in training})
            self.assertTrue(all(row['text'].startswith('genuinely new') for row in heldout))

    def test_reservation_is_deterministic_and_rejects_inadequate_or_historical_examples(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ('a', 'b'): (root / name).mkdir()
            original, first = self.fixture(root / 'a', 48)
            other_original, second = self.fixture(root / 'b', 48)
            accepted = json.loads((second / 'approved_training_samples.json').read_text())
            (second / 'approved_training_samples.json').write_text(json.dumps(list(reversed(accepted))))
            prepare(first, original, ['filipino']); prepare(second, other_original, ['filipino'])
            self.assertEqual((first / 'validation.csv').read_bytes(), (second / 'validation.csv').read_bytes())
            (first / 'validation.csv').write_text('tampered')
            with self.assertRaisesRegex(ValueError, 'changed'):
                verify(first, ['filipino'])
        with tempfile.TemporaryDirectory() as temporary:
            original, snapshot = self.fixture(Path(temporary), 10)
            before = (snapshot / 'validation.csv').read_bytes()
            with self.assertRaisesRegex(ValueError, 'at least 11'):
                prepare(snapshot, original, ['filipino'])
            self.assertEqual((snapshot / 'validation.csv').read_bytes(), before)
            with self.assertRaisesRegex(ValueError, 'missing'):
                verify(snapshot, ['filipino'])

    def test_portable_features_match_onnx_even_for_pruned_words_and_repeated_characters(self):
        import onnxruntime as ort
        texts = [f'{words} common train entry {i}' for words in (
            'terrible danger crime', 'notice schedule meeting', 'wonderful excellent helpful') for i in range(24)]
        texts += ['ending ...#hashtag another long example', 'ending ..#topic'] * 4
        texts += ['ÑANDÚ café José ÅNGSTRÖM 😡 repeated\n\t spacing'] * 4
        probes = ['danger danger crime common entry 10', 'meeting\n\t tomorrow  entry 0',
                  'ÑANDÚ café José ÅNGSTRÖM', 'a I 4 _ single-letter', 'nakakainis 😡', '', 'ending ...']
        features = build_vectorizer(3, portable=True); features.fit(texts)
        for _, vectorizer in features.transformer_list:
            model = to_onnx(vectorizer, initial_types=[('text', StringTensorType([None, 1]))], target_opset=17)
            pin_padding(model)
            session = ort.InferenceSession(model.SerializeToString(), providers=['CPUExecutionProvider'])
            values = session.run(None, {'text': np.array(probes, dtype=object).reshape(-1, 1)})[0]
            np.testing.assert_allclose(values, vectorizer.transform(probes).toarray(), atol=2e-6, rtol=2e-5)

    def test_adapter_keeps_vocabulary_and_weights_without_mutating_original(self):
        texts = ['bad bad complaint', 'ordinary meeting notice', 'good excellent help'] * 12
        labels = ['negative', 'neutral', 'positive'] * 12
        source = Pipeline([('features', build_vectorizer()), ('classifier', build_classifier(1))])
        source.fit(texts, labels)
        before = source.predict_proba(texts).copy()
        candidate = adapt_pipeline(source)
        for (_, old), (_, new) in zip(source.named_steps['features'].transformer_list, candidate.named_steps['features'].transformer_list):
            self.assertEqual(old.vocabulary_, new.vocabulary_)
            np.testing.assert_array_equal(old.idf_, new.idf_)
        for old, new in zip(source.named_steps['classifier'].estimators_, candidate.named_steps['classifier'].estimators_):
            np.testing.assert_array_equal(old.coef_, new.coef_)
        np.testing.assert_array_equal(source.predict_proba(texts), before)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'candidate.joblib'
            export_onnx(candidate, path)
            receipt = verify_export(candidate, path.with_suffix('.onnx'), texts)
            self.assertTrue(receipt['passed']); self.assertEqual(receipt['prediction_mismatches'], 0)


if __name__ == '__main__':
    unittest.main()
