from __future__ import annotations

"""
Add neutral conversational Cebuano chatter from the parallel corpus already in the
repo (datasets/raw/cebuano_sentences_train.csv), which was previously only used to
mine single words -- never as direct multi-word training data.

These everyday sentences (questions, first-person activity, factual statements) are
the neutral chatter the model lacks, which is why casual phrases like
"kaila man ko ani oh" tip negative. This fills that gap with no Gemini calls.

Filters:
  - keep only the Cebuano column (2nd item of each parallel pair)
  - drop sentences containing clear praise / insult keywords (those are not neutral)
  - keep only conversational/everyday sentences (first-person, question, or activity)
  - dedupe against text already in the splits
  - append remaining as neutral multi-word rows, split 80/10/10

    python datasets/build_neutral_chatter.py            # dry run
    python datasets/build_neutral_chatter.py --apply
"""

import argparse
import csv
import random
import re
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
RAW = BASE_DIR / "raw" / "cebuano_sentences_train.csv"
PROCESSED = BASE_DIR / "processed"
SPLITS = ("train", "validation", "test")
SOURCE = "parallel_neutral"

random.seed(42)

# Clear praise / insult keywords -- exclude so we only keep neutral chatter.
PRAISE = {
    "gwapo", "gwapa", "pogi", "nindot", "maayo", "kaayo", "grabe", "dayag",
    "himaya", "hingpit", "lipay", "salamat", "palami", "nindota", "gwapoha",
    "ganda", "gwapoha", "love", "nice", "beautiful", "thank", "congrats",
    "malipay", "kalipay", "malipayon", "爽", "pogii", "gwapojud",
}
INSULT = {
    "buang", "guba", "patay", "krimen", "delikado", "sira", "hate", "puta",
    "yawa", "bobo", "tanga", "ulol", "panget", "pangit", "scam", "nakaw",
    "magnanakaw", "adik", "shabu", "droga", "guba", "unod", "yawa", "Leche",
    "leche", "puta", "tanga", "bogo", "atay", "yawa", "sukma", "panget",
}

# Conversational markers: first-person pronouns / question / everyday activity.
FIRST_PERSON = re.compile(
    r"\b(ko|ako|kami|mi|kita|ta|nako|nakong|ako-|ko-)\b", re.IGNORECASE
)
QUESTION = re.compile(r"\?\s*$")
ACTIVITY = re.compile(
    r"\b(mog|mo-|nag|naka|maka|makak|gani|kanang|moadto|muadto|kaon|mog|"
    r"mula|dula|magsulat|magsuroy|musuroy|galibot|libot|matulog|tulog|"
    r"trabaho|eskwela|palit|gamit|basa|lakaw|larga|uli|abot|abot|abot)\b",
    re.IGNORECASE,
)


def load_parallel() -> list[str]:
    out: list[str] = []
    with RAW.open(encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle):
            raw = row.get("set")
            if not raw:
                continue
            try:
                pair = eval(raw)  # stored as a python-list string
            except Exception:
                continue
            if isinstance(pair, list) and len(pair) == 2:
                ceb = str(pair[1]).strip()
                if ceb:
                    out.append(ceb)
    return out


def normalize(text: str) -> str:
    return " ".join(str(text).lower().split())


def has_bad_keyword(text: str) -> bool:
    low = text.lower()
    toks = set(re.findall(r"[a-zA-Z']+", low))
    return bool(toks & PRAISE) or bool(toks & INSULT)


def is_conversational(text: str) -> bool:
    if QUESTION.search(text):
        return True
    if FIRST_PERSON.search(text):
        return True
    if ACTIVITY.search(text):
        return True
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Add neutral conversational Cebuano chatter.")
    parser.add_argument("--apply", action="store_true", help="Write changes (default dry run)")
    parser.add_argument("--max", type=int, default=12000, help="Cap on neutral rows to add")
    args = parser.parse_args()

    # Existing texts in splits (to dedupe)
    existing: set[str] = set()
    for s in SPLITS:
        df = pd.read_csv(PROCESSED / f"{s}.csv", dtype="string")
        for t in df["text"]:
            existing.add(normalize(t))

    sentences = load_parallel()
    print(f"parallel Cebuano sentences loaded: {len(sentences)}")

    picked: list[str] = []
    seen: set[str] = set()
    for s in sentences:
        if len(picked) >= args.max:
            break
        norm = normalize(s)
        if norm in seen or norm in existing:
            continue
        if " " not in norm:  # multi-word only (single words handled elsewhere)
            continue
        if has_bad_keyword(s):
            continue
        if not is_conversational(s):
            continue
        seen.add(norm)
        picked.append(s)

    print(f"neutral conversational candidates kept: {len(picked)}")

    # split 80/10/10
    random.shuffle(picked)
    n = len(picked)
    n_train = int(n * 0.8)
    n_val = int(n * 0.9)
    parts = {
        "train": picked[:n_train],
        "validation": picked[n_train:n_val],
        "test": picked[n_val:],
    }

    print("\nsample rows to add:")
    for s in picked[:12]:
        print("  ", s)

    print("\nby split:", {k: len(v) for k, v in parts.items()})

    if not args.apply:
        print("\ndry run; pass --apply to write changes")
        return

    for split, texts in parts.items():
        if not texts:
            continue
        path = PROCESSED / f"{split}.csv"
        frame = pd.read_csv(path, dtype="string")
        rows = pd.DataFrame(
            {
                "text": texts,
                "language": "cebuano",
                "label": "neutral",
                "split": split,
            }
        )
        merged = pd.concat([frame, rows], ignore_index=True)
        merged.to_csv(path, index=False)
        print(f"{split}: added {len(texts)} neutral rows -> {len(merged)} total")

    print("\napplied. run datasets/retrain_all.py to retrain.")


if __name__ == "__main__":
    main()
