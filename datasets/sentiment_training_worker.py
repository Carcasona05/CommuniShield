"""Durable continued-training worker. Passing, current updates activate atomically.

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

BASE = Path(__file__).resolve().parent
FILES = ["sentiment_english.onnx", "sentiment_filipino.onnx", "sentiment_cebuano.onnx", "language_id.onnx"]
TRAINING_FILES = [f"sentiment_{language}.joblib" for language in sorted(LANGUAGES)]
LABEL_ORDER = ["negative", "neutral", "positive"]
REGRESSIONS = {
    "english": [("Wonderful", "positive"), ("Terrible", "negative"), ("There is a meeting tomorrow", "neutral")],
    "filipino": [("Maganda ang serbisyo", "positive"), ("Nakakainis ang mabagal na serbisyo", "negative"), ("May pagpupulong bukas", "neutral")],
    "cebuano": [("gwapo", "positive"), ("Maayo kaayo ang serbisyo", "positive"), ("kaila man ko ani niya oh", "neutral"), ("Delikado kaayo diri", "negative"), *REPORTED_CASES],
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class CloudRequestError(RuntimeError):
    def __init__(self, status: int, api_code: str | None = None):
        self.status = status
        self.api_code = api_code
        if status == 503 and api_code == "PGRST002":
            message = "Supabase database API cannot load its schema cache (HTTP 503/PGRST002). Check the project's database health in Supabase."
        else:
            message = f"Supabase request failed (HTTP {status})"
        super().__init__(message)


def wait_for_capabilities(cloud, once: bool = False):
    """Only this read-only probe is retried, never claim/complete or uploads."""
    delay = 5
    while True:
        try:
            return cloud.capabilities()
        except CloudRequestError as error:
            if error.api_code == "PGRST202" or error.status in (400, 404, 409):
                raise ValueError("Training RPC unavailable. Apply DB_Schema/migrations/sentiment_supporting_pool.sql after sentiment_continued_training.sql.") from None
            if error.status not in (429, 502, 503, 504) or once:
                raise
            message = str(error)
        except (urllib.error.URLError, TimeoutError):
            if once:
                raise RuntimeError("Supabase could not be reached. Check your connection and retry.") from None
            message = "Supabase could not be reached. Check your connection."
        print(f"{message} Startup will retry in {delay}s; no training job has been claimed. Press Ctrl+C to stop.", flush=True)
        time.sleep(delay)
        delay = min(delay * 2, 30)


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
            # Read only a bounded error code for classification. Never print
            # bodies/messages/headers, which can contain private sample text.
            api_code = None
            try:
                payload = json.loads(error.read(8192))
                if isinstance(payload, dict) and payload.get("code") in ("PGRST002", "PGRST202"):
                    api_code = payload["code"]
            except (ValueError, OSError):
                pass
            raise CloudRequestError(error.code, api_code) from None

    def rpc(self, action: str, job: dict | None = None, payload: dict | None = None):
        body = {"p_action": action, "p_job": job["id"] if job else None, "p_lease": job["lease_token"] if job else None, "p_payload": payload or {}}
        return json.loads(self.request("/rest/v1/rpc/sentiment_training_worker", "POST", json.dumps(body).encode()))

    def capabilities(self):
        # Dedicated STABLE/read-only RPC. Never send an unknown action to the
        # legacy worker function, which interprets it as a bad lease.
        return json.loads(self.request("/rest/v1/rpc/sentiment_training_capabilities"))

    def download_bundle(self, job_id: str, destination: Path) -> None:
        UUID(job_id)
        rows = json.loads(self.request(f"/rest/v1/sentiment_training_jobs?id=eq.{job_id}&select=artifact_manifest,status,metrics,snapshot&limit=1"))
        if not rows or rows[0]["status"] != "ready":
            raise ValueError("Active baseline manifest unavailable")
        manifest = rows[0]["artifact_manifest"]
        if any(name not in manifest.get("training_files", {}) for name in TRAINING_FILES):
            raise ValueError("The active model has no saved training state. A matching trusted training-state bundle is required; refusing to rebuild from scratch.")
        files = {**{name: manifest["files"][name] for name in FILES},
                 **{name: manifest["training_files"][name] for name in TRAINING_FILES}}
        destination.mkdir(parents=True, exist_ok=False)
        for name in [*FILES, *TRAINING_FILES]:
            artifact = files[name]
            parts = artifact["path"].split("/")
            if len(parts) != 3 or parts[0] != job_id or parts[2] != name:
                raise ValueError("Invalid artifact path")
            UUID(parts[1])
            data = self.request("/storage/v1/object/authenticated/sentiment-models/" + artifact["path"])
            if len(data) != artifact["size"] or hashlib.sha256(data).hexdigest() != artifact["sha256"]:
                raise ValueError("Baseline checksum mismatch")
            (destination / name).write_bytes(data)
        training = (rows[0].get("metrics") or {}).get("training")
        if training:
            # Sidecar is local to this verified bundle, not a public artifact.
            training = {**training, "onnx_hashes": {name: sha256(destination / name) for name in FILES}}
            (destination / "baseline_metrics.json").write_text(json.dumps(training), encoding="utf-8")
        (destination / "approved_snapshot.json").write_text(json.dumps(rows[0].get("snapshot") or {"samples": []}), encoding="utf-8")

    def upload(self, path: str, file: Path) -> None:
        self.request("/storage/v1/object/sentiment-models/" + path, "POST", file.read_bytes(), "application/octet-stream")


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

    def __exit__(self, *_):
        self.stop.set()
        self.thread.join(timeout=65)


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
    (destination / "approved_training_samples.json").write_text(json.dumps(accepted, ensure_ascii=False), encoding="utf-8")
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
            reasons.append(f"{language}: macro-F1 {new['macro_f1']:.4f}, baseline {old['macro_f1']:.4f}; minimum {minimum_f1:.4f}, allowed drop {f1_tolerance:.4f}")
        for label in LABEL_ORDER:
            current, prior = new["per_class"][label], old["per_class"][label]
            if current["support"] < minimum_support:
                reasons.append(f"{language}/{label}: test support {current['support']} is below {minimum_support}")
            if not math.isfinite(current["recall"]) or current["recall"] + recall_tolerance < prior["recall"]:
                reasons.append(f"{language}/{label}: recall {current['recall']:.4f}, baseline {prior['recall']:.4f}; minimum {max(0.0, prior['recall'] - recall_tolerance):.4f}")
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


def run_scoped_training(command, candidate, requested, directory, lease):
    """Fit each declared language in isolation; expected quality failures do not
    discard another language's work. Unexpected crashes still fail the job."""
    failures, models = {}, []
    candidate.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    with (directory / 'training.log').open('w', encoding='utf-8') as log:
        log.write('Language-scoped training: ' + ', '.join(requested) + '\n'); log.flush()
        for language in requested:
            output = directory / 'language-candidates' / language
            output.parent.mkdir(exist_ok=True)
            args = list(command)
            args[args.index('--output-dir') + 1] = str(output)
            args += ['--languages', language]
            process = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT)
            try:
                while process.poll() is None:
                    lease.check()
                    if time.monotonic() - started > 7200:
                        raise RuntimeError('Training exceeded the two-hour limit')
                    time.sleep(1)
                if process.returncode:
                    failure = training_quality_failure(output)
                    if not failure or failure[0] != language:
                        raise RuntimeError(f'{language}: training process failed unexpectedly. Inspect the private training.log.')
                    failures[language] = failure[1]
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
        if mode not in ("continue", "fresh"):
            raise ValueError(f"Unsupported training mode {mode!r}; refusing to train")
        builtin_hashes = {name: sha256(baseline / name) for name in FILES}
        if builtin_hashes != job["snapshot"].get("builtin_hashes"):
            raise ValueError("Built-in model changed since job claim; refusing stale evaluation")
        if any(not (baseline / name).is_file() for name in FILES):
            raise ValueError("Baseline ONNX bundle is incomplete")
        (directory / "approved_snapshot.json").write_text(json.dumps(job["snapshot"], ensure_ascii=False), encoding="utf-8")
        merged = build_snapshot(data_dir, job["snapshot"], directory / "data")
        candidate = directory / "candidate"
        if mode == "fresh":
            # Fresh challenger: train from scratch on the full snapshot with a new
            # vocabulary. The built-in files are only an evaluation reference.
            command = [sys.executable, str(BASE / "train_sentiment.py"), "--data-dir", str(directory / "data"),
                       "--output-dir", str(candidate), "--baseline-model-dir", str(baseline)]
            if independent:
                command = command[:-2]  # No built-in validation metrics or selection floors.
                command.append('--independent-quality')
        else:
            command = [sys.executable, str(BASE / "continue_sentiment.py"), "--data-dir", str(directory / "data"),
                       "--output-dir", str(candidate), "--baseline-model-dir", str(baseline),
                       "--snapshot-file", str(directory / "approved_snapshot.json")]
            if independent:
                command.append('--independent-quality')
        command.insert(1, '-u')  # Progress logs must be visible while training, not only at exit.
        started = time.monotonic()
        training_failures = run_scoped_training(command, candidate, requested, directory, lease) if scoped else {}
        with (directory / "training.log").open("a" if scoped else "w", encoding="utf-8") as log:
            log.write(f"training mode: {mode}\n")
            log.flush()
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT) if not scoped else None
            try:
                while process is not None and process.poll() is None:
                    lease.check()
                    if time.monotonic() - started > 7200:
                        raise RuntimeError("Training exceeded the two-hour limit")
                    time.sleep(1)
                if process is not None and process.returncode != 0:
                    failure = training_quality_failure(candidate) if independent else None
                    if failure:
                        language, reasons, completed = failure
                        metrics = {'passed': False, 'admission': 'independent-v1',
                                   'pool_protocol': 1, 'training_mode': mode, 'data': merged,
                                   'failure_stage': 'validation_selection', 'failed_language': language,
                                   'completed_languages': completed,
                                   'reasons': [f'{language}: {reason}' for reason in reasons]}
                        (directory / 'evaluation.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
                        completed_text = f" {', '.join(completed)} finished fitting, but has not independently qualified for enabling." if completed else ''
                        cloud.rpc('fail', job, {'metrics': metrics, 'error': (
                            f'Validation quality checks failed for {language}. No candidate met the required '
                            'macro-F1 and per-class precision/recall minimums.' + completed_text +
                            ' This run evaluates all languages in the accumulated training pool; a Cebuano-only upload does not exclude older English/Filipino data. '
                            'No supporting model was registered. The built-in is unchanged.')[:1000]})
                        return
                    raise RuntimeError("Training command failed. Inspect the private worker training.log.")
            finally:
                if process is not None and process.poll() is None:
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
        splits = read_splits(directory / "data")
        metrics = (evaluate_independent(splits, candidate, builtin_hashes, requested, training_failures) if scoped else
                   evaluate_independent(splits, candidate, builtin_hashes) if independent else evaluate_bundle(splits["test"], baseline, candidate))
        metrics["pool_protocol"] = 1
        metrics["training_mode"] = mode
        metrics["data"] = merged
        metrics["base_model_hashes"] = {name: sha256(baseline / name) for name in FILES}
        training_metadata = candidate / "baseline_metrics.json"
        if training_metadata.is_file():
            metrics["training"] = json.loads(training_metadata.read_text(encoding="utf-8"))
        (directory / "evaluation.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
        lease.check()
        if not metrics["passed"]:
            details = "; ".join(metrics.get("reasons", []))[:850]
            cloud.rpc("fail", job, {"error": f"Evaluation gate failed: {details}. The active model is unchanged.", "metrics": metrics})
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
        for name in artifact_names:
            lease.check()
            file = candidate / name
            path = f"{job['id']}/{job['lease_token']}/{name}"
            if not 0 < file.stat().st_size <= 104857600:
                raise ValueError("Model artifact exceeds storage limits")
            cloud.upload(path, file)
            target = training_files if name in TRAINING_FILES else files
            target[name] = {"path": path, "sha256": sha256(file), "size": file.stat().st_size}
        lease.check()
        manifest = {"files": files, "training_files": training_files}
        if scoped:
            manifest['languages'] = metrics['qualified_languages']
        cloud.rpc("complete", job, {"manifest": manifest, "metrics": metrics})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=BASE / "processed")
    parser.add_argument("--baseline-model-dir", type=Path, default=BASE.parent / "server" / "models")
    parser.add_argument("--runs-dir", type=Path, default=BASE / "training-runs")
    parser.add_argument("--once", action="store_true", help="Process at most one available job, then exit")
    parser.add_argument("--env-file", type=Path, help="Optional private .env file (e.g. server/.env)")
    args = parser.parse_args()
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
    if capabilities.get("fresh_candidates") is True:
        print("Fresh challengers supported. Queue them from the admin Training panel; built-ins stay permanent.", flush=True)
    else:
        print("Fresh challengers unavailable until DB_Schema/migrations/sentiment_fresh_candidates.sql is applied.", flush=True)
    print('Independent held-out quality enabled. Passing candidates stay disabled for super-admin review; no built-in score comparison.', flush=True)
    print("Supporting-model worker started. Built-ins are permanent; candidates never replace older models.", flush=True)
    while True:
        job = None
        try:
            job = cloud.rpc("claim", payload={"pool_protocol": 1, "worker_protocol": "supporting-pool-v2", "admission_protocol": "independent-v1", 'language_scope_protocol': 1,
                                              "builtin_hashes": {
                                                  name: sha256(args.baseline_model_dir.resolve() / name) for name in FILES}})
            if job:
                print(f"Processing job {job['id']}", flush=True)
                process_job(cloud, job, args.data_dir.resolve(), args.baseline_model_dir.resolve(), args.runs_dir.resolve())
                print(f"Finished job {job['id']}; check the evaluation status in the admin UI.", flush=True)
            elif args.once:
                print("No claimable job. Queue training from the Training panel; queued jobs use a 30-second batching window.", flush=True)
        except KeyboardInterrupt:
            print("Worker stopped. An unfinished job will expire safely.", flush=True)
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
        print("Worker stopped. No startup job was claimed.", flush=True)
    except (CloudRequestError, ValueError, RuntimeError) as error:
        print(f"Worker could not start: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1) from None
