from __future__ import annotations

"""
Rank ambiguous single-word negative/neutral rows (per language) by how often the
token appears in the corpus, so relabeling targets frequent/real-world words
instead of every rare tail word.

Writes: datasets/processed/{lang}_relabel_targets.csv  (text, old_label, freq)

    python datasets/select_relabel_targets.py --language cebuano
    python datasets/select_relabel_targets.py --language filipino
"""

import argparse
import csv
from collections import Counter
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
PROCESSED = BASE_DIR / "processed"
SPLITS = ("train", "validation", "test")
MAX_TARGETS = 2000
LANGUAGES = ("cebuano", "filipino", "english")


def normalize(text: str) -> str:
    return " ".join(str(text).lower().split())


def main() -> None:
    parser = argparse.ArgumentParser(description="Select frequent ambiguous single-word relabel targets.")
    parser.add_argument("--language", choices=LANGUAGES, required=True)
    parser.add_argument("--max", type=int, default=MAX_TARGETS)
    args = parser.parse_args()
    lang = args.language

    out = PROCESSED / f"{lang}_relabel_targets.csv"
    frames = [pd.read_csv(PROCESSED / f"{s}.csv", dtype="string") for s in SPLITS]
    df = pd.concat(frames, ignore_index=True)
    sub = df[df["language"] == lang]

    freq: Counter[str] = Counter()
    for text in sub["text"]:
        for t in set(normalize(str(text)).split()):
            freq[t] += 1

    single = sub[~sub["text"].str.contains(" ", na=False)]
    neg_neu = single[single["label"].isin(["negative", "neutral"])]
    seen: dict[str, str] = {}
    for _, row in neg_neu.iterrows():
        key = normalize(str(row["text"]))
        if key and key not in seen:
            seen[key] = str(row["label"]).strip().lower()

    ranked = sorted(seen.items(), key=lambda kv: freq.get(kv[0], 0), reverse=True)
    targets = ranked[: args.max]

    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["text", "old_label", "freq"])
        writer.writeheader()
        for word, old in targets:
            writer.writerow({"text": word, "old_label": old, "freq": freq.get(word, 0)})

    print(f"[{lang}] ambiguous single-word neg/neu distinct: {len(seen)}")
    print(f"[{lang}] targets selected (top by freq): {len(targets)} -> {out}")
    print(f"top 15:")
    for word, old in targets[:15]:
        print(f"  freq={freq.get(word,0):5}  old={old:8}  {word}")


if __name__ == "__main__":
    main()
