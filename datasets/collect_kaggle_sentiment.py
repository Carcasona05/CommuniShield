"""Download a bounded Kaggle English sentiment batch with existing labels.

No inferred labels, HF text, train-data mutation, model deployment or API keys.
The source is research/noncommercial CC BY-NC-SA 4.0; review terms before use.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from collect_sentiment_review import existing_keys, normalize, safe_text

BASE = Path(__file__).resolve().parent
SOURCE = "crowdflower/twitter-airline-sentiment"
VERSION = 4


def fetch(url, max_bytes=20 * 1024 * 1024):
    req = urllib.request.Request(url, headers={"User-Agent": "CommuniShield-labeled-collection/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError("Download exceeds collection size limit")
    return data


def labelled_row(row):
    label = row.get("airline_sentiment", "").strip().lower()
    if label not in ("negative", "neutral", "positive"):
        return None
    try:
        confidence = float(row.get("airline_sentiment_confidence", row.get("airline_sentiment:confidence", "")))
    except (KeyError, TypeError, ValueError):
        return None
    if not .8 <= confidence <= 1:
        return None
    # Do not retain account handles. Labels are copied unchanged from source.
    text = re.sub(r"(?<!\w)@[A-Za-z0-9_]+", "[account]", row.get("text", ""))
    text = re.sub(r"\s+", " ", text).strip()
    if not safe_text(text):
        return None
    return {"text": text, "language": "english", "label": label, "split": "train",
            "source_dataset": SOURCE, "source_version": VERSION,
            "source_record_hash": hashlib.sha256(str(row.get("tweet_id", "")).encode()).hexdigest(),
            "source_annotation_confidence": confidence,
            "declared_license": "CC BY-NC-SA 4.0",
            "review_status": "source_labeled_domain_privacy_review_pending"}


def collect(output, per_class=200):
    if not 1 <= per_class <= 1000:
        raise ValueError("Choose 1 to 1000 examples per class")
    excluded = existing_keys(BASE / "processed")
    metadata_url = "https://www.kaggle.com/api/v1/datasets/view/" + SOURCE
    metadata = json.loads(fetch(metadata_url))
    if metadata.get("licenseName") != "CC BY-NC-SA 4.0":
        raise ValueError("License changed; review source terms before downloading")
    url = f"https://www.kaggle.com/api/v1/datasets/download/{SOURCE}?datasetVersionNumber={VERSION}"
    archive = fetch(url)
    counts, rejected = Counter(), Counter()
    accepted = []
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        members = [member for member in zipped.infolist() if Path(member.filename).name.lower() == "tweets.csv"]
        if len(members) != 1 or members[0].file_size > 20 * 1024 * 1024:
            raise ValueError("Unexpected archive schema or uncompressed size")
        raw = zipped.read(members[0])
        source_rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    # Detect label conflicts before selecting a balanced sample. Do not guess.
    labels_by_text = {}
    for original in source_rows:
        candidate = labelled_row(original)
        if candidate:
            labels_by_text.setdefault(normalize(candidate["text"]), set()).add(candidate["label"])
    for original in source_rows:
        candidate = labelled_row(original)
        if candidate is None:
            rejected["invalid_low_annotation_agreement_or_privacy_pattern"] += 1
            continue
        key = normalize(candidate["text"])
        original_key = normalize(original.get("text", ""))
        if len(labels_by_text[key]) > 1:
            rejected["conflicting_source_labels"] += 1
            continue
        if key in excluded or original_key in excluded:
            rejected["existing_or_duplicate"] += 1
            continue
        if counts[candidate["label"]] >= per_class:
            continue
        accepted.append(candidate)
        excluded.update((key, original_key))
        counts[candidate["label"]] += 1
    if not accepted:
        raise ValueError("No labeled candidates passed checks; do not treat an empty output as a replacement")
    output.mkdir(parents=True, exist_ok=False)
    with (output / "english_labeled.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        fields = ["text", "language", "label", "split", "source_dataset", "source_version", "source_record_hash", "source_annotation_confidence", "declared_license", "review_status"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(accepted)
    (output / "kaggle_source_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    manifest = {"collected_at": datetime.now(timezone.utc).isoformat(), "source": SOURCE,
                "version": VERSION, "source_url": "https://www.kaggle.com/datasets/" + SOURCE,
                "download_url": url, "archive_sha256": hashlib.sha256(archive).hexdigest(),
                "csv_sha256": hashlib.sha256(raw).hexdigest(), "counts": dict(counts),
                "exclusions": dict(rejected), "language": "english", "source_split": "unsplit",
                "intended_use": "training candidates, not an independent research test set",
                "license": "CC BY-NC-SA 4.0", "label_mapping": "Original negative/neutral/positive unchanged",
                "transformations": "Account mentions replaced with [account]; whitespace normalized; identity metadata omitted",
                "source_confidence_note": "Annotation agreement from source, not model prediction confidence",
                "remaining_review": "Domain suitability, sensitive content, near-duplicates and legal terms; source labels are not guaranteed correct",
                "filipino": "No suitable verified labeled Kaggle sentence source found in this search",
                "cebuano": "No suitable verified labeled Kaggle sentiment sentence source found in this search",
                "existing_splits_modified": False, "models_modified": False}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "rows": len(accepted), "counts": dict(counts), "replaced_languages": ["english"]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--per-class", type=int, default=200)
    args = parser.parse_args()
    collect(args.output_dir, args.per_class)
