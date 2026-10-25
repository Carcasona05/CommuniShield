"""Selection must preserve classes without fitting or selecting on holdouts."""
import tempfile
import hashlib
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

import train_sentiment as trainer


class TrainingSelectionTests(unittest.TestCase):
    def test_cli_validation_rejection_writes_a_safe_failure_marker(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            args = SimpleNamespace(data_dir=root, output_dir=root, baseline_model_dir=None,
                                   independent_quality=True, validation_only=True, languages=None)
            frames = {'train':self.frames('train'), 'validation':self.frames('validation')}
            with patch.object(trainer,'parse_args',return_value=args), \
                 patch.object(trainer,'load_splits',return_value=frames), \
                 patch.object(trainer,'train_language',side_effect=trainer.TrainingQualityError('cebuano',['Quality floor not met'])):
                with self.assertRaises(SystemExit) as caught:
                    trainer.main()
            self.assertEqual(caught.exception.code, 2)
            marker=json.loads((root/'training_failure.json').read_text())
            self.assertEqual(marker['kind'],'validation_quality')
            self.assertEqual(marker['language'],'cebuano')
            self.assertEqual(marker['completed_languages'],[])
            self.assertFalse((root/'baseline_metrics.json').exists())

    def test_validation_offsets_protect_negative_recall(self):
        labels = ["negative", "negative", "neutral", "neutral", "positive", "positive"]
        decisions = [[0.1, 0.2, 0], [0.1, 0.3, 0], [0, 0.8, 0], [0, 0.9, 0], [0, 0.1, 0.8], [0, 0.1, 0.9]]
        reference = {"macro_f1": 1.0, "per_label": {label: {"recall": 1.0} for label in trainer.LABELS}}
        result = trainer.select_validation_offsets(decisions, trainer.LABELS, labels, reference)
        self.assertIsNotNone(result)
        self.assertEqual(result["macro_f1"], 1.0)
        self.assertGreater(result["offsets"]["negative"], 0)
        self.assertEqual(result["offsets"]["neutral"], 0)

    def test_impossible_validation_constraints_fail_instead_of_relaxing(self):
        labels = list(trainer.LABELS)
        reference = {"macro_f1": 1.0, "per_label": {label: {"recall": 1.0} for label in labels}}
        self.assertIsNone(trainer.select_validation_offsets(np.zeros((3, 3)), labels, labels, reference))

    def test_no_reference_keeps_zero_offsets(self):
        result = trainer.select_validation_offsets(np.eye(3), trainer.LABELS, trainer.LABELS)
        self.assertEqual(result["offsets"], dict.fromkeys(trainer.LABELS, 0.0))

    def test_independent_selection_requires_precision_recall_and_support_for_every_class(self):
        labels = [l for l in trainer.LABELS for _ in range(12)]
        decisions = np.repeat([[.1,.2,0],[0,.8,0],[0,.2,.1]],12,axis=0)
        result = trainer.select_validation_offsets(decisions,trainer.LABELS,labels,independent_quality=True)
        self.assertIsNotNone(result)
        self.assertEqual(result['macro_f1'],1)
        self.assertEqual(result['precision_floors'],dict.fromkeys(trainer.LABELS,.5))
        self.assertIsNone(trainer.select_validation_offsets(np.eye(3),trainer.LABELS,trainer.LABELS,independent_quality=True))
        self.assertIsNone(trainer.select_validation_offsets(np.zeros((36,3)),trainer.LABELS,labels,independent_quality=True))
        with self.assertRaisesRegex(ValueError,'built-in'):
            trainer.select_validation_offsets(decisions,trainer.LABELS,labels,{'macro_f1':1},independent_quality=True)

    def test_invalid_scores_or_missing_classes_are_rejected(self):
        with self.assertRaises(ValueError):
            trainer.select_validation_offsets([[float("nan")] * 3] * 3, trainer.LABELS, trainer.LABELS)
        with self.assertRaises(ValueError):
            trainer.select_validation_offsets(np.eye(3), trainer.LABELS, ["negative"] * 3)

    def frames(self, split, rotate=False):
        rows = []
        for index, label in enumerate(trainer.LABELS):
            for n in range(3):
                rows.append({"text": f"{label} vocabulary {split}onlytoken entry{n}",
                             "language": "cebuano", "label": trainer.LABELS[(index + 1) % 3] if rotate else label,
                             "split": split})
        return pd.DataFrame(rows)

    def run_tiny_training(self, destination, rotate_test=False):
        with patch.object(trainer, "CANDIDATES", (1.0,)), \
             patch.object(trainer, "build_vectorizer", side_effect=lambda: TfidfVectorizer()) as build, \
             patch.object(trainer, "export_onnx", return_value={"artifact_path": "test.onnx"}), \
             patch.object(trainer.joblib, "dump") as dump:
            result = trainer.train_language("cebuano", self.frames("train"), self.frames("validation"),
                                            self.frames("test", rotate_test), destination)
            self.assertEqual(build.call_count, 1, "never rebuild/refit on validation")
            artifact = dump.call_args.args[0]
            return result, artifact["pipeline"]

    def test_only_training_rows_fit_features_and_classifier(self):
        with tempfile.TemporaryDirectory() as temporary:
            metadata, model = self.run_tiny_training(Path(temporary))
            vocabulary = model.named_steps["features"].vocabulary_
            self.assertIn("trainonlytoken", vocabulary)
            self.assertNotIn("validationonlytoken", vocabulary)
            self.assertNotIn("testonlytoken", vocabulary)
            self.assertEqual(metadata["training_samples"], 9)
            self.assertEqual(metadata["fit_splits"], ["train"])
            self.assertEqual(metadata["calibration"]["selection_split"], "validation")

    def test_changing_test_labels_cannot_change_selected_model(self):
        with tempfile.TemporaryDirectory() as temporary:
            first, model_a = self.run_tiny_training(Path(temporary))
            second, model_b = self.run_tiny_training(Path(temporary), rotate_test=True)
            self.assertEqual(first["best_c"], second["best_c"])
            self.assertEqual(first["calibration"], second["calibration"])
            for left, right in zip(model_a.named_steps["classifier"].estimators_, model_b.named_steps["classifier"].estimators_):
                np.testing.assert_array_equal(left.coef_, right.coef_)
                np.testing.assert_array_equal(left.intercept_, right.intercept_)
            self.assertNotEqual(first["test_metrics"], second["test_metrics"])

    def test_baseline_reference_only_receives_validation_rows(self):
        validation = self.frames("validation")
        reference = trainer.evaluate(validation["label"], validation["label"])
        with tempfile.TemporaryDirectory() as temporary, \
             patch.object(trainer, "CANDIDATES", (1.0,)), \
             patch.object(trainer, "build_vectorizer", side_effect=lambda: TfidfVectorizer()), \
             patch.object(trainer, "baseline_validation_metrics", return_value=reference) as baseline, \
             patch.object(trainer, "export_onnx", return_value={"artifact_path": "test.onnx"}), \
             patch.object(trainer.joblib, "dump"):
            folder = Path(temporary)
            result = trainer.train_language("cebuano", self.frames("train"), validation,
                                            self.frames("test"), folder, folder / "active")
            self.assertEqual(baseline.call_args.args[0], folder / "active/sentiment_cebuano.onnx")
            self.assertTrue(baseline.call_args.args[1]["split"].eq("validation").all())
            self.assertEqual(result["calibration"]["baseline_validation"], reference)

    def test_reference_metadata_must_match_artifact_and_holdout(self):
        frame = self.frames("validation")
        frame.attrs["source_sha256"] = "frozen-validation"
        metrics = trainer.evaluate(frame["label"], frame["label"])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            served, recorded = root / "served", root / "recorded"
            served.mkdir()
            recorded.mkdir()
            name = "sentiment_cebuano.onnx"
            (served / name).write_bytes(b"matching-model")
            (recorded / name).write_bytes(b"matching-model")
            manifest = {"models": [{"language": "cebuano", "validation_metrics": metrics}],
                        "input_split_hashes": {"validation": "frozen-validation"},
                        "onnx_hashes": {name: hashlib.sha256(b"matching-model").hexdigest()}}
            metadata = recorded / "baseline_metrics.json"
            metadata.write_text(json.dumps(manifest), encoding="utf-8")
            with patch.object(trainer, "MODEL_DIR", recorded):
                self.assertEqual(trainer.baseline_validation_metrics(served / name, frame), metrics)
                frame.attrs["source_sha256"] = "changed-validation"
                with self.assertRaisesRegex(ValueError, "validation file changed"):
                    trainer.baseline_validation_metrics(served / name, frame)
                frame.attrs["source_sha256"] = "frozen-validation"
                (served / name).write_bytes(b"different-model")
                with self.assertRaisesRegex(ValueError, "metadata matching"):
                    trainer.baseline_validation_metrics(served / name, frame)

    def test_validation_only_training_never_touches_the_test_argument(self):
        with tempfile.TemporaryDirectory() as temporary, \
             patch.object(trainer,'CANDIDATES',(1.0,)), \
             patch.object(trainer,'build_vectorizer',side_effect=lambda:TfidfVectorizer()), \
             patch.object(trainer,'export_onnx',return_value={'artifact_path':'test.onnx'}), \
             patch.object(trainer.joblib,'dump'):
            result=trainer.train_language('cebuano',self.frames('train'),self.frames('validation'),object(),Path(temporary),evaluate_test=False)
        self.assertIsNone(result['test_metrics'])
        self.assertFalse(result['test_evaluated'])

    def test_validation_only_loader_does_not_require_or_read_test_csv(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            for split in ('train','validation'):
                self.frames(split).to_csv(root/f'{split}.csv',index=False)
            (root/'test.csv').write_text('THIS FILE MUST NOT BE READ',encoding='utf-8')
            frames=trainer.load_splits(root,include_test=False)
            self.assertEqual(set(frames),{'train','validation'})

    def test_independent_selection_is_unchanged_by_test_labels(self):
        def frame(split, rotate=False):
            return pd.DataFrame([{'text':f'{label} vocabulary {split} row{n}', 'language':'cebuano',
                                  'label':trainer.LABELS[(i+1)%3] if rotate else label,'split':split}
                                 for i,label in enumerate(trainer.LABELS) for n in range(12)])
        with tempfile.TemporaryDirectory() as temporary, \
             patch.object(trainer,'CANDIDATES',(1.0,)), \
             patch.object(trainer,'build_vectorizer',side_effect=lambda:TfidfVectorizer()), \
             patch.object(trainer,'export_onnx',return_value={'artifact_path':'test.onnx'}), \
             patch.object(trainer.joblib,'dump') as dump:
            a=trainer.train_language('cebuano',frame('train'),frame('validation'),frame('test'),Path(temporary),independent_quality=True)
            pipeline_a=dump.call_args.args[0]['pipeline']
            b=trainer.train_language('cebuano',frame('train'),frame('validation'),frame('test',True),Path(temporary),independent_quality=True)
            pipeline_b=dump.call_args.args[0]['pipeline']
        self.assertEqual(a['calibration'],b['calibration'])
        self.assertEqual(a['class_weight'],b['class_weight'])
        for left,right in zip(pipeline_a.named_steps['classifier'].estimators_,pipeline_b.named_steps['classifier'].estimators_):
            np.testing.assert_array_equal(left.coef_,right.coef_)
            np.testing.assert_array_equal(left.intercept_,right.intercept_)
        self.assertNotEqual(a['test_metrics'],b['test_metrics'])


if __name__ == "__main__":
    unittest.main()
