import copy
import csv
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import sentiment_training_worker as worker


class FakeLease:
    def __init__(self, *_):
        pass

    def check(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass


class FakeCloud:
    def __init__(self):
        self.calls = []
        self.uploads = []

    def rpc(self, action, job=None, payload=None):
        self.calls.append((action, payload))

    def upload(self, path, file):
        self.uploads.append((path, file.read_bytes()))


def good_metrics():
    result = {"macro_f1": 0.85, "per_class": {label: {"recall": 0.85, "support": 100, "f1": 0.85} for label in worker.LABEL_ORDER}}
    return {language: {"baseline": copy.deepcopy(result), "candidate": copy.deepcopy(result)} for language in worker.LANGUAGES}


class TrainingWorkerTests(unittest.TestCase):
    def make_baseline(self, root):
        data = root / "baseline-data"
        models = root / "baseline-models"
        data.mkdir()
        models.mkdir()
        for split in ("train", "validation", "test"):
            with (data / f"{split}.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=worker.COLUMNS)
                writer.writeheader()
                writer.writerow({"text": f"original {split}", "language": "cebuano", "label": "neutral", "split": split})
        for name in worker.FILES:
            (models / name).write_bytes(b"baseline")
        return data, models

    def test_gate_checks_every_language_and_preserves_per_class_recall(self):
        metrics = good_metrics()
        self.assertTrue(worker.evaluation_gate(metrics, [])["passed"])
        for change in ("macro", "recall", "support", "missing", "nan"):
            broken = copy.deepcopy(metrics)
            if change == "macro":
                broken["cebuano"]["candidate"]["macro_f1"] = 0.70
            elif change == "recall":
                broken["cebuano"]["candidate"]["per_class"]["positive"]["recall"] = 0.1
            elif change == "support":
                broken["filipino"]["candidate"]["per_class"]["neutral"]["support"] = 1
            elif change == "missing":
                del broken["english"]
            else:
                broken["english"]["candidate"]["macro_f1"] = float("nan")
            self.assertFalse(worker.evaluation_gate(broken, [])["passed"], change)

    def test_known_correct_regression_phrases_cannot_become_incorrect(self):
        regressions = [{"language": "cebuano", "expected": "positive", "baseline": "positive", "candidate": "negative"}]
        self.assertFalse(worker.evaluation_gate(good_metrics(), regressions)["passed"])

    def test_metrics_reject_invalid_labels_and_mismatched_prediction_counts(self):
        self.assertEqual(worker.scores(worker.LABEL_ORDER, worker.LABEL_ORDER)["macro_f1"], 1.0)
        with self.assertRaises(ValueError):
            worker.scores(["negative"], [])
        with self.assertRaises(ValueError):
            worker.scores(["neutral"], ["mixed"])

    def test_snapshot_uses_all_approved_examples_without_modifying_holdouts(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, _ = self.make_baseline(root)
            samples = [{"text": text, "language": "cebuano", "label": "neutral"} for text in ("new example", "NEW EXAMPLE", "original test", "original validation")]
            original = {split: (data / f"{split}.csv").read_bytes() for split in ("train", "validation", "test")}
            result = worker.build_snapshot(data, {"samples": samples}, root / "snapshot")
            self.assertEqual(result["accepted"], 1)
            self.assertEqual(result["duplicates"], 1)
            self.assertEqual(result["held_out"], 2)
            for split in ("validation", "test"):
                self.assertEqual((root / "snapshot" / f"{split}.csv").read_bytes(), original[split])
            self.assertEqual((data / "train.csv").read_bytes(), original["train"])

    def test_conflicting_baseline_labels_fail_instead_of_silently_training(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, _ = self.make_baseline(root)
            with self.assertRaisesRegex(ValueError, "conflict"):
                worker.build_snapshot(data, {"samples": [{"text": "original train", "language": "cebuano", "label": "positive"}]}, root / "snapshot")

    def test_preexisting_train_test_overlap_is_removed_only_from_new_training_copy(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, _ = self.make_baseline(root)
            with (data / "train.csv").open("a", newline="", encoding="utf-8") as handle:
                csv.writer(handle).writerow([" ORIGINAL TEST ", "cebuano", "neutral", "train"])
            original = (data / "train.csv").read_bytes()
            heldout = (data / "test.csv").read_bytes()
            result = worker.build_snapshot(data, {"samples": []}, root / "snapshot")
            self.assertEqual(result["baseline_train_holdout_excluded"], 1)
            self.assertEqual((data / "train.csv").read_bytes(), original)
            self.assertEqual((root / "snapshot" / "test.csv").read_bytes(), heldout)
            self.assertEqual(len(worker.read_splits(root / "snapshot")["train"]), 1)

    def test_successful_job_publishes_immutable_versioned_bundle_but_never_activates(self):
        self.run_fake_job(True)

    def test_failed_gate_uploads_nothing_and_keeps_active_models_untouched(self):
        self.run_fake_job(False)

    def run_fake_job(self, passed):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, models = self.make_baseline(root)
            job = {"id": str(uuid4()), "lease_token": str(uuid4()), "base_job_id": None, "snapshot": {"datasets": [], "samples": [{"text": "new approved", "language": "cebuano", "label": "positive"}]}}
            cloud = FakeCloud()

            class Process:
                returncode = 0

                def __init__(self, command, **_):
                    destination = Path(command[command.index("--output-dir") + 1])
                    destination.mkdir()
                    for language in worker.LANGUAGES:
                        (destination / f"sentiment_{language}.onnx").write_bytes(b"candidate")

                def poll(self):
                    return 0

            with patch.object(worker, "Lease", FakeLease), patch.object(worker.subprocess, "Popen", Process), patch.object(worker, "evaluate_bundle", return_value={"passed": passed, "languages": good_metrics(), "reasons": [] if passed else ["Test regression"]}):
                worker.process_job(cloud, job, data, models, root / "runs")
            self.assertEqual(cloud.calls[0][0], "evaluating")
            self.assertEqual(cloud.calls[-1][0], "complete" if passed else "fail")
            self.assertNotIn("activate", [action for action, _ in cloud.calls])
            self.assertEqual(len(cloud.uploads), 4 if passed else 0)
            for path, _ in cloud.uploads:
                self.assertTrue(path.startswith(f"{job['id']}/{job['lease_token']}/"))
            for name in worker.FILES:
                self.assertEqual((models / name).read_bytes(), b"baseline")
            self.assertTrue((root / "runs" / job["id"] / "evaluation.json").is_file())
            snapshot = json.loads((root / "runs" / job["id"] / "approved_snapshot.json").read_text())
            self.assertEqual(snapshot, job["snapshot"])

    def test_onnx_contract_with_real_bundled_model(self):
        try:
            import onnxruntime  # noqa: F401
        except ImportError:
            self.skipTest("Run with .venv-data for real ONNX validation")
        model = Path(__file__).resolve().parent.parent / "server" / "models" / "sentiment_english.onnx"
        if not model.is_file():
            self.skipTest("Bundled ONNX model not present")
        result = worker.predictions(model, ["Wonderful", "Terrible", "There is a meeting tomorrow"] * 23)
        self.assertEqual(len(result), 69)
        self.assertTrue(all(label in worker.LABELS for label in result))


if __name__ == "__main__":
    unittest.main()
