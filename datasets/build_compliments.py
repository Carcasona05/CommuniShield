from __future__ import annotations

"""
Build short, natural compliment/praise samples for the sentiment models.

Why this exists: the Cebuano model misclassifies praise such as "gwapo" and
"ka gwapo jud aning jobert oy" as negative. The original Cebuano corpus was
mined from crime / fake-news / dengue text, so praise words almost only ever
appeared inside negative sentences and inherited their labels. There is no
ready-made Cebuano/Bisaya compliment dataset to download, so this script
generates authentic ones with Gemini, seeded from a curated compliment lexicon.
English uses real 5-star Yelp praise (downloaded) and Filipino is generated the
same way as Cebuano.

Outputs: datasets/processed/compliments_{language}.csv
Columns: text, language, label, split   (label is always "positive")

The script is resumable: rerunning it tops up to --target and de-duplicates.
"""

import argparse
import csv
import hashlib
import json
import os
import random
import re
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROCESSED = BASE_DIR / "processed"
ENV_PATH = BASE_DIR.parent / "server" / ".env"

LANGUAGES = ("cebuano", "filipino", "english")
LABEL = "positive"

# Gemini model order. The first model that answers is used; the rest are
# fallbacks for quota (429) / retirement (404) / transient (5xx) failures.
MODELS = (
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
)
BATCH_SIZE = 25          # compliments requested per Gemini call
TARGET_DEFAULT = 5000    # per language
WORKERS_DEFAULT = 6
MAX_ATTEMPTS = 4
REQUEST_TIMEOUT = 60
TEMPERATURE = 1.0        # high: we want variety, not repeats

# Yelp (English) download source: real 5-star reviews are genuine praise.
YELP_REPO = "codyburker/yelp_review_sampled"
YELP_MAX_LEN = 120       # keep only short, comment-like praise


# --------------------------------------------------------------------------
# Curated compliment seeds. These steer Gemini toward the exact register the
# app sees (short social-media praise) and guarantee the vocabulary that the
# model previously got wrong (gwapo / gwapa / pogi / nindot ...) is covered.
# --------------------------------------------------------------------------

SEEDS: dict[str, list[str]] = {
    "cebuano": [
        "gwapo", "gwapa", "ka gwapo", "ka gwapa", "gwapa ka", "gwapo ka",
        "pogi", "pogi ka", "ka pogi", "nindot", "ka nindot", "nindot ka",
        "nindot kaayo", "maayo", "kaayo maayo", "maayo ka", "kaayo", "kaayo kaayo",
        "salamat", "daghang salamat", "thank you", "nice", "cool", "lupet",
        "luv it", "astig", "gwapa diha", "ka gwapa jud", "gwapo jud",
        "himaya", "malumi", "buotan", "maalamon", "paspas", "lig-on",
        "gwapa ha", "gwapo ha", "ka gwapa nimo", "ka gwapo nimo", "nindot kaau",
        "wa ko kapugong tan-awon", "grabe ka gwapo", "grabe ka gwapa",
        "ka gwapa gyud", "pares gwapo", "gwaps", "gwapo kaau", "gwapa kaau",
        "ka nindot gyud", "ayo kaayo", "solid", "lupig", "ayos",
    ],
    "filipino": [
        "ganda", "maganda", "ang ganda", "ganda mo", "ganda niya", "pogi",
        "pogi mo", "ang pogi", "pogi mo talaga", "mabait", "mabuti", "mahusay",
        "magaling", "ang galing", "galing mo", "astig", "lupet", "sulit",
        "cute", "ang cute", "cute mo", "salamat", "maraming salamat", "thank you",
        "nice", "cool", "solid", "keri", "nakakaganda", "nakakainspire",
        "ang wis", "ang yumi", "mabuting tao", "mahal kita", "miss kita",
        "ang taray", "taray mo", "ang lupet mo", "grabe ka ganda", " ang ganda ganda",
        "type kita", "crush kita", "ang kinis", "makinis", "ang puti",
    ],
    "english": [
        "nice", "great", "awesome", "amazing", "love it", "love this", "best",
        "beautiful", "gorgeous", "handsome", "pretty", "cool", "perfect",
        "excellent", "fantastic", "wonderful", "impressive", "outstanding",
        "brilliant", "superb", "thank you", "thanks", "well done", "good job",
        "so kind", "so sweet", "you are amazing", "so talented", "inspiring",
        "my favorite", "absolutely loved", "highly recommend", "five stars",
        "so helpful", "very nice", "looks great", "so cool", "legend",
    ],
}

# Topic angles keep the generated set diverse so it does not collapse into a
# handful of near-identical sentences.
TOPICS: dict[str, list[str]] = {
    "cebuano": [
        "appearance (face, smile, skin, outfit, glow up)",
        "skills or talent (singing, dancing, cooking, sports, art)",
        "work or studies (grades, job, project)",
        "kindness or character (helping others, humble, friendly)",
        "a photo or selfie someone posted",
        "a recent achievement or milestone",
        "someone's body / fitness / height",
        "how someone speaks or their sense of humor",
    ],
    "filipino": [
        "appearance (mukha, ngiti, balat, outfit, glow up)",
        "skills or talent (kanta, sayaw, luto, sports, art)",
        "work or studies (grades, trabaho, project)",
        "kindness or character (mabait, malumi, supportive)",
        "a photo or selfie someone posted",
        "a recent achievement or milestone",
        "fitness / katawan / height",
        "sense of humor / vibe",
    ],
    "english": [
        "appearance (face, smile, style, outfit, glow up)",
        "skills or talent (singing, dancing, cooking, sports, art)",
        "work or studies (grades, job, project)",
        "kindness or character (helpful, humble, friendly)",
        "a photo or selfie someone posted",
        "a recent achievement or milestone",
        "fitness / health / looks",
        "wit, humor, or vibe",
    ],
}


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
    return " ".join(text.lower().split())


def split_for(text: str) -> str:
    """Deterministic split so a text always lands in the same bucket."""
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    ratio = int(digest[:8], 16) / 0xFFFFFFFF
    if ratio < 0.8:
        return "train"
    if ratio < 0.9:
        return "validation"
    return "test"


WS_RE = re.compile(r"\s+")


def clean(text: str) -> str:
    text = text.strip().strip('"').strip("'")
    text = WS_RE.sub(" ", text)
    return text


# --------------------------------------------------------------------------
# Output helpers
# --------------------------------------------------------------------------

FIELDNAMES = ["text", "language", "label", "split"]


def out_path(language: str) -> Path:
    return PROCESSED / f"compliments_{language}.csv"


def load_existing(language: str) -> set[str]:
    seen: set[str] = set()
    path = out_path(language)
    if not path.is_file():
        return seen
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            key = normalize(row.get("text") or "")
            if key:
                seen.add(key)
    return seen


def append_rows(language: str, texts: list[str], existing: set[str]) -> int:
    """Append unique, positive, compliment rows for one language."""
    path = out_path(language)
    path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not path.is_file()
    written = 0
    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        if write_header:
            writer.writeheader()
        for text in texts:
            text = clean(text)
            if not text or len(text) < 2 or len(text) > 160:
                continue
            key = normalize(text)
            if key in existing:
                continue
            existing.add(key)
            writer.writerow(
                {
                    "text": text,
                    "language": language,
                    "label": LABEL,
                    "split": split_for(f"{language}\0{text}"),
                }
            )
            written += 1
    return written


# --------------------------------------------------------------------------
# Gemini generation
# --------------------------------------------------------------------------

_EXTRACT_RE = re.compile(r'"text"\s*:\s*"((?:[^"\\]|\\.)*)"')


def _unescape(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except Exception:  # noqa: BLE001
        return value.replace('\\"', '"').replace("\\\\", "\\")


def build_prompt(language: str, count: int) -> str:
    seeds = SEEDS[language]
    topics = TOPICS[language]
    native = {"cebuano": "Cebuano (Bisaya)", "filipino": "Filipino (Tagalog)", "english": "English"}[language]
    seed_line = ", ".join(seeds)
    topic_line = "; ".join(topics)
    return (
        f"You write short, natural {native} social-media compliment comments, like what real "
        f"young people type under a friend's photo or post. Generate {count} distinct compliments.\n"
        "Rules:\n"
        f"- Every comment must be clearly POSITIVE praise (never neutral, never negative, never sarcastic).\n"
        f"- Vary length: mix single words, 2-5 word phrases, and short sentences.\n"
        f"- Vary the topic across these angles: {topic_line}.\n"
        f"- Sprinkle in this slang vocabulary naturally where it fits: {seed_line}.\n"
        "- Keep each under 18 words. No hashtags, no emojis-only, no quotes around the text.\n"
        "- Be colloquial and authentic (e.g. 'ka gwapa jud nimo uy', 'gwaps', 'slay kaayo').\n"
        f'Respond with JSON only: {{"items":[{{"text":"..."}}]}} with exactly {count} items.'
    )


def _extract_items(raw: str) -> list[str]:
    return [_unescape(m) for m in _EXTRACT_RE.findall(raw)]


def call_model(api_key: str, model: str, prompt: str) -> list[str]:
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
                    if raw:
                        return _extract_items(raw)
        except Exception:  # noqa: BLE001
            pass
        time.sleep(min(8.0, 1.5 * attempt))
    return []


def generate_batch(api_key: str, language: str, count: int) -> list[str]:
    prompt = build_prompt(language, count)
    for model in MODELS:
        items = call_model(api_key, model, prompt)
        if items:
            return items
    return []


# --------------------------------------------------------------------------
# English: real 5-star Yelp praise (downloaded)
# --------------------------------------------------------------------------

def download_english(target: int) -> list[str]:
    print(f"downloading up to {target} short 5-star Yelp reviews (real praise)...")
    texts: list[str] = []
    offset = 0
    page = 100
    while len(texts) < target and offset < 40000:
        url = (
            f"https://datasets-server.huggingface.co/rows?dataset={urllib.parse.quote(YELP_REPO)}"
            f"&config=default&split=train&offset={offset}&length={page}"
        )
        try:
            with urllib.request.urlopen(url, timeout=45) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            print(f"  offset {offset} failed: {exc}")
            break
        rows = data.get("rows") or []
        if not rows:
            break
        for row in rows:
            rec = row.get("row") or {}
            stars = rec.get("stars")
            text = (rec.get("text") or "").strip()
            try:
                star_val = float(stars)
            except (TypeError, ValueError):
                star_val = 0.0
            if star_val >= 4.0 and 2 <= len(text) <= YELP_MAX_LEN:
                # Strip obvious review boilerplate that reads as neutral.
                texts.append(text)
        offset += page
        print(f"  fetched {offset} rows -> {len(texts)} short 5-star reviews")
        time.sleep(0.2)
    return texts[:target]


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------

def generate_language(api_key: str, language: str, target: int, workers: int) -> None:
    existing = load_existing(language)
    have = len(existing)
    print(f"[{language}] existing={have} target={target}")
    if have >= target:
        print(f"[{language}] already at target; nothing to do.")
        return

    remaining = target - have
    batches_needed = max(1, -(-remaining // BATCH_SIZE))
    print(f"[{language}] generating ~{remaining} more via {batches_needed} Gemini batches "
          f"({workers} workers)...")

    written_lock = threading.Lock()
    counter = {"batches": 0, "written": 0}

    def run_batch(_: int) -> int:
        items = generate_batch(api_key, language, BATCH_SIZE)
        with written_lock:
            n = append_rows(language, items, existing)
            counter["batches"] += 1
            counter["written"] += n
            if counter["batches"] % 5 == 0:
                print(f"  [{language}] batches={counter['batches']}/{batches_needed} "
                      f"unique_added={counter['written']} total={have + counter['written']}")
        return n

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(run_batch, i) for i in range(batches_needed)]
        for fut in as_completed(futures):
            fut.result()

    print(f"[{language}] done. added={counter['written']} total={len(load_existing(language))}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build compliment/praise samples per language.")
    parser.add_argument("--language", choices=[*LANGUAGES, "all"], default="all")
    parser.add_argument("--target", type=int, default=TARGET_DEFAULT,
                        help="target compliments per language (Cebuano is the priority)")
    parser.add_argument("--cebuano-target", type=int, default=None,
                        help="override target for Cebuano only")
    parser.add_argument("--workers", type=int, default=WORKERS_DEFAULT)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force-generate", action="store_true",
                        help="Use Gemini for English too (skip the Yelp download)")
    args = parser.parse_args()

    random.seed(args.seed)
    languages = LANGUAGES if args.language == "all" else (args.language,)

    for language in languages:
        target = args.target
        if language == "cebuano" and args.cebuano_target:
            target = args.cebuano_target

        if language == "english" and not args.force_generate:
            # Real downloaded praise; fast, no Gemini needed.
            existing = load_existing(language)
            if len(existing) < target:
                texts = download_english(target - len(existing))
                added = append_rows(language, texts, existing)
                print(f"[english] downloaded+added={added} total={len(existing)}")
            else:
                print("[english] already at target")
            continue

        api_key = load_key()
        generate_language(api_key, language, target, args.workers)

    # Summary
    print("\n=== summary ===")
    for language in LANGUAGES:
        path = out_path(language)
        if not path.is_file():
            print(f"{language}: none")
            continue
        with path.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        splits: dict[str, int] = {}
        for row in rows:
            splits[row["split"]] = splits.get(row["split"], 0) + 1
        print(f"{language}: {len(rows)} rows | splits={splits}")


if __name__ == "__main__":
    main()
