from __future__ import annotations

"""
Repair the Cebuano portion of the processed sentiment splits.

The original single-word miner assigned a word the label of the sentence it
appeared in. Praise words like "gwapo", "gwapa", "nindot", "maayo" only ever
occurred inside negative crime/fake-news headlines, so they were written into
the splits as NEGATIVE single-word samples. That is the direct cause of
"gwapo" being classified as negative at inference time.

This script removes those context-mined poison rows: any Cebuano SINGLE-WORD
row labelled negative/neutral whose token is actually unambiguous praise. The
correct positive examples are supplied separately by build_compliments.py /
merge_compliments.py.

    python datasets/repair_cebuano_splits.py [--apply]
"""

import argparse
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
PROCESSED = BASE_DIR / "processed"
SPLITS = ("train", "validation", "test")

# Unambiguous Cebuano/praise tokens. If a single-word row carries one of these
# but is labelled negative or neutral, it is a context-mining artefact.
PRAISE_TOKENS = {
    "gwapo", "gwapa", "pogi", "nindot", "maanindot", "nindota",
    "maayo", "kaayo", "kaayohan", "grabe", "solid", "astig", "lupet",
    "idol", "bida", "salamat", "malumi", "buotan", "malipayon", "lipay",
    "himaya", "maalamon", "paspas", "lig-on", "dayag", "hingpit",
}


def normalize(text: str) -> str:
    return " ".join(str(text).lower().split())


def is_single_word(text: str) -> bool:
    return len(str(text).split()) == 1


def is_poison(row: pd.Series) -> bool:
    text = normalize(row["text"])
    label = str(row["label"]).strip().lower()
    language = str(row["language"]).strip().lower()
    if language != "cebuano":
        return False
    if not is_single_word(text):
        return False
    if label not in {"negative", "neutral"}:
        return False
    # Strip punctuation the miner may have kept (e.g. "gwapa,").
    token = text.strip(".,!?;:\"'()…")
    return token in PRAISE_TOKENS


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove context-mined Cebuano praise poison rows.")
    parser.add_argument("--apply", action="store_true", help="Write changes (default is a dry run)")
    args = parser.parse_args()

    total_removed = 0
    for split in SPLITS:
        path = PROCESSED / f"{split}.csv"
        frame = pd.read_csv(path, dtype="string")
        mask = frame.apply(is_poison, axis=1)
        removed = frame[mask]
        if not removed.empty:
            print(f"\n{split}: removing {len(removed)} poison rows")
            for _, row in removed.iterrows():
                print(f"  - {row['text']!r} was labelled {row['label']}")
        total_removed += int(mask.sum())
        if args.apply:
            kept = frame[~mask]
            kept.to_csv(path, index=False)

    print(f"\ntotal poison rows {'removed' if args.apply else 'found'}: {total_removed}")
    if not args.apply:
        print("dry run; pass --apply to write changes")


if __name__ == "__main__":
    main()
