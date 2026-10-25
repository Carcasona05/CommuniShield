import copy
import csv
import hashlib
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch, Mock
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
    def test_schema_cache_outage_retries_only_read_only_startup_probe(self):
        cloud = Mock()
        cloud.capabilities.side_effect = [worker.CloudRequestError(503, "PGRST002"),
                                 worker.CloudRequestError(503, "PGRST002"),
                                 {"continued_training": True}]
        with patch.object(worker.time, "sleep") as sleep, patch("builtins.print"):
            self.assertEqual(worker.wait_for_capabilities(cloud), {"continued_training": True})
        self.assertEqual(cloud.capabilities.call_count, 3)
        cloud.rpc.assert_not_called()
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [5, 10])

    def test_startup_does_not_retry_auth_migration_errors_or_once_mode(self):
        for error, once, expected in [(worker.CloudRequestError(401), False, worker.CloudRequestError),
                                      (worker.CloudRequestError(404, "PGRST202"), False, ValueError),
                                      (worker.CloudRequestError(409), False, ValueError),
                                      (worker.CloudRequestError(503, "PGRST002"), True, worker.CloudRequestError)]:
            cloud = Mock(); cloud.capabilities.side_effect = error
            with patch.object(worker.time, "sleep") as sleep, self.assertRaises(expected):
                worker.wait_for_capabilities(cloud, once)
            sleep.assert_not_called()
            self.assertEqual(cloud.capabilities.call_count, 1)
            cloud.rpc.assert_not_called()

    def test_capability_probe_never_calls_the_worker_mutation_endpoint(self):
        cloud = worker.Cloud.__new__(worker.Cloud)
        with patch.object(cloud, "request", return_value=b'{"continued_training":true}') as request:
            self.assertEqual(cloud.capabilities(), {"continued_training": True})
        request.assert_called_once_with("/rest/v1/rpc/sentiment_training_capabilities")

    def test_request_classifies_503_without_leaking_response_or_replaying_writes(self):
        cloud = worker.Cloud.__new__(worker.Cloud)
        cloud.url, cloud.key = "https://example.test", "private-key"
        error = urllib.error.HTTPError("https://example.test", 503, "Unavailable", {},
                                       io.BytesIO(json.dumps({"code": "PGRST002", "message": "private sample text"}).encode()))
        with patch.object(worker.urllib.request, "urlopen", side_effect=error) as request:
            with self.assertRaises(worker.CloudRequestError) as caught:
                cloud.rpc("complete", {"id": "job", "lease_token": "lease"}, {"private": "sample"})
        self.assertEqual(request.call_count, 1, "mutating RPCs must not be blindly retried")
        self.assertEqual(caught.exception.api_code, "PGRST002")
        self.assertIn("schema cache", str(caught.exception))
        self.assertNotIn("private", str(caught.exception))

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

    def test_failed_gate_explains_exact_recall_and_support_failures(self):
        metrics = good_metrics()
        metrics["cebuano"]["candidate"]["per_class"]["negative"]["recall"] = 0.79
        result = worker.evaluation_gate(metrics, [])
        self.assertFalse(result["passed"])
        self.assertIn("cebuano/negative: recall 0.7900, baseline 0.8500; minimum 0.8200", result["reasons"])
        metrics = good_metrics()
        metrics["filipino"]["candidate"]["per_class"]["neutral"]["support"] = 5
        self.assertIn("filipino/neutral: test support 5 is below 10", worker.evaluation_gate(metrics, [])["reasons"])

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

    def test_successful_job_publishes_inference_and_training_state_for_atomic_auto_activation(self):
        self.run_fake_job(True)

    def test_failed_gate_uploads_nothing_and_keeps_active_models_untouched(self):
        self.run_fake_job(False)

    def test_fresh_challenger_trains_from_scratch_and_reports_fresh_evidence(self):
        self.run_fake_job(True, mode="fresh")

    def test_independent_fresh_skips_all_baseline_selection_and_pool_comparisons(self):
        self.run_fake_job(True, mode="fresh", independent=True)

    def test_independent_continued_training_uses_absolute_validation_quality(self):
        self.run_fake_job(True, independent=True)

    def test_failed_independent_gate_uploads_nothing(self):
        self.run_fake_job(False, mode="fresh", independent=True)

    def test_validation_rejection_is_reported_with_language_and_no_partial_uploads(self):
        self.run_fake_job(False, mode='fresh', independent=True, training_rejected=True)

    def test_scoped_jobs_upload_only_qualified_languages_for_both_modes(self):
        for mode in ('continue','fresh'):
            self.run_fake_job(True,mode=mode,independent=True,scope=['cebuano','english'])

    def test_scoped_quality_failure_does_not_discard_another_language(self):
        self.run_fake_job(True,mode='fresh',independent=True,scope=['cebuano','filipino'],reject_language='filipino')

    def test_scoped_all_languages_fail_uploads_nothing(self):
        self.run_fake_job(False,mode='fresh',independent=True,scope=['filipino'],reject_language='filipino')

    def test_quality_failure_marker_is_bounded_and_does_not_leak_arbitrary_log_text(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            marker = root / 'training_failure.json'
            self.assertIsNone(worker.training_quality_failure(root))
            for value in ('invalid-json', '[]', json.dumps({'kind':'crash','language':'filipino'}),
                          json.dumps({'kind':'validation_quality','language':'unknown','completed_languages':[]}),
                          json.dumps({'kind':'validation_quality','language':'filipino','completed_languages':[{}]}), 'x'*16385):
                marker.write_text(value, encoding='utf-8')
                self.assertIsNone(worker.training_quality_failure(root))
            marker.write_text(json.dumps({'kind':'validation_quality','language':'filipino',
                                         'completed_languages':['cebuano','english'],'reasons':['PRIVATE SAMPLE TEXT']}), encoding='utf-8')
            result = worker.training_quality_failure(root)
            self.assertEqual(result[0], 'filipino')
            self.assertEqual(result[2], ['cebuano','english'])
            self.assertNotIn('PRIVATE', str(result))

    def test_unsupported_training_modes_fail_before_any_training_or_upload(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, models = self.make_baseline(root)
            job = {"id": str(uuid4()), "lease_token": str(uuid4()), "base_job_id": None, "training_mode": "replace-built-in", "snapshot": {
                "pool_protocol": 1, "builtin_hashes": {name: worker.sha256(models / name) for name in worker.FILES},
                "supporting_models": [], "datasets": [], "samples": []}}
            cloud = FakeCloud()
            with patch.object(worker, "Lease", FakeLease), \
                 patch.object(worker.subprocess, "Popen", side_effect=AssertionError("training must not start")):
                with self.assertRaisesRegex(ValueError, "Unsupported training mode"):
                    worker.process_job(cloud, job, data, models, root / "runs")
            self.assertEqual(cloud.calls, [])
            self.assertEqual(cloud.uploads, [])
            for name in worker.FILES:
                self.assertEqual((models / name).read_bytes(), b"baseline")

    def run_fake_job(self, passed, mode="continue", independent=False, training_rejected=False, scope=None, reject_language=None):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, models = self.make_baseline(root)
            job = {"id": str(uuid4()), "lease_token": str(uuid4()), "base_job_id": None, "snapshot": {
                "pool_protocol": 1, "builtin_hashes": {name: worker.sha256(models / name) for name in worker.FILES},
                "supporting_models": [], "datasets": [], "samples": [{"text": "new approved", "language": "cebuano", "label": "positive"}]}}
            if mode == "fresh":
                job["training_mode"] = "fresh"
            if independent:
                job['snapshot']['admission'] = 'independent-v1'
            if scope:
                job['snapshot'].update(scope_version=1,requested_languages=scope)
            cloud = FakeCloud()

            class Process:
                returncode = 2 if training_rejected else 0

                def __init__(self, command, **_):
                    self_outer.assertEqual(command[1], '-u')
                    if mode == 'fresh' and independent:
                        self_outer.assertNotIn('--baseline-model-dir', command)
                    else:
                        self_outer.assertEqual(Path(command[command.index("--baseline-model-dir") + 1]), models)
                    if mode == "fresh":
                        self_outer.assertTrue(command[2].endswith("train_sentiment.py"))
                        self_outer.assertNotIn("--snapshot-file", command)
                        self_outer.assertEqual('--independent-quality' in command, independent)
                    else:
                        self_outer.assertTrue(command[2].endswith("continue_sentiment.py"))
                        self_outer.assertIn("--snapshot-file", command)
                        self_outer.assertEqual('--independent-quality' in command, independent)
                    destination = Path(command[command.index("--output-dir") + 1])
                    destination.mkdir()
                    if scope:
                        language=command[command.index('--languages')+1]
                        self_outer.assertIn(language,scope)
                        if language==reject_language:
                            self.returncode=2
                            (destination/'training_failure.json').write_text(json.dumps({'kind':'validation_quality','language':language,'completed_languages':[]}),encoding='utf-8')
                            return
                    if training_rejected:
                        (destination / 'training_failure.json').write_text(json.dumps({
                            'kind':'validation_quality','language':'filipino',
                            'completed_languages':['cebuano','english']}), encoding='utf-8')
                        return
                    for language in worker.LANGUAGES:
                        (destination / f"sentiment_{language}.onnx").write_bytes(b"candidate")
                        (destination / f"sentiment_{language}.joblib").write_bytes(b"trusted-training-state")
                    if mode == "fresh":
                        (destination / "baseline_metrics.json").write_text(json.dumps({"python_model_family": "fresh", "models": []}))
                    else:
                        (destination / "baseline_metrics.json").write_text(json.dumps({"mode": "continued", "models": []}))

                def poll(self):
                    return self.returncode

            self_outer = self
            with patch.object(worker, "Lease", FakeLease), patch.object(worker.subprocess, "Popen", Process), \
                 patch.object(worker, "evaluate_pool", return_value={"version": 1, "passed": False, "builtin_hashes": job["snapshot"]["builtin_hashes"], "languages": {}}) as pool_eval, \
                 patch.object(worker, "evaluate_independent", return_value={"passed": passed, "admission": 'independent-v1', 'routing_policy': {'version': 2}, 'qualified_languages':[l for l in (scope or []) if l!=reject_language], "languages": good_metrics(), "reasons": [] if passed else ["Test regression"]}) as independent_eval, \
                 patch.object(worker, "evaluate_bundle", return_value={"passed": passed, "languages": good_metrics(), "reasons": [] if passed else ["Test regression"]}) as legacy_eval:
                worker.process_job(cloud, job, data, models, root / "runs")
                if independent:
                    if training_rejected:
                        independent_eval.assert_not_called()
                    else:
                        independent_eval.assert_called_once()
                    legacy_eval.assert_not_called()
                    pool_eval.assert_not_called()
                else:
                    independent_eval.assert_not_called()
            if training_rejected:
                self.assertEqual([action for action,_ in cloud.calls], ['fail'])
                details = cloud.calls[0][1]
                self.assertIn('Validation quality checks failed for filipino', details['error'])
                self.assertIn('cebuano, english finished fitting', details['error'])
                self.assertEqual(details['metrics']['failure_stage'], 'validation_selection')
                self.assertEqual(cloud.uploads, [])
                for name in worker.FILES:
                    self.assertEqual((models / name).read_bytes(), b'baseline')
                self.assertTrue((root/'runs'/job['id']/'evaluation.json').is_file())
                return
            self.assertEqual(cloud.calls[0][0], "evaluating")
            self.assertEqual(cloud.calls[-1][0], "complete" if passed else "fail")
            self.assertNotIn("activate", [action for action, _ in cloud.calls])
            self.assertEqual(cloud.calls[-1][1]["metrics"]["training_mode"], mode)
            qualified=[l for l in (scope or sorted(worker.LANGUAGES)) if l!=reject_language]
            self.assertEqual(len(cloud.uploads), (1+2*len(qualified)) if passed else 0)
            if passed:
                if scope:
                    self.assertEqual(cloud.calls[-1][1]['manifest']['languages'],qualified)
                    if reject_language:
                        self.assertIn(reject_language,independent_eval.call_args.args[4])
                    self.assertEqual(independent_eval.call_args.args[3],scope)
                elif mode == "fresh":
                    self.assertEqual(cloud.calls[-1][1]["metrics"]["training"]["python_model_family"], "fresh")
                else:
                    self.assertEqual(cloud.calls[-1][1]["metrics"]["training"]["mode"], "continued")
                self.assertEqual(set(cloud.calls[-1][1]["manifest"]["training_files"]), {f'sentiment_{l}.joblib' for l in qualified})
            if not passed:
                self.assertIn("Test regression", cloud.calls[-1][1]["error"])
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
        model = Path(__file__).resolve().parents[2] / "server" / "models" / "sentiment_english.onnx"
        if not model.is_file():
            self.skipTest("Bundled ONNX model not present")
        result = worker.predictions(model, ["Wonderful", "Terrible", "There is a meeting tomorrow"] * 23)
        self.assertEqual(len(result), 69)
        self.assertTrue(all(label in worker.LABELS for label in result))

    def test_active_bundle_download_preserves_metadata_bound_to_verified_files(self):
        job, lease = str(uuid4()), str(uuid4())
        files = {name: f"model:{name}".encode() for name in [*worker.FILES, *worker.TRAINING_FILES]}
        manifest = {name: {"path": f"{job}/{lease}/{name}", "size": len(content),
                           "sha256": hashlib.sha256(content).hexdigest()} for name, content in files.items()}
        training = {"models": [{"language": "cebuano", "validation_metrics": {"samples": 100}}],
                    "input_split_hashes": {"validation": "frozen-hash"}}
        cloud = worker.Cloud.__new__(worker.Cloud)
        def request(path):
            if path.startswith("/rest/v1/"):
                return json.dumps([{"status": "ready", "artifact_manifest": {
                    "files": {name: manifest[name] for name in worker.FILES},
                    "training_files": {name: manifest[name] for name in worker.TRAINING_FILES}},
                    "snapshot": {"samples": [{"text": "old example", "language": "cebuano", "label": "neutral"}]},
                    "metrics": {"training": training}}]).encode()
            return files[path.rsplit("/", 1)[-1]]
        with tempfile.TemporaryDirectory() as temporary, patch.object(cloud, "request", side_effect=request):
            folder = Path(temporary) / "active"
            cloud.download_bundle(job, folder)
            sidecar = json.loads((folder / "baseline_metrics.json").read_text())
            self.assertEqual(sidecar["models"], training["models"])
            self.assertEqual(sidecar["input_split_hashes"], training["input_split_hashes"])
            self.assertEqual(sidecar["onnx_hashes"], {name: hashlib.sha256(files[name]).hexdigest() for name in worker.FILES})
            self.assertTrue((folder / "approved_snapshot.json").is_file())


if __name__ == "__main__":
    unittest.main()
