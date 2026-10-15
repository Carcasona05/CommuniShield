from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path

import pandas as pd

from build_cebuano_splits import split_for
from build_single_words import (
    LABELS,
    mine_sentences,
    select_for_language,
)

BASE_DIR = Path(__file__).resolve().parent
PROCESSED = BASE_DIR / "processed"
REVIEW_FILES = (
    PROCESSED / "cebuano_prelabel_review.csv",
    PROCESSED / "cebuano_community_review.csv",
)
SPLITS = ("train", "validation", "test")
REQUIRED_COLUMNS = ("text", "language", "label", "split")
LANGUAGE = "cebuano"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rebuild the Cebuano portion of the processed sentiment splits."
    )
    parser.add_argument("--target", type=int, default=14_000)
    parser.add_argument("--dry-run", action="store_true", help="Preview counts without writing")
    return parser.parse_args()


def normalize(text: str) -> str:
    return " ".join(text.lower().split())


def read_rows(path: Path):
    if not path.is_file():
        return
    with path.open(newline="", encoding="utf-8") as handle:
        yield from csv.DictReader(handle)


def load_sentences() -> list[tuple[str, str]]:
    sentences: dict[str, tuple[str, str]] = {}
    for path in REVIEW_FILES:
        for row in read_rows(path):
            status = (row.get("review_status") or "").strip().lower()
            if status != "accepted":
                continue
            label = (row.get("final_label") or "").strip().lower()
            if label not in LABELS:
                label = (row.get("prelabel") or "").strip().lower()
            text = (row.get("text") or "").strip()
            if not text or label not in LABELS:
                continue
            key = normalize(text)
            if key not in sentences:
                sentences[key] = (text, label)
    return list(sentences.values())


def main() -> None:
    args = parse_args()
    sentences = load_sentences()
    label_counts = Counter(label for _, label in sentences)
    print(
        f"sentences={len(sentences)} negative={label_counts['negative']} "
        f"neutral={label_counts['neutral']} positive={label_counts['positive']}"
    )

    mined = mine_sentences(("cebuano", text, label) for text, label in sentences)
    sentence_keys = {normalize(text) for text, _ in sentences}
    word_target = max(0, args.target - len(sentences))
    words = select_for_language("cebuano", mined.get("cebuano", {}), word_target)
    words = [(word, label) for word, label in words if normalize(word) not in sentence_keys]
    print(f"mined_pool={sum(len(pool) for pool in mined.get('cebuano', {}).values())} words_selected={len(words)}")

    rows: list[dict[str, str]] = []
    for text, label in sentences:
        rows.append(
            {"text": text, "language": LANGUAGE, "label": label, "split": split_for(text)}
        )
    for word, label in words:
        rows.append(
            {
                "text": word,
                "language": LANGUAGE,
                "label": label,
                "split": split_for(f"{LANGUAGE}\0{word}"),
            }
        )
    print(f"total_cebuano_rows={len(rows)}")
    if not (10_000 <= len(rows) <= 15_000):
        print("WARNING: Cebuano row count outside the 10,000-15,000 target.")
    if args.dry_run:
        by_split_preview: dict[str, list[dict[str, str]]] = {split: [] for split in SPLITS}
        for row in rows:
            by_split_preview[row["split"]].append(row)
        for split in SPLITS:
            counts = Counter(row["label"] for row in by_split_preview[split])
            print(
                f"{split}: total={len(by_split_preview[split])} negative={counts['negative']} "
                f"neutral={counts['neutral']} positive={counts['positive']}"
            )
        print("dry run; nothing written")
        return

    by_split: dict[str, list[dict[str, str]]] = {split: [] for split in SPLITS}
    for row in rows:
        by_split[row["split"]].append(row)

    for split in SPLITS:
        path = PROCESSED / f"{split}.csv"
        frame = pd.read_csv(path, dtype="string")
        frame = frame[frame["language"].ne(LANGUAGE)]
        additions = pd.DataFrame(by_split[split], columns=list(REQUIRED_COLUMNS))
        combined = pd.concat([frame, additions], ignore_index=True)
        combined.to_csv(path, index=False)

    for split in SPLITS:
        counts = Counter(row["label"] for row in by_split[split])
        print(
            f"{split}: total={len(by_split[split])} negative={counts['negative']} "
            f"neutral={counts['neutral']} positive={counts['positive']}"
        )


if __name__ == "__main__":
    main()