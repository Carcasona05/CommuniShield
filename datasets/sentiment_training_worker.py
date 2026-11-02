"""Durable supporting-model worker. Candidates never auto-activate.

Load private server credentials in the environment and run with the project's
Python training environment. See server/SENTIMENT_AUTOTRAIN.md for deployment.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from uuid import UUID

from import_approved_sentiment import COLUMNS, LABELS, LANGUAGES, select_examples, text_key
from builtin_sentiment_examples import REPORTED_CASES
from supporting_routing import evaluate_pool
from independent_support import evaluate as evaluate_independent
from training_progress import TrainingProgress

BASE = Path(__file__).resolve().parent
FILES = ["sentiment_english.onnx", "sentiment_filipino.onnx", "sentiment_cebuano.onnx", "language_id.onnx"]
LABEL_ORDER = ["negative", "neutral", "positive"]
REGRESSIONS = {
    "english": [("Wonderful", "positive"), ("Terrible", "negative"), ("There is a meeting tomorrow", "neutral")],
    "filipino": [("Maganda ang serbisyo", "positive"), ("Nakakainis ang mabagal na serbisyo", "negative"), ("May pagpupulong bukas", "neutral")],
    "cebuano": [("gwapo", "positive"), ("Maayo kaayo ang serbisyo", "positive"), ("kaila man ko ani niya oh", "neutral"), ("Delikado kaayo diri", "negative")],
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Cloud:
    def __init__(self) -> None:
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        self.key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        if not self.url.startswith("https://"):
            raise ValueError("The worker requires an HTTPS Supabase URL")

    def request(self, path: str, method: str = "GET", data: bytes | None = None, content_type: str = "application/json") -> bytes:
        request = urllib.request.Request(self.url + path, data=data, method=method, headers={
            "apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": content_type,
        })
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                result = response.read(104857601)
                if len(result) > 104857600:
                    raise ValueError("Cloud response exceeds 100 MB")
                return result
        except urllib.error.HTTPError as error:
            # Do not print response bodies, headers, credentials, or sample text.
            raise RuntimeError(f"Supabase request failed (HTTP {error.code})") from None

    def rpc(self, action: str, job: dict | None = None, payload: dict | None = None):
        body = {"p_action": action, "p_job": job["id"] if job else None, "p_lease": job["lease_token"] if job else None, "p_payload": payload or {}}
        return json.loads(self.request("/rest/v1/rpc/sentiment_training_worker", "POST", json.dumps(body).encode()))

    def capabilities(self):
        # Dedicated STABLE/read-only RPC. Never send an unknown action to the
        # legacy worker function, which interprets it as a bad lease.
        return json.loads(self.request("/rest/v1/rpc/sentiment_training_capabilities"))

    def progress_available(self):
        try:
            self.request("/rest/v1/rpc/get_sentiment_training_progress", "POST", b'{"p_jobs":[]}')
            return True
        except (CloudRequestError, urllib.error.URLError, TimeoutError):
            return False

    def report_progress(self, job, sequence, completed, total, stage, language):
        payload = {"p_job": job["id"], "p_lease": job["lease_token"], "p_sequence": sequence,
                   "p_completed": completed, "p_total": total, "p_stage": stage, "p_language": language}
        self.request("/rest/v1/rpc/report_sentiment_training_progress", "POST", json.dumps(payload).encode())

    def download_bundle(self, job_id: str, destination: Path) -> None:
        UUID(job_id)
        rows = json.loads(self.request(f"/rest/v1/sentiment_training_jobs?id=eq.{job_id}&select=artifact_manifest,status&limit=1"))
        if not rows or rows[0]["status"] != "ready":
            raise ValueError("Active baseline manifest unavailable")
        files = rows[0]["artifact_manifest"]["files"]
        destination.mkdir(parents=True, exist_ok=False)
        for name in FILES:
            artifact = files[name]
            parts = artifact["path"].split("/")
            if len(parts) != 3 or parts[0] != job_id or parts[2] != name:
                raise ValueError("Invalid artifact path")
            UUID(parts[1])
            data = self.request("/storage/v1/object/authenticated/sentiment-models/" + artifact["path"])
            if len(data) != artifact["size"] or hashlib.sha256(data).hexdigest() != artifact["sha256"]:
                raise ValueError("Baseline checksum mismatch")
            (destination / name).write_bytes(data)

    def upload(self, path: str, file: Path) -> None:
        self.request("/storage/v1/object/sentiment-models/" + path, "POST", file.read_bytes(), "application/octet-stream")


def record_worker_shutdown(cloud, job):
    """Use the existing lease-fenced failure path; never overwrite a ready job."""
    if not job:
        return False
    if job.get("_shutdown_reported"):
        return True
    try:
        cloud.rpc("fail", job, {
            "error": "Worker stopped by operator. Queue a retry if needed. Built-in models are unchanged.",
            "metrics": {"failure_stage": "worker_shutdown", "interrupted": True},
        })
        job["_shutdown_reported"] = True
        return True
    except Exception:
        return False  # Offline/expired/already-completed jobs still obey their lease.


def worker_stop_signal(_signum, _frame):
    raise KeyboardInterrupt


def install_stop_handlers():
    # SIGINT already raises KeyboardInterrupt. Handle service shutdowns and
    # Windows Ctrl+Break too. Force-kill/power loss cannot run Python cleanup.
    for name in ("SIGTERM", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), worker_stop_signal)


class Lease:
    def __init__(self, cloud: Cloud, job: dict) -> None:
        self.cloud, self.job = cloud, job
        self.stop = threading.Event()
        self.lost = threading.Event()
        self.thread = threading.Thread(target=self.heartbeat, daemon=True)

    def heartbeat(self) -> None:
        failures = 0
        while not self.stop.wait(30):
            try:
                self.cloud.rpc("heartbeat", self.job)
                failures = 0
            except Exception:
                failures += 1
                if failures >= 2:
                    self.lost.set()
                    return

    def check(self) -> None:
        if self.lost.is_set():
            raise RuntimeError("Training lease lost; candidate will not be published")

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, exc_type, *_):
        self.stop.set()
        interrupted = exc_type is not None and issubclass(exc_type, KeyboardInterrupt)
        if interrupted:
            self.lost.set()
            # Report before joining a possibly blocked heartbeat HTTP request.
            # Its late renewal cannot resurrect a terminal job (DB lease checks).
            record_worker_shutdown(self.cloud, self.job)
        self.thread.join(timeout=2 if interrupted else 65)


def read_splits(directory: Path, allow_training_overlap: bool = False) -> dict[str, list[dict[str, str]]]:
    splits = {}
    for split in ("train", "validation", "test"):
        with (directory / f"{split}.csv").open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if set(reader.fieldnames or []) != set(COLUMNS):
                raise ValueError("Baseline split columns are invalid")
            splits[split] = list(reader)
        if any(row["split"] != split or row["language"] not in LANGUAGES or row["label"] not in LABELS or not row["text"].strip() for row in splits[split]):
            raise ValueError("Baseline split values are invalid")
    for left, right in (("train", "validation"), ("train", "test"), ("validation", "test")):
        if allow_training_overlap and left == "train":
            continue
        if {text_key(row) for row in splits[left]} & {text_key(row) for row in splits[right]}:
            raise ValueError("Baseline splits overlap after normalization; repair before automatic training")
    return splits


def build_snapshot(baseline: Path, snapshot: dict, destination: Path) -> dict:
    splits = read_splits(baseline, allow_training_overlap=True)
    # Existing source data may already contain casing/whitespace variants of
    # held-out phrases. Exclude them only from the NEW training snapshot.
    held_out = {text_key(row) for split in ("validation", "test") for row in splits[split]}
    original_train_count = len(splits["train"])
    splits["train"] = [row for row in splits["train"] if text_key(row) not in held_out]
    heldout_labels = {}
    for split in ("validation", "test"):
        for row in splits[split]:
            heldout_labels.setdefault(text_key(row), set()).add(row["label"])
    samples = snapshot["samples"]
    if not isinstance(samples, list) or len(samples) > 50000:
        raise ValueError("Invalid approved pool")
    for row in samples:
        if set(row) != {"text", "language", "label"} or row["language"] not in LANGUAGES or row["label"] not in LABELS or not isinstance(row["text"], str) or not 1 <= len(row["text"]) <= 2000:
            raise ValueError("Invalid approved example")
    accepted, counts = select_examples(samples, splits)
    if counts["conflicts"]:
        raise ValueError("Approved examples conflict with baseline labels. Curate the baseline before retrying.")
    destination.mkdir(parents=True, exist_ok=False)
    with (destination / "train.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(splits["train"] + accepted)
    for split in ("validation", "test"):
        shutil.copyfile(baseline / f"{split}.csv", destination / f"{split}.csv")
    return {**counts, "baseline_train_holdout_excluded": original_train_count - len(splits["train"]),
            "heldout_conflicting_keys": sum(len(labels) > 1 for labels in heldout_labels.values()),
            "baseline_hashes": {split: sha256(baseline / f"{split}.csv") for split in splits}}


def predictions(model: Path, texts: list[str]) -> list[str]:
    import numpy as np
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(model), sess_options=options, providers=["CPUExecutionProvider"])
    result = []
    # Exported TF-IDF graphs can materialize dense feature matrices. Evaluating
    # the full holdout in one call can allocate tens of GB; keep batches small.
    for start in range(0, len(texts), 32):
        batch = texts[start:start + 32]
        output = session.run(["probabilities"], {"text": np.array(batch, dtype=object).reshape(-1, 1)})[0]
        if output.shape != (len(batch), 3) or not np.isfinite(output).all():
            raise ValueError("ONNX output shape/values are invalid")
        result.extend(LABEL_ORDER[int(index)] for index in output.argmax(axis=1))
    return result


def scores(expected: list[str], predicted: list[str]) -> dict:
    if len(expected) != len(predicted) or any(label not in LABELS for label in expected + predicted):
        raise ValueError("Invalid evaluation labels or prediction count")
    per_class = {}
    for label in LABEL_ORDER:
        tp = sum(a == b == label for a, b in zip(expected, predicted))
        support = expected.count(label)
        recall = tp / support if support else 0.0
        precision = tp / predicted.count(label) if label in predicted else 0.0
        per_class[label] = {"recall": recall, "support": support, "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0}
    return {"macro_f1": sum(item["f1"] for item in per_class.values()) / 3, "per_class": per_class}


def evaluation_gate(languages: dict, regressions: list[dict], minimum_f1: float = 0.6, f1_tolerance: float = 0.01, recall_tolerance: float = 0.03, minimum_support: int = 10) -> dict:
    reasons = []
    for language in sorted(LANGUAGES):
        result = languages.get(language)
        if not result:
            reasons.append(f"Missing {language} evaluation")
            continue
        old, new = result["baseline"], result["candidate"]
        if not math.isfinite(new["macro_f1"]) or not math.isfinite(old["macro_f1"]) or new["macro_f1"] < minimum_f1 or new["macro_f1"] + f1_tolerance < old["macro_f1"]:
            reasons.append(f"{language}: macro-F1 gate failed")
        for label in LABEL_ORDER:
            if not math.isfinite(new["per_class"][label]["recall"]) or new["per_class"][label]["support"] < minimum_support or new["per_class"][label]["recall"] + recall_tolerance < old["per_class"][label]["recall"]:
                reasons.append(f"{language}/{label}: support or recall gate failed")
    for item in regressions:
        if item["baseline"] == item["expected"] and item["candidate"] != item["expected"]:
            reasons.append(f"{item['language']}: known regression phrase became incorrect")
    return {"passed": not reasons, "reasons": reasons, "languages": languages, "regressions": regressions,
            "policy": {"minimum_macro_f1": minimum_f1, "macro_f1_tolerance": f1_tolerance, "recall_tolerance": recall_tolerance, "minimum_class_support": minimum_support}}


def evaluate_bundle(test_rows: list[dict[str, str]], baseline: Path, candidate: Path) -> dict:
    languages, regressions = {}, []
    for language in sorted(LANGUAGES):
        rows = [row for row in test_rows if row["language"] == language]
        if not rows:
            raise ValueError("All three languages require fixed test examples")
        texts, expected = [row["text"] for row in rows], [row["label"] for row in rows]
        filename = f"sentiment_{language}.onnx"
        languages[language] = {"baseline": scores(expected, predictions(baseline / filename, texts)), "candidate": scores(expected, predictions(candidate / filename, texts))}
        phrases = REGRESSIONS[language]
        old = predictions(baseline / filename, [text for text, _ in phrases])
        new = predictions(candidate / filename, [text for text, _ in phrases])
        regressions.extend({"language": language, "text": phrase[0], "expected": phrase[1], "baseline": a, "candidate": b} for phrase, a, b in zip(phrases, old, new))
    return evaluation_gate(languages, regressions)


def training_quality_failure(candidate: Path):
    """Recognize the trainer's bounded, structured validation-rejection marker.

    Never scrape raw subprocess output: log text may contain private samples.
    Unexpected errors keep their original failure path.
    """
    path = candidate / 'training_failure.json'
    if not path.is_file() or path.stat().st_size > 16384:
        return None
    try:
        marker = json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, OSError):
        return None
    if not isinstance(marker, dict) or marker.get('kind') != 'validation_quality' or marker.get('language') not in LANGUAGES:
        return None
    completed = marker.get('completed_languages')
    if not isinstance(completed, list) or any(not isinstance(l, str) or l not in LANGUAGES for l in completed):
        return None
    # Use our own public message, not arbitrary strings found in the file.
    return marker['language'], ['No fitted candidate meets validation macro-F1 and per-class precision/recall requirements. Review training labels and class coverage.'], completed


def run_scoped_training(command, candidate, requested, directory, lease, progress=None):
    """Fit each declared language in isolation; expected quality failures do not
    discard another language's work. Unexpected crashes still fail the job."""
    failures, models = {}, []
    candidate.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    with (directory / 'training.log').open('w', encoding='utf-8') as log:
        log.write('Language-scoped training: ' + ', '.join(requested) + '\n'); log.flush()
        for index, language in enumerate(requested):
            output = directory / 'language-candidates' / language
            output.parent.mkdir(exist_ok=True)
            args = list(command)
            args[args.index('--output-dir') + 1] = str(output)
            args += ['--languages', language]
            progress_path = directory / f'{language}-progress.json'
            if progress:
                progress.emit(1 + index, 'fitting', language)
            process = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT,
                                       env={**os.environ, 'CS_TRAINING_PROGRESS_FILE': str(progress_path)})
            try:
                while process.poll() is None:
                    lease.check()
                    if progress:
                        progress.fitting(progress_path, index, language)
                    if time.monotonic() - started > 7200:
                        raise RuntimeError('Training exceeded the two-hour limit')
                    time.sleep(1)
                if process.returncode:
                    failure = training_quality_failure(output)
                    if not failure or failure[0] != language:
                        raise RuntimeError(f'{language}: training process failed unexpectedly. Inspect the private training.log.')
                    failures[language] = failure[1]
                    if progress:
                        progress.emit(2 + index, 'fitting', language)
                    continue
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill(); process.wait()
            metadata = json.loads((output / 'baseline_metrics.json').read_text(encoding='utf-8'))
            for extension in ('onnx', 'joblib'):
                shutil.copyfile(output / f'sentiment_{language}.{extension}', candidate / f'sentiment_{language}.{extension}')
            models.extend(metadata['models'])
            if progress:
                progress.emit(2 + index, 'fitting', language)
    (candidate / 'baseline_metrics.json').write_text(json.dumps({'models': models, 'requested_languages': requested,
        'language_failures': failures, 'scope_version': 1}), encoding='utf-8')
    return failures


def process_job(cloud: Cloud, job: dict, data_dir: Path, bundled_models: Path, runs: Path) -> None:
    UUID(job["id"])
    UUID(job["lease_token"])
    directory = runs / job["id"]
    directory.mkdir(parents=True, exist_ok=False)
    with Lease(cloud, job) as lease:
        baseline = bundled_models
        if job.get("base_job_id") or job["snapshot"].get("pool_protocol") != 1:
            raise ValueError("Supporting-pool jobs must start from the permanent built-in model")
        mode = job.get("training_mode") or "continue"
        independent = job['snapshot'].get('admission') == 'independent-v1'
        scoped = job['snapshot'].get('scope_version') == 1
        requested = job['snapshot'].get('requested_languages') if scoped else None
        if scoped and (not independent or not isinstance(requested, list) or not requested or
                       any(not isinstance(l, str) or l not in LANGUAGES for l in requested) or len(set(requested)) != len(requested)):
            raise ValueError('Invalid server-claimed training language scope')
        progress = TrainingProgress(cloud, job, requested if scoped else sorted(LANGUAGES))
        progress.emit(0, 'preparing')
        if mode not in ("continue", "fresh"):
            raise ValueError(f"Unsupported training mode {mode!r}; refusing to train")
        builtin_hashes = {name: sha256(baseline / name) for name in FILES}
        if builtin_hashes != job["snapshot"].get("builtin_hashes"):
            raise ValueError("Built-in model changed since job claim; refusing stale evaluation")
        if any(not (baseline / name).is_file() for name in FILES):
            raise ValueError("Baseline ONNX bundle is incomplete")
        (directory / "approved_snapshot.json").write_text(json.dumps(job["snapshot"], ensure_ascii=False), encoding="utf-8")
        merged = build_snapshot(data_dir, job["snapshot"], directory / "data")
        progress.emit(1, 'preparing')
        candidate = directory / "candidate"
        command = [sys.executable, str(BASE / "train_sentiment.py"), "--data-dir", str(directory / "data"), "--output-dir", str(candidate)]
        started = time.monotonic()
        training_failures = run_scoped_training(command, candidate, requested, directory, lease, progress) if scoped else {}
        with (directory / "training.log").open("a" if scoped else "w", encoding="utf-8") as log:
            log.write(f"training mode: {mode}\n")
            log.flush()
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT) if not scoped else None
            try:
                while process.poll() is None:
                    lease.check()
                    if time.monotonic() - started > 7200:
                        raise RuntimeError("Training exceeded the two-hour limit")
                    time.sleep(1)
                if process.returncode != 0:
                    raise RuntimeError("Training command failed. Inspect the private worker training.log.")
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
        lease.check()
        # Keep language routing fixed; this job only retrains sentiment models.
        shutil.copyfile(baseline / "language_id.onnx", candidate / "language_id.onnx")
        cloud.rpc("evaluating", job)
        language_count = len(progress.languages)
        progress.emit(1 + language_count, 'checking')
        checked = set()
        def checked_language(language):
            lease.check()
            checked.add(language)
            progress.emit(1 + language_count + len(checked), 'checking', language)
        splits = read_splits(directory / "data")
        metrics = (evaluate_independent(splits, candidate, builtin_hashes, requested, training_failures, on_language_complete=checked_language) if scoped else
                   evaluate_independent(splits, candidate, builtin_hashes, on_language_complete=checked_language) if independent else evaluate_bundle(splits["test"], baseline, candidate))
        progress.emit(1 + 2 * language_count, 'checking')
        metrics["pool_protocol"] = 1
        metrics["training_mode"] = mode
        metrics["data"] = merged
        metrics["base_model_hashes"] = {name: sha256(baseline / name) for name in FILES}
        (directory / "evaluation.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
        lease.check()
        if not metrics["passed"]:
            cloud.rpc("fail", job, {"error": "Evaluation gate failed; the active model is unchanged.", "metrics": metrics})
            return
        existing = []
        for row in ([] if independent else job["snapshot"].get("supporting_models", [])):
            lease.check()
            path = directory / "pool" / row["id"]
            cloud.download_bundle(row["id"], path)
            existing.append((row["id"], path, row["routing_policy"]))
        if not independent:
            metrics["routing_policy"] = evaluate_pool(splits, baseline, candidate, existing, builtin_hashes)
        (directory / "evaluation.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
        if builtin_hashes != {name: sha256(baseline / name) for name in FILES}:
            raise ValueError("Built-in files changed during evaluation; nothing will be registered")
        files, training_files = {}, {}
        artifact_names = (['language_id.onnx'] + [f'sentiment_{l}.{ext}' for l in metrics['qualified_languages'] for ext in ('onnx','joblib')]) if scoped else [*FILES, *TRAINING_FILES]
        progress.emit(1 + 2 * language_count, 'uploading')
        for artifact_index, name in enumerate(artifact_names):
            lease.check()
            file = candidate / name
            path = f"{job['id']}/{job['lease_token']}/{name}"
            if not 0 < file.stat().st_size <= 104857600:
                raise ValueError("Model artifact exceeds storage limits")
            cloud.upload(path, file)
            progress.emit(1 + 2 * language_count + (artifact_index + 1) / len(artifact_names), 'uploading')
            target = training_files if name in TRAINING_FILES else files
            target[name] = {"path": path, "sha256": sha256(file), "size": file.stat().st_size}
        lease.check()
        manifest = {"files": files, "training_files": training_files}
        if scoped:
            manifest['languages'] = metrics['qualified_languages']
        progress.emit(progress.total - 1, 'registering')
        cloud.rpc("complete", job, {"manifest": manifest, "metrics": metrics})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=BASE / "processed")
    parser.add_argument("--baseline-model-dir", type=Path, default=BASE.parent / "server" / "models")
    parser.add_argument("--runs-dir", type=Path, default=BASE / "training-runs")
    parser.add_argument("--once", action="store_true", help="Process at most one available job, then exit")
    parser.add_argument("--env-file", type=Path, help="Optional private .env file (e.g. server/.env)")
    args = parser.parse_args()
    install_stop_handlers()
    if args.env_file:
        from dotenv import load_dotenv
        if not args.env_file.is_file():
            raise ValueError("Environment file not found")
        load_dotenv(args.env_file, override=False)
    cloud = Cloud()
    if os.environ.get("SENTIMENT_MODEL_REGISTRY_ENABLED") != "true":
        raise ValueError("Enable SENTIMENT_MODEL_REGISTRY_ENABLED=true on the worker and backend before supporting-model training.")
    capabilities = wait_for_capabilities(cloud, args.once)
    if not capabilities or capabilities.get("supporting_pool") is not True:
        raise ValueError("Apply DB_Schema/migrations/sentiment_supporting_pool.sql before starting this worker.")
    if capabilities.get('independent_admission') is not True:
        raise ValueError('Apply DB_Schema/migrations/sentiment_independent_admission.sql before starting this worker. Comparative admission will not be used as a fallback.')
    if capabilities.get('language_scoped_training') is not True:
        raise ValueError('Apply DB_Schema/migrations/sentiment_language_scoped_training.sql before starting this worker. All-language training will not be used as a fallback.')
    cloud.progress_enabled = cloud.progress_available()
    print('Completed-work progress enabled.' if cloud.progress_enabled else
          'Percentage progress unavailable. Apply sentiment_training_progress.sql and restart this worker; stage-only reporting remains available.', flush=True)
    if capabilities.get("fresh_candidates") is True:
        print("Fresh challengers supported. Queue them from the admin Training panel; built-ins stay permanent.", flush=True)
    else:
        print("Fresh challengers unavailable until DB_Schema/migrations/sentiment_fresh_candidates.sql is applied.", flush=True)
    print('Independent held-out quality enabled. Passing candidates stay disabled for super-admin review; no built-in score comparison.', flush=True)
    print("Supporting-model worker started. Built-ins are permanent; candidates never replace older models.", flush=True)
    while True:
        job = None
        try:
            job = cloud.rpc("claim")
            if job:
                print(f"Processing job {job['id']}", flush=True)
                process_job(cloud, job, args.data_dir.resolve(), args.baseline_model_dir.resolve(), args.runs_dir.resolve())
                print(f"Finished job {job['id']}; check the evaluation status in the admin UI.", flush=True)
            elif args.once:
                print("No claimable job yet. Approvals use a 30-second batching window.", flush=True)
        except KeyboardInterrupt:
            reported = record_worker_shutdown(cloud, job)
            print("Worker stopped. The active run was marked interrupted." if reported else
                  "Worker stopped. No stop confirmation was saved; heartbeat/lease checks will detect any unfinished run.", flush=True)
            return
        except Exception as error:
            message = f"{type(error).__name__}: {error}"[:1000]
            print(message, flush=True)
            if job:
                try:
                    cloud.rpc("fail", job, {"error": message})
                except Exception:
                    print("Could not record failure; lease expiry will mark the job failed.", flush=True)
        if args.once:
            return
        time.sleep(5)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Worker stopped.", flush=True)
    except (CloudRequestError, ValueError, RuntimeError) as error:
        print(f"Worker could not start: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1) from None
