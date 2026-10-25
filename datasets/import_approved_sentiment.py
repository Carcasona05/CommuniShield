"""Merge an approved JSON export into a NEW training snapshot, never test data.

Dry run:
  python datasets/import_approved_sentiment.py --dataset approved.json
Apply to a new folder, then train with train_sentiment.py --data-dir <folder>:
  python datasets/import_approved_sentiment.py --dataset approved.json --output-dir datasets/reviewed-run-1 --apply
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import unicodedata
from pathlib import Path

COLUMNS = ["text", "language", "label", "split"]
LANGUAGES = {"english", "filipino", "cebuano"}
LABELS = {"positive", "neutral", "negative"}


def text_key(row: dict[str, str]) -> tuple[str, str]:
    return row["language"], " ".join(unicodedata.normalize("NFKC", row["text"]).split()).lower()


def select_examples(samples: list[dict[str, str]], splits: dict[str, list[dict[str, str]]]) -> tuple[list[dict[str, str]], dict[str, int]]:
    held_out = {text_key(row) for split in ("validation", "test") for row in splits[split]}
    labels: dict[tuple[str, str], set[str]] = {}
    for row in splits["train"] + samples:
        labels.setdefault(text_key(row), set()).add(row["label"])
    seen = {text_key(row) for row in splits["train"]}
    accepted: list[dict[str, str]] = []
    counts = {"accepted": 0, "duplicates": 0, "conflicts": 0, "held_out": 0}
    for row in samples:
        key = text_key(row)
        if key in held_out:
            counts["held_out"] += 1
        elif len(labels[key]) > 1:
            counts["conflicts"] += 1
        elif key in seen:
            counts["duplicates"] += 1
        else:
            accepted.append({**row, "split": "train"})
            seen.add(key)
            counts["accepted"] += 1
    return accepted, counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parent / "processed")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    raw = args.dataset.read_bytes()
    export = json.loads(raw)
    if not isinstance(export, dict) or export.get("status") != "approved" or not export.get("dataset_id") or not isinstance(export.get("version"), int) or isinstance(export["version"], bool) or export["version"] < 1:
        raise ValueError("Use an approved training JSON export from Sentiment Datasets")
    samples = export.get("samples")
    if not isinstance(samples, list) or not 1 <= len(samples) <= 1000:
        raise ValueError("Expected 1 to 1000 examples")
    for row in samples:
        if not isinstance(row, dict) or set(row) != {"text", "language", "label"} or not all(isinstance(row[key], str) for key in ("text", "language", "label")) or not 1 <= len(row["text"].strip()) <= 2000 or row["language"] not in LANGUAGES or row["label"] not in LABELS:
            raise ValueError("Invalid exported example")
    splits: dict[str, list[dict[str, str]]] = {}
    for split in ("train", "validation", "test"):
        with (args.data_dir / f"{split}.csv").open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if set(reader.fieldnames or []) != set(COLUMNS):
                raise ValueError(f"Invalid {split}.csv columns")
            splits[split] = list(reader)
            if any(row["split"] != split for row in splits[split]):
                raise ValueError(f"Incorrect split values in {split}.csv")
    accepted, counts = select_examples(samples, splits)
    manifest = {"dataset_id": export["dataset_id"], "dataset_version": export["version"], "export_sha256": hashlib.sha256(raw).hexdigest(), **counts}
    print(json.dumps(manifest, indent=2))
    if not args.apply:
        print("Dry run only; no files changed. Use --apply --output-dir <new folder> to write.")
        return
    if args.output_dir is None or args.output_dir.resolve() == args.data_dir.resolve():
        raise ValueError("Provide a NEW --output-dir; the original training splits must remain unchanged")
    # Refuse to overwrite any existing snapshot or user files.
    args.output_dir.mkdir(parents=True, exist_ok=False)
    with (args.output_dir / "train.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(splits["train"] + accepted)
    for split in ("validation", "test"):
        shutil.copyfile(args.data_dir / f"{split}.csv", args.output_dir / f"{split}.csv")
    (args.output_dir / "dataset_import_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("Training snapshot created. Train and evaluate separately; active ONNX models are unchanged.")


if __name__ == "__main__":
    main()
