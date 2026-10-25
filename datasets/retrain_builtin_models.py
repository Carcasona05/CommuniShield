"""Stage improved built-ins without modifying served files, data or cloud state.

The optional install step requires stopped services and passing acceptance gates.
Parameter selection uses validation only; test/challenge results only accept or
reject a candidate, never tune it. Authored additions need human language review.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


from builtin_sentiment_examples import CHECKS, REPORTED_CASES, training_examples, normalize
from import_approved_sentiment import text_key
from sentiment_training_worker import FILES, predictions, scores, sha256
from train_sentiment import load_splits, train_language

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
LANGUAGES = ("cebuano", "english", "filipino")


def inputs():
    return ([ROOT / "server/models" / name for name in FILES]
            + [BASE / "models" / f"sentiment_{lang}.{ext}" for lang in LANGUAGES for ext in ("onnx", "joblib")]
            + [BASE / "models/baseline_metrics.json"]
            + [BASE / "models/language_id.onnx"]
            + [BASE / "processed" / f"{split}.csv" for split in ("train", "validation", "test")])


def prepare_data(output: Path):
    """Quarantine overlaps/duplicates in a NEW snapshot, never edit originals."""
    splits = {}
    for split in ("train", "validation", "test"):
        with (BASE / "processed" / f"{split}.csv").open(encoding="utf-8", newline="") as stream:
            splits[split] = list(csv.DictReader(stream))
    heldout = {text_key(row) for split in ("validation", "test") for row in splits[split]}
    reported = {("cebuano", normalize(text)) for text, _ in REPORTED_CASES}
    labels = {}
    for row in splits["train"]:
        labels.setdefault(text_key(row), set()).add(row["label"])
    train, seen = [], set()
    excluded = {"heldout_overlaps": 0, "conflicting_rows": 0, "duplicates": 0, "reported_regressions": 0}
    for row in splits["train"]:
        key = text_key(row)
        if key in heldout:
            excluded["heldout_overlaps"] += 1
        elif (row["language"], normalize(row["text"])) in reported:
            excluded["reported_regressions"] += 1
        elif len(labels[key]) > 1:
            excluded["conflicting_rows"] += 1
        elif key in seen:
            excluded["duplicates"] += 1
        else:
            seen.add(key); train.append(row)
    additions = []
    for row in training_examples():
        key = text_key(row)
        if key not in seen and key not in heldout and key not in labels:
            seen.add(key); additions.append(row)
    output.mkdir()
    for name, rows in (("train.csv", train + additions), ("authored_additions.csv", additions)):
        with (output / name).open("w", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=["text", "language", "label", "split"])
            writer.writeheader(); writer.writerows(rows)
    for split in ("validation", "test"):
        shutil.copyfile(BASE / "processed" / f"{split}.csv", output / f"{split}.csv")
    return {"added": len(additions), "excluded": excluded,
            "holdout_hashes": {split: sha256(output / f"{split}.csv") for split in ("validation", "test")}}


def measure(model: Path, rows):
    labels = [row["label"] for row in rows]
    predicted = predictions(model, [row["text"] for row in rows])
    return {**scores(labels, predicted), "accuracy": sum(a == b for a, b in zip(labels, predicted)) / len(labels)}


def checks(model, language):
    rows = CHECKS[language]
    predicted = predictions(model, [text for text, _ in rows])
    return [{"text": text, "expected": label, "predicted": prediction, "correct": label == prediction}
            for (text, label), prediction in zip(rows, predicted)]


def acceptance(language, old, new, before, after):
    reasons = []
    if new["macro_f1"] < old["macro_f1"] + 0.001:
        reasons.append("Macro-F1 did not improve by at least 0.001")
    if new["accuracy"] < old["accuracy"] - 0.005:
        reasons.append("Accuracy declined by more than 0.005")
    for label in ("negative", "neutral", "positive"):
        if new["per_class"][label]["recall"] < old["per_class"][label]["recall"] - 0.02:
            reasons.append(f"{label} recall declined by more than 0.02")
    if any(a["correct"] and not b["correct"] for a, b in zip(before, after)):
        reasons.append("A previously correct regression check became incorrect")
    if language == "cebuano":
        results = {row["text"]: row["predicted"] for row in after}
        if any(results.get(text) != label for text, label in REPORTED_CASES):
            reasons.append("Not all three user-reported sentiment cases were corrected")
    return {"passed": not reasons, "reasons": reasons}


def stage():
    for language in LANGUAGES:
        if sha256(BASE / "models" / f"sentiment_{language}.onnx") != sha256(ROOT / "server/models" / f"sentiment_{language}.onnx"):
            raise ValueError(f"The bootstrap state and served {language} ONNX do not match. Resolve that mismatch before retraining.")
    run = BASE / "training-runs" / ("builtin-retrain-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:6])
    run.mkdir()
    source_hashes = {str(path.relative_to(ROOT)): sha256(path) for path in inputs()}
    backup = run / "backup"
    for relative in source_hashes:
        destination = backup / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, destination)
    print(f"Staging directory: {run}", flush=True)
    provenance = prepare_data(run / "data")
    frames = load_splits(run / "data")
    output = run / "candidate"
    output.mkdir()
    selected = run / "selected"
    selected.mkdir()
    baseline = ROOT / "server/models"
    original_manifest = json.loads((BASE / "models/baseline_metrics.json").read_text(encoding="utf-8"))
    original_metadata = {model["language"]: model for model in original_manifest["models"]}
    results, metadata = {}, []
    for language in LANGUAGES:
        print(f"Training {language} with word/character context features; validation selects parameters", flush=True)
        baseline_model = baseline / f"sentiment_{language}.onnx"
        rows = frames["test"].loc[frames["test"]["language"].eq(language)].to_dict("records")
        old = measure(baseline_model, rows)
        before = checks(baseline_model, language)
        try:
            candidate_metadata = train_language(language, frames["train"], frames["validation"], frames["test"],
                                                output, baseline, word_max_ngram=3)
            new = measure(output / f"sentiment_{language}.onnx", rows)
            after = checks(output / f"sentiment_{language}.onnx", language)
            gate = acceptance(language, old, new, before, after)
            results[language] = {"baseline": old, "candidate": new, "before": before, "after": after, **gate}
        except ValueError as error:
            candidate_metadata = None
            gate = {"passed": False, "reasons": [str(error)]}
            results[language] = {"baseline": old, "before": before, **gate}
        source = output if gate["passed"] else BASE / "models"
        for extension in ("onnx", "joblib"):
            shutil.copyfile(source / f"sentiment_{language}.{extension}", selected / f"sentiment_{language}.{extension}")
        metadata.append(candidate_metadata if gate["passed"] else original_metadata[language])
        print(json.dumps({"language": language, "accepted": gate["passed"], "reasons": gate["reasons"]}), flush=True)
    shutil.copyfile(baseline / "language_id.onnx", selected / "language_id.onnx")
    (selected / "baseline_metrics.json").write_text(json.dumps({
        "models": metadata, "input_split_hashes": {split: sha256(run / "data" / f"{split}.csv") for split in ("train", "validation", "test")},
        "onnx_hashes": {name: sha256(selected / name) for name in FILES},
        "trainer_sha256": sha256(BASE / "train_sentiment.py"),
        "provenance": "Authored draft contrastive examples. Regression checks are not an independent benchmark.",
    }, indent=2), encoding="utf-8")
    report = {"source_hashes": source_hashes, "data": provenance, "languages": results,
              "accepted_languages": [language for language in LANGUAGES if results[language]["passed"]],
              "selected_hashes": {path.name: sha256(path) for path in selected.iterdir()},
              "served_models_changed": False, "cloud_writes": False}
    (run / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if source_hashes != {relative: sha256(ROOT / relative) for relative in source_hashes}:
        raise ValueError("A source model or data file changed during staging. Do not install this run.")
    print(json.dumps({"run": str(run), "accepted_languages": report["accepted_languages"],
                      "active_models_unchanged": True}, indent=2), flush=True)


def install(run: Path, services_stopped: bool):
    if not services_stopped:
        raise ValueError("Stop the backend and all training workers, then confirm --services-stopped. Ensure the app currently uses the built-in model.")
    report = json.loads((run / "report.json").read_text(encoding="utf-8"))
    if not report["accepted_languages"]:
        raise ValueError("No candidate met acceptance gates; nothing can be installed")
    for relative, expected in report["source_hashes"].items():
        if sha256(ROOT / relative) != expected:
            raise ValueError(f"Source changed since evaluation: {relative}. Refusing to overwrite it.")
    for name, expected in report["selected_hashes"].items():
        if sha256(run / "selected" / name) != expected:
            raise ValueError("Staged bundle checksum mismatch")
    targets = [(run / "selected" / name, ROOT / "server/models" / name) for name in FILES]
    targets += [(path, BASE / "models" / path.name) for path in (run / "selected").iterdir()]
    replaced = []
    try:
        for source, target in targets:
            with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as handle:
                temporary = Path(handle.name)
            try:
                shutil.copyfile(source, temporary)
                shutil.copymode(target, temporary)
                os.replace(temporary, target)
            finally:
                temporary.unlink(missing_ok=True)
            replaced.append(target)
    except Exception:
        for target in replaced:
            shutil.copyfile(run / "backup" / target.relative_to(ROOT), target)
        raise
    print("Accepted built-in files installed. Backups remain under:", run / "backup", flush=True)
    print("Restart the backend and worker. Existing stored analyses were NOT modified.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", type=Path, help="Install a completed accepted staging run")
    parser.add_argument("--services-stopped", action="store_true")
    args = parser.parse_args()
    if args.install:
        install(args.install.resolve(), args.services_stopped)
    else:
        stage()


if __name__ == "__main__":
    main()
