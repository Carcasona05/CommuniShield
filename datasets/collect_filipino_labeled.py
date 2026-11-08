"""Collect original human-labeled SentiTaglish rows, excluding Mixed unchanged.

Public CC BY 4.0 source; no generation, retraining, data mutation or credentials.
"""
import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from collect_sentiment_review import get, existing_keys, normalize, safe_text

BASE = Path(__file__).resolve().parent
REPO = "ccosme/SentiTaglishProductsAndServices"
MAPPING = {"1": "negative", "2": "neutral", "3": "positive"}


def map_label(value):
    # 4 = Mixed; do not merge it into positive or infer a replacement.
    return MAPPING.get(str(value).strip())


def collect(output, per_class=200):
    if not 1 <= per_class <= 1000:
        raise ValueError("Choose 1–1000 examples per class")
    excluded = existing_keys(BASE / "processed")
    info = json.loads(get("https://huggingface.co/api/datasets/" + REPO))
    revision = info["sha"]
    root_url = f"https://huggingface.co/datasets/{REPO}/resolve/{revision}/"
    card = get(root_url + "README.md")
    if "license: cc-by-4.0" not in card.decode("utf-8"):
        raise ValueError("Source license changed; stop for review")
    raw = get(root_url + "SentiTaglish_ProductsAndServices.csv")
    original = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    if not original or not {"review", "sentiment"} <= set(original[0]):
        raise ValueError("Unexpected source columns")
    labels_by_text = {}
    for row in original:
        labels_by_text.setdefault(normalize(row["review"]), set()).add(row["sentiment"].strip())
    counts, rejected, accepted = Counter(), Counter(), []
    for index, row in enumerate(original):
        label = map_label(row["sentiment"])
        if not label:
            rejected["mixed_or_unsupported_label"] += 1
            continue
        if not safe_text(row["review"]):
            rejected["length_or_privacy_pattern"] += 1
            continue
        key = normalize(row["review"])
        if len(labels_by_text[key]) != 1:
            rejected["conflicting_source_labels"] += 1
            continue
        if key in excluded:
            rejected["existing_or_duplicate_text"] += 1
            continue
        if counts[label] >= per_class:
            continue
        accepted.append({"text": row["review"].strip(), "language": "filipino", "label": label,
                         "split": "train", "source_dataset": REPO, "source_revision": revision,
                         "source_row": index, "original_label": row["sentiment"],
                         "declared_license": "CC BY 4.0",
                         "review_status": "source_human_labeled_domain_privacy_review_pending"})
        counts[label] += 1
        excluded.add(key)
    if not accepted:
        raise ValueError("No new labeled rows passed checks")
    output.mkdir(parents=True, exist_ok=False)
    with (output / "filipino_labeled.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(accepted[0]))
        writer.writeheader()
        writer.writerows(accepted)
    (output / "SentiTaglish.README.md").write_bytes(card)
    manifest = {"collected_at": datetime.now(timezone.utc).isoformat(),
                "source_url": f"https://huggingface.co/datasets/{REPO}", "revision": revision,
                "csv_sha256": hashlib.sha256(raw).hexdigest(), "source_rows": len(original),
                "counts": dict(counts), "exclusions": dict(rejected), "license": "CC BY 4.0",
                "annotation": "According to source card: two human annotators plus third adjudicator",
                "label_mapping": MAPPING, "mixed_handling": "Label 4 excluded, never relabeled",
                "source_split": "single published corpus; no independently documented original train/test partition",
                "intended_use": "training candidates only; do not reuse as independent test data",
                "limits": "Product/service domain, source labels may be wrong; near-duplicate, privacy and suitability review still required",
                "existing_splits_modified": False, "models_modified": False}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "counts": dict(counts), "rows": len(accepted)}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--per-class", type=int, default=200)
    args = parser.parse_args()
    collect(args.output_dir, args.per_class)
