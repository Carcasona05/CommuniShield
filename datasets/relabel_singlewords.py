from __future__ import annotations

"""
Relabel ambiguous Cebuano SINGLE-WORD rows using Gemini.

Why: the original single-word miner inherited a word's label from the sentences
it appeared in. So words like "kaila" (neutral: "I know this one") were baked in
as negative because they only showed up in negative news. Deleting them all would
leave single-word data ~100% positive and flip short negatives to positive. Instead
we ask Gemini for an accurate STANDALONE sentiment label per word.

Input : distinct single-word negative/neutral Cebuano rows mined from the splits
Output: datasets/processed/cebuano_singleword_relabel.csv
        columns: text, old_label, new_label, confidence

Resumable: rerunning tops up only missing words. Apply with apply_singleword_relabel.py.
"""

import argparse
import csv
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
PROCESSED = BASE_DIR / "processed"
ENV_PATH = BASE_DIR.parent / "server" / ".env"
SPLITS = ("train", "validation", "test")

OUT_FIELDS = ["text", "old_label", "new_label", "confidence"]

MODELS = (
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-flash-lite-latest",
)
BATCH_SIZE = 50
WORKERS = 2
MAX_ATTEMPTS = 6
REQUEST_TIMEOUT = 90
TEMPERATURE = 0.0  # labels should be deterministic, not creative
VALID_LABELS = ("negative", "neutral", "positive")
# Extra backoff when Gemini rate-limits (429). Detected via the HTTP error text.
RATE_LIMIT_BACKOFF_S = 20.0
LANGUAGES = ("cebuano", "filipino", "english")

# Set by --language in main(); used by out_path/load_existing/collect_targets.
LANGUAGE = "cebuano"


def out_path() -> Path:
    return PROCESSED / f"{LANGUAGE}_singleword_relabel.csv"


def targets_path() -> Path:
    return PROCESSED / f"{LANGUAGE}_relabel_targets.csv"


def load_key() -> str:
    value = os.environ.get("GEMINI_API_KEY", "").strip()
    if value:
        return value
    if ENV_PATH.is_file():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("GEMINI_API_KEY"):
                _, _, raw = line.partition("=")
                raw = raw.strip().strip('"').strip("'")
                if raw:
                    return raw
    raise SystemExit("GEMINI_API_KEY not found")


def normalize(text: str) -> str:
    return " ".join(str(text).lower().split())


def load_existing() -> dict[str, dict[str, str]]:
    done: dict[str, dict[str, str]] = {}
    path = out_path()
    if not path.is_file():
        return done
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            key = normalize(row.get("text") or "")
            if key:
                done[key] = row
    return done


def collect_targets() -> list[tuple[str, str]]:
    """Target single-word neg/neu rows for relabeling.

    Prefers the pre-computed frequent-word target file (select_relabel_targets.py)
    so relabeling stays fast and covers real-world input. Falls back to every
    distinct ambiguous single-word neg/neu row in the splits.
    """
    tf = targets_path()
    if tf.is_file():
        out: list[tuple[str, str]] = []
        with tf.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                word = normalize(row.get("text") or "")
                label = (row.get("old_label") or "").strip().lower()
                if word and label in ("negative", "neutral"):
                    out.append((word, label))
        if out:
            return out

    frames = [pd.read_csv(PROCESSED / f"{s}.csv", dtype="string") for s in SPLITS]
    df = pd.concat(frames, ignore_index=True)
    sub = df[df["language"] == LANGUAGE]
    single = sub[~sub["text"].str.contains(" ", na=False)]
    neg_neu = single[single["label"].isin(["negative", "neutral"])]
    seen: dict[str, str] = {}
    for _, row in neg_neu.iterrows():
        key = normalize(row["text"])
        if key and key not in seen:
            seen[key] = str(row["label"]).strip().lower()
    return [(word, label) for word, label in seen.items()]


def build_prompt(words: list[str]) -> str:
    listed = json.dumps(words, ensure_ascii=False)
    native = {
        "cebuano": "Cebuano (Bisaya)",
        "filipino": "Filipino (Tagalog)",
        "english": "English",
    }.get(LANGUAGE, LANGUAGE)
    return (
        f"You are labeling the sentiment of STANDALONE {native} words and short phrases, "
        "as if they were a whole social-media comment on their own. Ignore how the word might be "
        "used inside a longer news/review sentence; judge the word itself.\n"
        "Rules:\n"
        "- positive = praise, thanks, goodwill, approval (gwapo/gwapa, salamat, maganda, nice).\n"
        "- negative = insult, threat, fear, disgust, harm (buang, delikado, guba, pangit, scam).\n"
        "- neutral = facts, names, locations, common verbs/nouns, function words/connectives, "
        "or ambiguous everyday words with no clear emotion (adlaw, kaila, man, sana, kasi, marcos).\n"
        "- If a word is a proper name, location, pronoun, particle, or common function word, "
        "label it neutral.\n"
        f"Input words: {listed}\n"
        f"Respond with JSON only: {{\"items\":[{{\"word\":\"...\",\"label\":\"negative|neutral|positive\",\"confidence\":0.0}}]}} "
        f"with one item per input word, same order."
    )


_PAIR_RE = re.compile(r'"word"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"label"\s*:\s*"([a-z]+)"')


def _unescape(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except Exception:  # noqa: BLE001
        return value.replace('\\"', '"').replace("\\\\", "\\")


def call_model(api_key: str, model: str, prompt: str) -> list[tuple[str, str]]:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}"
        f":generateContent?key={urllib.parse.quote(api_key)}"
    )
    body = json.dumps(
        {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": TEMPERATURE,
                "responseMimeType": "application/json",
            },
        }
    ).encode("utf-8")
    rate_limited = False
    for attempt in range(1, MAX_ATTEMPTS + 1):
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            candidates = payload.get("candidates") or []
            if candidates:
                parts = (candidates[0].get("content") or {}).get("parts") or []
                if parts:
                    raw = parts[0].get("text") or ""
                    pairs = [
                        (_unescape(w), lab)
                        for w, lab in _PAIR_RE.findall(raw)
                        if lab in VALID_LABELS
                    ]
                    if pairs:
                        return pairs
            time.sleep(1.0)
        except urllib.error.HTTPError as exc:
            rate_limited = exc.code == 429
            # Rate limit: back off much longer. Server errors: brief backoff.
            wait = RATE_LIMIT_BACKOFF_S if rate_limited else min(10.0, 2.0 * attempt)
            time.sleep(wait)
        except Exception:  # noqa: BLE001
            time.sleep(min(10.0, 2.0 * attempt))
    return []


def relabel_batch(api_key: str, words: list[str]) -> list[tuple[str, str]]:
    prompt = build_prompt(words)
    for model in MODELS:
        pairs = call_model(api_key, model, prompt)
        if pairs:
            return pairs
    return []


def append_rows(rows: list[dict[str, str]]) -> None:
    path = out_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not path.is_file()
    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUT_FIELDS)
        if write_header:
            writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Relabel ambiguous single-word rows via Gemini.")
    parser.add_argument("--language", choices=LANGUAGES, default="cebuano")
    parser.add_argument("--workers", type=int, default=WORKERS)
    args = parser.parse_args()

    global LANGUAGE
    LANGUAGE = args.language

    api_key = load_key()
    targets = collect_targets()
    done = load_existing()
    todo = [(w, lab) for w, lab in targets if w not in done]
    print(f"[{LANGUAGE}] targets={len(targets)} already_labeled={len(done)} todo={len(todo)}")
    if not todo:
        print("Nothing to relabel.")
        return

    words_only = [w for w, _ in todo]
    old_by_word = {w: lab for w, lab in todo}
    batches = [words_only[i : i + BATCH_SIZE] for i in range(0, len(words_only), BATCH_SIZE)]
    print(f"batches={len(batches)} workers={args.workers}")

    lock = threading.Lock()
    counter = {"batches": 0, "labeled": 0}

    def run_batch(batch: list[str]) -> int:
        pairs = relabel_batch(api_key, batch)
        rows = [
            {
                "text": word,
                "old_label": old_by_word.get(word, ""),
                "new_label": label,
                "confidence": "",
            }
            for word, label in pairs
            if word in old_by_word
        ]
        with lock:
            if rows:
                append_rows(rows)
            counter["batches"] += 1
            counter["labeled"] += len(rows)
            if counter["batches"] % 10 == 0:
                print(f"  batches={counter['batches']}/{len(batches)} labeled={counter['labeled']}")
        return len(rows)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run_batch, b) for b in batches]
        for fut in as_completed(futures):
            fut.result()

    print(f"done. labeled={counter['labeled']} total_file_rows={len(load_existing())}")


if __name__ == "__main__":
    main()
