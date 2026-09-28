from __future__ import annotations

import argparse
import csv
import hashlib
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_REVIEW = BASE_DIR / "processed" / "cebuano_prelabel_review.csv"
DEFAULT_DATA_DIR = BASE_DIR / "processed"
SPLITS = ("train", "validation", "test")
TRAIN_LABELS = ("negative", "neutral", "positive")
REQUIRED_COLUMNS = ("text", "language", "label", "split")
LANGUAGE = "cebuano"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Merge reviewed Cebuano prelabels into datasets/processed/{train,validation,test}.csv. "
            "Only rows with review_status=accepted and a final_label are used unless --accept-prelabels."
        )
    )
    parser.add_argument("--review", type=Path, default=DEFAULT_REVIEW)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument(
        "--accept-prelabels",
        action="store_true",
        help="Skip the human review step and use Gemini prelabels as final labels.",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.0,
        help="Drop prelabels below this confidence (only applies with --accept-prelabels).",
    )
    return parser.parse_args()


def split_for(text: str) -> str:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    ratio = int(digest[:8], 16) / 0xFFFFFFFF
    if ratio < 0.8:
        return "train"
    if ratio < 0.9:
        return "validation"
    return "test"


def load_review(path: Path, accept_prelabels: bool, min_confidence: float) -> tuple[list[dict[str, str]], dict[str, int]]:
    if not path.is_file():
        raise SystemExit(f"Review file not found: {path}")

    rows: dict[str, dict[str, str]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            text = (row.get("text") or "").strip()
            if text:
                rows[text] = row  # later duplicates win

    stats = {
        "total": len(rows),
        "accepted": 0,
        "pending": 0,
        "error": 0,
        "dropped_label": 0,
        "below_confidence": 0,
        "included": 0,
    }
    included: list[dict[str, str]] = []

    for text, row in rows.items():
        status = (row.get("review_status") or "").strip().lower()
        if status == "error":
            stats["error"] += 1
            continue

        if accept_prelabels:
            label = (row.get("prelabel") or "").strip().lower()
            try:
                confidence = float(row.get("prelabel_confidence") or 0)
            except ValueError:
                confidence = 0.0
            if confidence < min_confidence:
                stats["below_confidence"] += 1
                continue
        else:
            if status != "accepted":
                stats["pending"] += 1
                continue
            label = (row.get("final_label") or "").strip().lower()
            stats["accepted"] += 1

        if label not in TRAIN_LABELS:
            stats["dropped_label"] += 1
            continue

        included.append({"text": text, "language": LANGUAGE, "label": label, "split": split_for(text)})
        stats["included"] += 1

    return included, stats


def read_existing(path: Path) -> set[tuple[str, str]]:
    if not path.is_file():
        return set()
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != list(REQUIRED_COLUMNS):
            raise SystemExit(f"{path} must contain exactly {sorted(REQUIRED_COLUMNS)}")
        return {
            ((row.get("language") or "").strip(), (row.get("text") or "").strip())
            for row in reader
        }


def append_rows(path: Path, rows: list[dict[str, str]]) -> None:
    write_header = not path.is_file()
    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(REQUIRED_COLUMNS))
        if write_header:
            writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    args = parse_args()
    rows, stats = load_review(args.review.resolve(), args.accept_prelabels, args.min_confidence)
    print(
        f"review rows={stats['total']} accepted={stats['accepted']} pending={stats['pending']} "
        f"error={stats['error']} dropped_label={stats['dropped_label']} "
        f"below_confidence={stats['below_confidence']}"
    )
    if not rows:
        raise SystemExit(
            "No rows to merge. Run the review step (set review_status=accepted and final_label) "
            "or re-run with --accept-prelabels."
        )

    already: set[tuple[str, str]] = set()
    for split in SPLITS:
        already |= read_existing(args.data_dir / f"{split}.csv")
    new_rows = [row for row in rows if (row["language"], row["text"]) not in already]
    skipped = len(rows) - len(new_rows)
    if not new_rows:
        print("Nothing new to add; Cebuano rows are already present.")
        return

    by_split: dict[str, list[dict[str, str]]] = {split: [] for split in SPLITS}
    for row in new_rows:
        by_split[row["split"]].append(row)
    for split in SPLITS:
        append_rows(args.data_dir / f"{split}.csv", by_split[split])

    counts = {split: len(by_split[split]) for split in SPLITS}
    print(
        f"added={len(new_rows)} skipped_existing={skipped} "
        f"train={counts['train']} validation={counts['validation']} test={counts['test']}"
    )
    if not all(counts.values()):
        raise SystemExit("A split is empty for Cebuano; adjust the sample size and re-run.")
    print("Next: python train_sentiment.py")


if __name__ == "__main__":
    main()
