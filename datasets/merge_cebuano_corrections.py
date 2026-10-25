"""Persist authored Cebuano corrections in the shared processed training split.

Preview: python datasets/merge_cebuano_corrections.py
Apply:   python datasets/merge_cebuano_corrections.py --apply

Never changes validation/test data, database datasets or model activation.
Existing training labels are preserved; conflicts are skipped for review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from cebuano_contrastive_examples import build_training_rows, normalize
from train_sentiment import load_splits

BASE = Path(__file__).resolve().parent


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def select_corrections(frames, source):
    def key(row):
        return (str(row["language"]).strip().lower(), normalize(str(row["text"])))

    protected = {key(row) for split in ("validation", "test") for row in frames[split].to_dict("records")}
    labels = {}
    for row in frames["train"].to_dict("records") + source:
        labels.setdefault(key(row), set()).add(row["label"])
    seen = {key(row) for row in frames["train"].to_dict("records")}
    accepted = []
    counts = dict(source=len(source), accepted=0, duplicates=0, held_out=0, conflicts=0)
    for row in source:
        item = key(row)
        if item in protected:
            counts["held_out"] += 1
        elif len(labels[item]) > 1:
            counts["conflicts"] += 1
        elif item in seen:
            counts["duplicates"] += 1
        else:
            accepted.append({**row, "split": "train"})
            seen.add(item)
            counts["accepted"] += 1
    return accepted, counts


def merge(data_dir: Path, backup_root: Path, apply: bool):
    frames = load_splits(data_dir)
    hashes = {split: sha256(data_dir / f"{split}.csv") for split in frames}
    source = build_training_rows()
    additions, counts = select_corrections(frames, source)
    report = {
        "provenance": "Authored Cebuano contrastive examples from datasets/cebuano_contrastive_examples.py; no model-generated labels.",
        "counts": counts,
        "added_by_label": pd.Series([r["label"] for r in additions], dtype="string").value_counts().to_dict(),
        "train_rows_before": len(frames["train"]),
        "train_rows_after": len(frames["train"]) + len(additions),
        "holdout_sha256": {split: hashes[split] for split in ("validation", "test")},
        "applied": False,
    }
    if not apply or not additions:
        return report
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = backup_root / stamp
    backup.mkdir(parents=True, exist_ok=False)
    original = (data_dir / "train.csv").read_bytes()
    (backup / "train.before.csv").write_bytes(original)
    pd.DataFrame(additions).to_csv(backup / "corrections_added.csv", index=False)
    merged = pd.concat([frames["train"], pd.DataFrame(additions)], ignore_index=True)
    temporary = data_dir / f".train.cebuano-corrections-{stamp}.csv"
    try:
        merged.to_csv(temporary, index=False)
        # Refuse to overwrite edits made since the initial read.
        if any(sha256(data_dir / f"{split}.csv") != hashes[split] for split in frames):
            raise RuntimeError("A split changed during the merge; nothing was replaced.")
        os.replace(temporary, data_dir / "train.csv")
    finally:
        if temporary.exists():
            temporary.unlink()
    load_splits(data_dir)
    for split in ("validation", "test"):
        if sha256(data_dir / f"{split}.csv") != hashes[split]:
            raise RuntimeError("A protected holdout changed during the merge.")
    report.update(applied=True, backup_directory=str(backup), train_sha256_after=sha256(data_dir / "train.csv"))
    (backup / "manifest.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    report = merge(BASE / "processed", BASE.parent / "artifacts" / "dataset-merges" / "cebuano-corrections", args.apply)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if not args.apply:
        print("Dry run only. Use --apply to persist training additions.")


if __name__ == "__main__":
    main()
