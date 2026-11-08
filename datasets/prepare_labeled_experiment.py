"""Merge external labeled candidates into an isolated experimental train snapshot.

Never mark sources as admin-approved, change source labels, or modify held-outs.
Test text is read only to exclude overlap; test labels are not used for selection.
"""
import argparse
import csv
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

from import_approved_sentiment import COLUMNS, LABELS, text_key

BASE = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(data_dir, source_files, output):
    if output.resolve() == data_dir.resolve() or output.resolve().is_relative_to(data_dir.resolve()):
        raise ValueError("Use a separate new experimental output directory")
    frames = {}
    for split in ("train", "validation", "test"):
        with (data_dir / f"{split}.csv").open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if set(reader.fieldnames or []) != set(COLUMNS):
                raise ValueError("Unexpected source split columns")
            frames[split] = list(reader)
    # Holdout labels deliberately never enter this lookup.
    heldout_text = {text_key(row)[1] for split in ("validation", "test") for row in frames[split]}
    train_labels = {}
    for row in frames["train"]:
        train_labels.setdefault(text_key(row), set()).add(row["label"])
    additions, provenance = [], []
    for file in source_files:
        with file.open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        provenance.append({"path": str(file), "sha256": digest(file), "rows": len(rows)})
        for row in rows:
            if row.get("language") not in ("english", "filipino") or row.get("label") not in LABELS or not row.get("text", "").strip():
                raise ValueError("Only labeled English/Filipino sentences are accepted")
            if row.get("split") != "train":
                raise ValueError("Do not import external holdout examples")
            additions.append({"text": row["text"], "language": row["language"], "label": row["label"], "split": "train"})
    all_labels = {key: set(values) for key, values in train_labels.items()}
    for row in additions:
        all_labels.setdefault(text_key(row), set()).add(row["label"])
    accepted, counts, seen = [], Counter(), set(train_labels)
    for row in additions:
        key = text_key(row)
        if key[1] in heldout_text:
            counts["heldout_overlap_excluded"] += 1
        elif len(all_labels[key]) > 1:
            counts["label_conflict_excluded"] += 1
        elif key in seen:
            counts["duplicate_excluded"] += 1
        else:
            accepted.append(row)
            seen.add(key)
            counts[f"accepted_{row['language']}"] += 1
    output.mkdir(parents=True, exist_ok=False)
    with (output / "train.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(frames["train"] + accepted)
    for split in ("validation", "test"):
        shutil.copyfile(data_dir / f"{split}.csv", output / f"{split}.csv")
        assert digest(data_dir / f"{split}.csv") == digest(output / f"{split}.csv")
    manifest = {"experimental_only": True, "admin_approved": False,
                "domain_privacy_license_review": "Source-labeled; downstream domain/privacy review remains pending. English source is CC BY-NC-SA 4.0: noncommercial research experiments only.",
                "counts": dict(counts), "sources": provenance,
                "original_split_hashes": {split: digest(data_dir / f"{split}.csv") for split in frames},
                "new_train_sha256": digest(output / "train.csv"), "cebuano_changed": False}
    (output / "external_sources_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=BASE / "processed")
    parser.add_argument("--sources", nargs="+", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.data_dir, args.sources, args.output_dir)
