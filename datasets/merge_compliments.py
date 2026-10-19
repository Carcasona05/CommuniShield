from __future__ import annotations

"""
Merge the generated/downloaded compliment samples into the processed
train/validation/test sentiment splits.

This is idempotent: rerunning it re-reads the compliment files, drops any
(text, language) already present in the splits, and appends the new positive
rows. Run it AFTER build_compliments.py and BEFORE train_sentiment.py.

    python datasets/merge_compliments.py
"""

import argparse
import csv
from collections import Counter
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
PROCESSED = BASE_DIR / "processed"
SPLITS = ("train", "validation", "test")
COLUMNS = ["text", "language", "label", "split"]
LANGUAGES = ("cebuano", "filipino", "english")


def normalize(text: str) -> str:
    return " ".join(str(text).lower().split())


def compliment_path(language: str) -> Path:
    return PROCESSED / f"compliments_{language}.csv"


def load_compliments() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for language in LANGUAGES:
        path = compliment_path(language)
        if not path.is_file():
            continue
        with path.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                text = (row.get("text") or "").strip()
                lang = (row.get("language") or language).strip().lower()
                if not text or lang != language:
                    continue
                rows.append(
                    {
                        "text": text,
                        "language": language,
                        "label": "positive",
                        "split": (row.get("split") or "").strip().lower(),
                    }
                )
    return rows


def existing_keys(frames: dict[str, pd.DataFrame]) -> set[tuple[str, str]]:
    keys: set[tuple[str, str]] = set()
    for frame in frames.values():
        for lang, text in zip(frame["language"], frame["text"]):
            keys.add((str(lang), normalize(text)))
    return keys


def ensure_splits(rows: list[dict[str, str]]) -> None:
    bad = [r for r in rows if r["split"] not in SPLITS]
    for row in bad:
        raise ValueError(f"compliment row has invalid split: {row}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge compliment samples into the sentiment splits.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    compliments = load_compliments()
    if not compliments:
        print("No compliment files found; nothing to merge.")
        return
    ensure_splits(compliments)

    frames: dict[str, pd.DataFrame] = {}
    for split in SPLITS:
        frames[split] = pd.read_csv(PROCESSED / f"{split}.csv", dtype="string")

    before = existing_keys(frames)
    to_add: list[dict[str, str]] = []
    skipped = 0
    for row in compliments:
        key = (row["language"], normalize(row["text"]))
        if key in before:
            skipped += 1
            continue
        before.add(key)
        to_add.append(row)

    by_split = Counter(r["split"] for r in to_add)
    by_lang = Counter(r["language"] for r in to_add)
    print(f"compliment rows read={len(compliments)} new={len(to_add)} already_present={skipped}")
    print(f"new by language: {dict(by_lang)}")
    print(f"new by split: {dict(by_split)}")

    if args.dry_run:
        print("dry run; nothing written")
        return

    for split in SPLITS:
        rows = [r for r in to_add if r["split"] == split]
        if not rows:
            continue
        path = PROCESSED / f"{split}.csv"
        frame = pd.read_csv(path, dtype="string")
        additions = pd.DataFrame(rows, columns=COLUMNS)
        combined = pd.concat([frame, additions], ignore_index=True)
        combined.to_csv(path, index=False)
        print(f"{split}: added {len(rows)} -> {len(combined)} total rows")

    # Final per-language label distribution so the balance is visible.
    print("\n=== label distribution after merge ===")
    all_rows = pd.concat([pd.read_csv(PROCESSED / f"{s}.csv", dtype="string") for s in SPLITS], ignore_index=True)
    for language in LANGUAGES:
        sub = all_rows[all_rows["language"] == language]
        if sub.empty:
            continue
        dist = sub["label"].value_counts(normalize=True).round(3).to_dict()
        print(f"{language}: n={len(sub)} {dist}")


if __name__ == "__main__":
    main()
