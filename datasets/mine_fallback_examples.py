"""Select labeled examples inside the built-in model's uncertain region.

Why this exists: the supporting-model cascade only consults a supporting model
when the built-in primary is UNCERTAIN (confidence below the policy threshold or
top-2 margin below the policy threshold). Examples where the built-in is already
confident can never reach a fallback, so they add no evidence for cascade
validation. This tool:

1. Analyzes the FIXED baseline validation/test splits to report how many
   uncertain-region rows exist there. Those two files are copied byte-for-byte
   into every training snapshot, so they are the only possible source of the
   required accepted-fallback evidence (>=20 validation, >=10 test per language).
2. Mines reviewed, labeled rows from local pools that fall in that same
   uncertain region, deduplicated against every baseline split, conflict-checked
   and class-balanced, written as an upload CSV (text,language,label).

Honest limits: this produces evidence-bearing training data, not a guaranteed
gate pass. Acceptance still depends on the candidate model's real behavior on
held-out data, and no threshold is weakened to force a pass.

Usage:
  python datasets/mine_fallback_examples.py --analyze
  python datasets/mine_fallback_examples.py --pool datasets/processed/cebuano_community_review.csv \
      --language cebuano --out datasets/uploads/fallback_uncertain_cebuano.csv
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from import_approved_sentiment import LANGUAGES, LABELS, text_key
from supporting_routing import probabilities

BASE = Path(__file__).resolve().parent
SPLITS = ("train", "validation", "test")
# The calibration grid can only reach confidence < 0.85 or margin < 0.2, so rows
# outside that region can never be routed to a supporting model.
DEFAULT_CONFIDENCE = 0.85
DEFAULT_MARGIN = 0.2
LABEL_COLUMNS = ("final_label", "label", "new_label")


def load_splits(data_dir: Path) -> dict[str, list[dict[str, str]]]:
    splits: dict[str, list[dict[str, str]]] = {}
    for split in SPLITS:
        with (data_dir / f"{split}.csv").open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if not {"text", "language", "label"} <= set(reader.fieldnames or []):
                raise ValueError(f"{split}.csv is missing required columns")
            rows = list(reader)
        if any(not (row.get("text") or "").strip() for row in rows):
            raise ValueError(f"{split}.csv contains empty text")
        splits[split] = rows
    return splits


def region_stats(scores, confidence: float, margin: float) -> dict:
    """Per-row built-in behavior; scores shape (n,3) ordered negative,neutral,positive."""
    import numpy as np
    if len(scores) == 0:
        return {"rows": 0, "uncertain": 0, "uncertain_wrong": 0, "confidence": 0.0, "margin": 0.0}
    top = scores.max(axis=1)
    ordered = np.sort(scores, axis=1)
    row_margin = ordered[:, -1] - ordered[:, -2]
    uncertain = (top < confidence) | (row_margin < margin)
    return {"rows": int(len(scores)), "uncertain": int(uncertain.sum()), "margin": float(row_margin.mean()),
            "confidence": float(top.mean()), "_uncertain_mask": uncertain, "_top_margin": (top, row_margin)}


def analyze_splits(splits: dict[str, list[dict[str, str]]], models_dir: Path, confidence: float, margin: float) -> dict:
    """Feasibility: held-out uncertain rows are the ceiling for fallback evidence.

    train is reported as context only (does the teaching data already cover the
    uncertain region); only validation/test can supply gate evidence."""
    import numpy as np
    report: dict[str, dict] = {}
    for language in sorted(LANGUAGES):
        entry: dict[str, dict] = {}
        for split in SPLITS:
            rows = [row for row in splits[split] if row["language"] == language]
            texts = [row["text"] for row in rows]
            if not rows:
                entry[split] = {"rows": 0, "uncertain": 0, "uncertain_wrong": 0}
                continue
            scores = probabilities(models_dir / f"sentiment_{language}.onnx", texts)
            stats = region_stats(scores, confidence, margin)
            predicted = scores.argmax(axis=1)
            labels = np.array([["negative", "neutral", "positive"].index(row["label"]) for row in rows])
            mask = stats.pop("_uncertain_mask")
            stats.pop("_top_margin", None)
            stats["uncertain_wrong"] = int((mask & (predicted != labels)).sum())
            entry[split] = stats
        v, t = entry["validation"], entry["test"]
        entry["gate_ceiling"] = {
            "validation_evidence_needed": 20, "test_evidence_needed": 10,
            "validation_ceiling_met": v.get("uncertain", 0) >= 20,
            "test_ceiling_met": t.get("uncertain", 0) >= 10,
        }
        report[language] = entry
    return report


def load_pool(paths: list[Path], forced_language: str | None) -> tuple[list[dict[str, str]], dict[str, int]]:
    """Read labeled pools; label column prefers reviewed labels over raw guesses.

    forced_language both fills pools lacking a language column AND filters pools
    that carry one, so a language-targeted run never leaks other languages."""
    rows: list[dict[str, str]] = []
    dropped = {"invalid": 0, "pending_review": 0, "other_language": 0}
    for path in paths:
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            fields = reader.fieldnames or []
            label_column = next((name for name in LABEL_COLUMNS if name in fields), None)
            if label_column is None:
                raise ValueError(f"{path.name}: no label column among {LABEL_COLUMNS}")
            for row in reader:
                label = (row.get(label_column) or "").strip().lower()
                language = (row.get("language") or forced_language or "").strip().lower()
                review = (row.get("review_status") or "").strip().lower()
                if review and review != "accepted":
                    dropped["pending_review"] += 1  # not reviewed to completion; keep out
                    continue
                if forced_language and language != forced_language:
                    dropped["other_language"] += 1
                    continue
                text = " ".join((row.get("text") or "").split())
                if language not in LANGUAGES or label not in LABELS or not 1 <= len(text) <= 2000:
                    dropped["invalid"] += 1
                    continue
                rows.append({"text": text, "language": language, "label": label})
    return rows, dropped


def select_region(samples: list[dict[str, str]], splits: dict[str, list[dict[str, str]]], scores_by_language,
                  confidence: float, margin: float) -> tuple[list[dict[str, str]], dict]:
    """Dedupe against every split, reject conflicts, keep only uncertain-region rows."""
    import numpy as np
    held_out = {text_key(row) for split in ("validation", "test") for row in splits[split]}
    baseline_labels: dict[tuple[str, str], set[str]] = {}
    for row in splits["train"]:
        baseline_labels.setdefault(text_key(row), set()).add(row["label"])
    stats = {"held_out": 0, "conflicts": 0, "duplicates": 0, "confident_region": 0, "accepted": 0}
    kept: list[dict[str, str]] = []
    seen: dict[tuple[str, str], str] = {}
    by_language: dict[str, list[dict[str, str]]] = {}
    for row in samples:
        by_language.setdefault(row["language"], []).append(row)
    for language, rows in by_language.items():
        texts = [row["text"] for row in rows]
        if not texts:
            continue
        scores = scores_by_language(language, texts)
        top = scores.max(axis=1)
        ordered = np.sort(scores, axis=1)
        row_margin = ordered[:, -1] - ordered[:, -2]
        uncertain = (top < confidence) | (row_margin < margin)
        for index, row in enumerate(rows):
            key = text_key(row)
            if key in held_out:
                stats["held_out"] += 1  # would be discarded by select_examples; do not waste it
            elif key in baseline_labels and row["label"] not in baseline_labels[key]:
                stats["conflicts"] += 1  # baseline train has this text with a different label
            elif key in seen and seen[key] != row["label"]:
                stats["conflicts"] += 1  # pool disagrees with itself on this text
            elif key in baseline_labels or key in seen:
                stats["duplicates"] += 1
            elif not uncertain[index]:
                stats["confident_region"] += 1  # built-in already sure; cannot reach a fallback
            else:
                kept.append(row); seen[key] = row["label"]; stats["accepted"] += 1
    return kept, stats


def balance(kept: list[dict[str, str]], max_per_class: int | None) -> list[dict[str, str]]:
    """Equalize label counts within each language, optionally capped."""
    by_language: dict[str, dict[str, list[dict[str, str]]]] = {}
    for row in kept:
        by_language.setdefault(row["language"], {}).setdefault(row["label"], []).append(row)
    result: list[dict[str, str]] = []
    for language in sorted(by_language):
        labels = by_language[language]
        target = min(len(rows) for rows in labels.values())
        if max_per_class:
            target = min(target, max_per_class)
        for label in sorted(labels):
            result.extend(labels[label][:target])
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pool", nargs="*", type=Path, help="Labeled pool CSVs to mine")
    parser.add_argument("--out", type=Path, help="Upload CSV path (text,language,label)")
    parser.add_argument("--language", choices=sorted(LANGUAGES), help="Force language for pools without a column")
    parser.add_argument("--data-dir", type=Path, default=BASE / "processed")
    parser.add_argument("--models-dir", type=Path, default=BASE.parent / "server" / "models")
    parser.add_argument("--confidence", type=float, default=DEFAULT_CONFIDENCE)
    parser.add_argument("--margin", type=float, default=DEFAULT_MARGIN)
    parser.add_argument("--max-per-class", type=int, default=1000)
    parser.add_argument("--analyze", action="store_true", help="Only report held-out feasibility")
    parser.add_argument("--report", type=Path, help="Write analysis JSON here")
    args = parser.parse_args()

    splits = load_splits(args.data_dir)
    if args.analyze or args.report:
        # Full split inference is slow; only needed for the feasibility report.
        analysis = analyze_splits(splits, args.models_dir, args.confidence, args.margin)
        print("Held-out feasibility (only these rows can supply cascade evidence):")
        print(json.dumps(analysis, indent=2))
        if args.report:
            args.report.write_text(json.dumps({"thresholds": {"confidence": args.confidence, "margin": args.margin},
                                               "held_out": analysis}, indent=2), encoding="utf-8")
    if args.analyze:
        return
    if not args.pool or not args.out:
        raise SystemExit("Provide --pool (one or more CSVs) and --out, or use --analyze")

    samples, dropped = load_pool(args.pool, args.language)
    def scores_for(language: str, texts: list[str]):
        return probabilities(args.models_dir / f"sentiment_{language}.onnx", texts)
    kept, stats = select_region(samples, splits, scores_for, args.confidence, args.margin)
    balanced = balance(kept, args.max_per_class)
    if len(balanced) > 1000:
        raise SystemExit(f"Balanced selection has {len(balanced)} rows; upload limit is 1000. Lower --max-per-class.")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["text", "language", "label"])
        writer.writeheader(); writer.writerows(sorted(balanced, key=lambda row: (row["language"], row["label"], row["text"])))
    summary = {"pools": [str(p) for p in args.pool], "pool_rows": len(samples), "dropped_on_load": dropped,
               "selection": stats, "written": len(balanced),
               "class_counts": {f"{lang}/{label}": sum(1 for row in balanced if row["language"] == lang and row["label"] == label)
                                for lang in sorted({r["language"] for r in balanced}) for label in sorted(LABELS)}}
    print(json.dumps(summary, indent=2))
    print(f"Wrote {len(balanced)} uncertain-region rows to {args.out}")


if __name__ == "__main__":
    main()
