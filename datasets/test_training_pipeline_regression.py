"""Offline regression: real trainer subprocesses, no Supabase or bundled writes."""
import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import uuid4

import joblib
import numpy as np
import onnxruntime as ort

import sentiment_training_worker as worker
import train_sentiment as trainer


class TrainingPipelineRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.root = Path(cls.temporary.name)
        cls.data = cls.root / "data"
        cls.models = cls.root / "bootstrap"
        cls.data.mkdir()
        cls.words = {"negative": "danger terrible crime", "neutral": "notice schedule meeting",
                     "positive": "wonderful excellent helpful"}
        for split, count in (("train", 24), ("validation", 12), ("test", 12)):
            with (cls.data / f"{split}.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=worker.COLUMNS)
                writer.writeheader()
                for language in sorted(worker.LANGUAGES):
                    for label, words in cls.words.items():
                        for index in range(count):
                            writer.writerow({"text": f"{words} {language} {split} entry {index}",
                                             "language": language, "label": label, "split": split})
        result = subprocess.run([sys.executable, str(worker.BASE / "train_sentiment.py"),
                                 "--data-dir", str(cls.data), "--output-dir", str(cls.models),
                                 "--independent-quality"], capture_output=True, text=True, timeout=120)
        if result.returncode:
            raise AssertionError(result.stdout + result.stderr)
        (cls.models / "language_id.onnx").write_bytes(b"offline routing sentinel; never executed")
        cls.builtin = cls.root / "builtin-onnx-only"
        cls.builtin.mkdir()
        for name in worker.FILES:
            (cls.builtin / name).write_bytes((cls.models / name).read_bytes())

    def test_export_matches_selected_joblib_and_never_refits_holdout(self):
        saved = joblib.load(self.models / "sentiment_cebuano.joblib")
        self.assertEqual(saved["metadata"]["fit_splits"], ["train"])
        self.assertEqual(saved["metadata"]["training_samples"], 72)
        texts = list(self.words.values())
        session = ort.InferenceSession(str(self.models / "sentiment_cebuano.onnx"),
                                       providers=["CPUExecutionProvider"])
        probabilities = session.run(["probabilities"], {"text": np.array(texts, dtype=object).reshape(-1, 1)})[0]
        predicted = [worker.LABEL_ORDER[index] for index in probabilities.argmax(axis=1)]
        self.assertEqual(predicted, saved["pipeline"].predict(texts).tolist())

    def test_real_scoped_fresh_and_continued_jobs(self):
        original = {name: worker.sha256(self.builtin / name) for name in worker.FILES}
        for mode in ("fresh", "continue"):
            with self.subTest(mode=mode):
                job = {"id": str(uuid4()), "lease_token": str(uuid4()), "training_mode": mode,
                       "base_job_id": None, "snapshot": {
                           "pool_protocol": 1, "admission": "independent-v1", "scope_version": 1,
                           "requested_languages": ["cebuano"], "builtin_hashes": original,
                           "samples": [{"text": "danger terrible crime newly approved incident",
                                         "language": "cebuano", "label": "negative"}]}}
                if mode == 'continue':
                    job['snapshot']['samples'] = [
                        {'text': f'{words} approved addition {index}', 'language': 'cebuano', 'label': label}
                        for label, words in self.words.items() for index in range(12)]
                cloud = Mock(progress_enabled=False)
                with patch.object(worker, "Lease"):
                    worker.process_job(cloud, job, self.data, self.builtin, self.root / "runs",
                                       bootstrap_state_dir=self.models)
                directory = self.root / "runs" / job["id"]
                log = (directory / "training.log").read_text(encoding="utf-8")
                self.assertNotIn("Traceback", log)
                evaluation = json.loads((directory / "evaluation.json").read_text())
                self.assertTrue(evaluation["passed"], evaluation)
                self.assertEqual(evaluation["qualified_languages"], ["cebuano"])
                self.assertEqual(cloud.rpc.call_args.args[0], "complete")
                uploaded = {call.args[1].name for call in cloud.upload.call_args_list}
                self.assertEqual(uploaded, {"sentiment_cebuano.onnx", "sentiment_cebuano.joblib", "language_id.onnx"})
                self.assertFalse((directory / "candidate" / "sentiment_english.onnx").exists())
        self.assertEqual(original, {name: worker.sha256(self.builtin / name) for name in worker.FILES})

    def test_validation_only_cli_does_not_require_test_file(self):
        data = self.root / "validation-only-data"
        data.mkdir(exist_ok=True)
        for split in ("train", "validation"):
            (data / f"{split}.csv").write_bytes((self.data / f"{split}.csv").read_bytes())
        output = self.root / "validation-only-output"
        result = subprocess.run([sys.executable, str(worker.BASE / "train_sentiment.py"),
                                 "--data-dir", str(data), "--output-dir", str(output),
                                 "--languages", "cebuano", "--independent-quality", "--validation-only"],
                                capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        metadata = json.loads((output / "baseline_metrics.json").read_text())["models"]
        self.assertEqual([row["language"] for row in metadata], ["cebuano"])
        self.assertIsNone(metadata[0]["test_metrics"])
        self.assertFalse((output / "sentiment_english.onnx").exists())

    def test_insufficient_validation_support_is_expected_quality_rejection(self):
        frames = trainer.load_splits(self.data)
        validation = frames["validation"].groupby(["language", "label"]).head(2)
        with self.assertRaises(trainer.TrainingQualityError):
            trainer.train_language("cebuano", frames["train"], validation, frames["test"],
                                   self.root, independent_quality=True)


if __name__ == "__main__":
    unittest.main()
