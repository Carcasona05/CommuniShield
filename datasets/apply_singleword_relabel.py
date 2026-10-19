from __future__ import annotations

"""
Apply Gemini-relabelled single-word labels back into the processed splits.

Reads cebuano_singleword_relabel.csv (produced by relabel_singlewords.py) and
overwrites the label of each matching Cebuano single-word row in train/validation/test.
Rows whose label already matches are left untouched. Idempotent.

    python datasets/apply_singleword_relabel.py [--apply]
"""

import argparse
import csv
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
PROCESSED = BASE_DIR / "processed"
SPLITS = ("train", "validation", "test")
VALID_LABELS = {"negative", "neutral", "positive"}
LANGUAGES = ("cebuano", "filipino", "english")

LANGUAGE = "cebuano"


def relabel_path() -> Path:
    return PROCESSED / f"{LANGUAGE}_singleword_relabel.csv"


def normalize(text: str) -> str:
    return " ".join(str(text).lower().split())


def load_relabels() -> dict[str, str]:
    mapping: dict[str, str] = {}
    path = relabel_path()
    if not path.is_file():
        raise SystemExit(f"missing {path}; run relabel_singlewords.py --language {LANGUAGE} first")
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            key = normalize(row.get("text") or "")
            label = (row.get("new_label") or "").strip().lower()
            if key and label in VALID_LABELS:
                mapping[key] = label
    return mapping


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply Gemini single-word relabels to the splits.")
    parser.add_argument("--language", choices=LANGUAGES, default="cebuano")
    parser.add_argument("--apply", action="store_true", help="Write changes (default dry run)")
    args = parser.parse_args()

    global LANGUAGE
    LANGUAGE = args.language

    mapping = load_relabels()
    print(f"[{LANGUAGE}] loaded {len(mapping)} relabels")

    total_changed = 0
    flips: dict[tuple[str, str], int] = {}
    for split in SPLITS:
        path = PROCESSED / f"{split}.csv"
        frame = pd.read_csv(path, dtype="string")
        changed = 0
        for idx, row in frame.iterrows():
            if str(row["language"]).strip().lower() != LANGUAGE:
                continue
            text = str(row["text"])
            if " " in text.strip():
                continue  # single-word only
            key = normalize(text)
            new_label = mapping.get(key)
            if new_label and new_label != str(row["label"]).strip().lower():
                flips[(str(row["label"]).strip().lower(), new_label)] = flips.get(
                    (str(row["label"]).strip().lower(), new_label), 0
                ) + 1
                frame.at[idx, "label"] = new_label
                changed += 1
        total_changed += changed
        print(f"{split}: relabeled {changed} rows")
        if args.apply:
            frame.to_csv(path, index=False)

    print(f"\ntotal relabeled: {total_changed}")
    if flips:
        print("label transitions (old -> new):")
        for (old, new), count in sorted(flips.items(), key=lambda x: -x[1]):
            print(f"  {old:8} -> {new:8} : {count}")
    if not args.apply:
        print("dry run; pass --apply to write changes")


if __name__ == "__main__":
    main()
