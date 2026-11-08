"""Collect bounded, source-traceable TRAIN-only text candidates for human review.

Never assigns sentiment labels or writes existing datasets. Public HF APIs only;
no keys, Supabase, scraping private posts, or automatic training.
"""
import argparse
import csv
import hashlib
import json
import re
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
FIELDS = ["candidate_id", "text", "language", "label", "reviewer_1_label", "reviewer_2_label",
          "review_status", "source_dataset", "source_revision", "source_split", "source_row",
          "source_group", "source_labels", "declared_license", "privacy_review", "domain_review"]
SOURCES = [
    {"repo": "google-research-datasets/go_emotions", "config": "simplified", "license": "apache-2.0",
     "kind": "emotion", "offsets": [0, 5000, 15000, 25000, 35000],
     "note": "Reddit emotion annotations are NOT sentiment labels. No author fields are collected. Domain and privacy review required."},
    {"repo": "jfernandez/cebuano-filipino-sentences", "config": "default", "license": "cc0-1.0",
     "kind": "translation", "offsets": [0, 5000, 15000, 35000, 55000, 75000],
     "note": "Parallel Filipino/Cebuano sentences have NO sentiment labels. Language, translation quality and upstream provenance need human verification."},
]


def normalize(text):
    return re.sub(r"\s+", " ", text).strip().casefold()


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "CommuniShield-dataset-review/1.0"})
    with urllib.request.urlopen(req, timeout=45) as response:
        data = response.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise ValueError("Source response too large")
    return data


def existing_keys(processed):
    keys = set()
    # Read text only for exclusion; never use held-out labels for collection.
    for split in ("train", "validation", "test"):
        path = processed / f"{split}.csv"
        if not path.is_file():
            raise ValueError(f"Missing {split} split: cannot safely exclude held-out matches")
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                keys.add(normalize(row["text"]))
    return keys


def safe_text(text):
    return isinstance(text, str) and 12 <= len(text.strip()) <= 800 and text.lstrip()[:1] not in ("=", "+", "-", "@") and not re.search(
        r"https?://|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d ()-]{8,}\d)|(?:u/|@)[A-Za-z0-9_]", text)


def collect(output, limit=200):
    if not 1 <= limit <= 500:
        raise ValueError("Limit must be between 1 and 500 per language")
    excluded = existing_keys(BASE / "processed")
    output.mkdir(parents=True, exist_ok=False)
    counts, rejected, source_info = Counter(), Counter(), []
    rows = []
    for source in SOURCES:
        repo = source["repo"]
        api = "https://huggingface.co/api/datasets/" + repo
        info = json.loads(get(api))
        revision = info["sha"]
        card_url = f"https://huggingface.co/datasets/{repo}/raw/{revision}/README.md"
        card = get(card_url)
        if f"license: {source['license']}" not in card.decode("utf-8") and f"- {source['license']}" not in card.decode("utf-8"):
            raise ValueError(f"Declared license changed or missing for {repo}; stop for review")
        slug = repo.replace("/", "__")
        (output / f"{slug}.README.md").write_bytes(card)
        evidence = {**source, "revision": revision, "card_url": card_url,
                    "dataset_url": f"https://huggingface.co/datasets/{repo}",
                    "responses": [], "rows_collected": 0}
        targets = ["english"] if source["kind"] == "emotion" else ["filipino", "cebuano"]
        for offset in source["offsets"]:
            if all(counts[language] >= limit for language in targets):
                break
            url = "https://datasets-server.huggingface.co/rows?" + urllib.parse.urlencode({
                "dataset": repo, "config": source["config"], "split": "train", "offset": offset, "length": 100})
            raw = get(url)
            body = json.loads(raw)
            evidence["responses"].append({"url": url, "sha256": hashlib.sha256(raw).hexdigest()})
            for entry in body.get("rows", []):
                if entry.get("truncated_cells"):
                    rejected["truncated"] += 1
                    continue
                row = entry["row"]
                index = entry["row_idx"]
                group = hashlib.sha256(f"{repo}:{revision}:train:{index}".encode()).hexdigest()
                if source["kind"] == "emotion":
                    candidates = [("english", row.get("text"))]
                    original = json.dumps(row.get("labels", []))
                else:
                    pair = row.get("set")
                    if not isinstance(pair, list) or len(pair) != 2:
                        rejected["unexpected_pair"] += 1
                        continue
                    candidates = list(zip(["filipino", "cebuano"], pair))
                    original = "unlabeled translation pair"
                for language, text in candidates:
                    if counts[language] >= limit:
                        continue
                    if not safe_text(text):
                        rejected["length_or_privacy_pattern"] += 1
                        continue
                    key = normalize(text)
                    if key in excluded:
                        rejected["existing_or_duplicate_text"] += 1
                        continue
                    excluded.add(key)
                    rows.append({"candidate_id": hashlib.sha256((group + language).encode()).hexdigest(),
                                 "text": re.sub(r"\s+", " ", text).strip(), "language": language,
                                 "label": "", "reviewer_1_label": "", "reviewer_2_label": "",
                                 "review_status": "needs_human_review", "source_dataset": repo,
                                 "source_revision": revision, "source_split": "train", "source_row": index,
                                 "source_group": group, "source_labels": original,
                                 "declared_license": source["license"], "privacy_review": "pending",
                                 "domain_review": "pending"})
                    counts[language] += 1
                    evidence["rows_collected"] += 1
        # The dataset-server API is not revision-pinned: reject unstable exports.
        if json.loads(get(api))["sha"] != revision:
            raise ValueError(f"Source changed during collection: {repo}; discard this run")
        source_info.append(evidence)
    for language in ("english", "filipino", "cebuano"):
        with (output / f"{language}_review.csv").open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(row for row in rows if row["language"] == language)
    manifest = {"collected_at": datetime.now(timezone.utc).isoformat(), "counts": dict(counts),
                "excluded": dict(rejected), "sources": source_info, "ready_for_training": False,
                "warning": "No sentiment ground truth assigned. Exact normalized exclusion only, not near-duplicate or semantic screening. All rows need privacy/domain/language review and two independent human sentiment labels."}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "counts": dict(counts), "excluded": dict(rejected), "ready_for_training": False}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--per-language", type=int, default=200)
    args = parser.parse_args()
    collect(args.output_dir, args.per_language)
