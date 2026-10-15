from __future__ import annotations

import argparse
import ast
import csv
import random
import re
from pathlib import Path
from typing import Sequence, cast

import pandas as pd

from build_single_words import LEXICON

BASE_DIR = Path(__file__).resolve().parent
RAW_PATH = BASE_DIR / "raw" / "cebuano_sentences_train.csv"
REVIEW_PATH = BASE_DIR / "processed" / "cebuano_prelabel_review.csv"
WORKSHEET_PATH = BASE_DIR / "cebuano_label_worksheet.csv"
SPLITS = ("train", "validation", "test")
LABELS = ("negative", "neutral", "positive")
MIN_LENGTH = 15
MAX_LENGTH = 120
WORD_RE = re.compile(r"[a-zñáéíóúü]+", re.IGNORECASE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a Cebuano sentence labeling worksheet for human review."
    )
    parser.add_argument("--input", type=Path, default=RAW_PATH)
    parser.add_argument("--review", type=Path, default=REVIEW_PATH)
    parser.add_argument("--output", type=Path, default=WORKSHEET_PATH)
    parser.add_argument("--count", type=int, default=500)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--sentiment-fraction", type=float, default=0.6)
    return parser.parse_args()


def extract_pair(raw: object) -> tuple[str, str] | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        parsed = ast.literal_eval(raw)
    except (ValueError, SyntaxError):
        return None
    if not isinstance(parsed, (list, tuple)):
        return None
    items = cast(Sequence[object], parsed)
    if len(items) < 2:
        return None
    source = str(items[0]).strip()
    cebuano = str(items[1]).strip()
    if not source or not cebuano:
        return None
    return source, cebuano


def normalize(text: str) -> str:
    return " ".join(text.lower().split())


def load_excluded(path: Path) -> set[str]:
    excluded: set[str] = set()
    if path.is_file():
        with path.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                text = (row.get("text") or "").strip()
                if text:
                    excluded.add(normalize(text))
    return excluded


def load_candidates(path: Path) -> list[tuple[str, str]]:
    frame = pd.read_csv(path, dtype="string")
    if "set" not in frame.columns:
        raise ValueError(f"{path} must have a 'set' column")
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for raw in list(frame["set"]):
        pair = extract_pair(raw)
        if not pair:
            continue
        source, cebuano = pair
        key = normalize(cebuano)
        if key in seen:
            continue
        if not (MIN_LENGTH <= len(cebuano) <= MAX_LENGTH):
            continue
        seen.add(key)
        out.append((source, cebuano))
    return out


def build_sentiment_vocab() -> set[str]:
    vocab: set[str] = set()
    for language in ("cebuano", "filipino"):
        for words in LEXICON.get(language, {}).values():
            vocab.update(word.lower() for word in words)
    return vocab


def has_sentiment(text: str, vocab: set[str]) -> bool:
    return any(token in vocab for token in WORD_RE.findall(text.lower()))


def main() -> None:
    args = parse_args()
    candidates = load_candidates(args.input.resolve())
    excluded = load_excluded(args.review.resolve())
    for split in SPLITS:
        excluded |= load_excluded(BASE_DIR / "processed" / f"{split}.csv")
    candidates = [pair for pair in candidates if normalize(pair[1]) not in excluded]

    vocab = build_sentiment_vocab()
    rng = random.Random(args.seed)
    sentiment_pool = [pair for pair in candidates if has_sentiment(pair[1], vocab) or has_sentiment(pair[0], vocab)]
    neutral_pool = [pair for pair in candidates if pair not in sentiment_pool]
    rng.shuffle(sentiment_pool)
    rng.shuffle(neutral_pool)

    target_sentiment = int(args.count * max(0.0, min(1.0, args.sentiment_fraction)))
    selected = sentiment_pool[:target_sentiment]
    selected += neutral_pool[: args.count - len(selected)]
    if len(selected) < args.count:
        remaining = [pair for pair in sentiment_pool[target_sentiment:] if pair not in selected]
        selected += remaining[: args.count - len(selected)]

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "text", "filipino_source", "label", "notes"])
        for index, (source, cebuano) in enumerate(selected, 1):
            writer.writerow([index, cebuano, source, "", ""])

    print(f"candidates={len(candidates)} selected={len(selected)} count={args.count}")
    print(f"worksheet: {output}")
    print("Fill the 'label' column with negative, neutral, or positive. Partial batches are fine.")


if __name__ == "__main__":
    main()
