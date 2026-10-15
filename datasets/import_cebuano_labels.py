from __future__ import annotations

import argparse
import csv
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
WORKSHEET_PATH = BASE_DIR / "cebuano_label_worksheet.csv"
REVIEW_PATH = BASE_DIR / "processed" / "cebuano_prelabel_review.csv"
LABELS = ("negative", "neutral", "positive")
FIELDNAMES = [
    "text",
    "language",
    "prelabel",
    "prelabel_confidence",
    "review_status",
    "final_label",
    "reviewer_notes",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import a filled Cebuano labeling worksheet into the review file."
    )
    parser.add_argument("--worksheet", type=Path, default=WORKSHEET_PATH)
    parser.add_argument("--review", type=Path, default=REVIEW_PATH)
    return parser.parse_args()


def normalize(text: str) -> str:
    return " ".join(text.lower().split())


def read_existing(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    existing: set[str] = set()
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            text = (row.get("text") or "").strip()
            if text:
                existing.add(normalize(text))
    return existing


def main() -> None:
    args = parse_args()
    worksheet = args.worksheet.resolve()
    review = args.review.resolve()
    if not worksheet.is_file():
        raise SystemExit(f"Worksheet not found: {worksheet}")

    existing = read_existing(review)
    rows: list[dict[str, str]] = []
    invalid = 0
    duplicate = 0
    blank = 0
    with worksheet.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            text = (row.get("text") or "").strip()
            raw_label = (row.get("label") or "").strip().lower()
            notes = (row.get("notes") or "").strip()
            if not text:
                continue
            if not raw_label:
                blank += 1
                continue
            if raw_label not in LABELS:
                invalid += 1
                continue
            if normalize(text) in existing:
                duplicate += 1
                continue
            existing.add(normalize(text))
            rows.append(
                {
                    "text": text,
                    "language": "cebuano",
                    "prelabel": raw_label,
                    "prelabel_confidence": "1.0000",
                    "review_status": "accepted",
                    "final_label": raw_label,
                    "reviewer_notes": f"human worksheet{': ' + notes if notes else ''}",
                }
            )

    if not rows:
        print(f"nothing to import (blank={blank} invalid={invalid} duplicate={duplicate})")
        return

    review.parent.mkdir(parents=True, exist_ok=True)
    write_header = not review.is_file()
    with review.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, extrasaction="ignore")
        if write_header:
            writer.writeheader()
        writer.writerows(rows)

    print(f"imported={len(rows)} blank={blank} invalid={invalid} duplicate={duplicate}")
    print(f"review file: {review}")
    print("Next: python build_cebuano_splits.py; python build_single_words.py; python train_sentiment.py")


if __name__ == "__main__":
    main()
