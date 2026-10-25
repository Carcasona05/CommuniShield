from __future__ import annotations

import argparse
import csv
import hashlib
import re
from collections import Counter, defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
RAW_DIR = BASE_DIR / "raw"
PROCESSED_DIR = BASE_DIR / "processed"
SPLITS = ("train", "validation", "test")
LABELS = ("negative", "neutral", "positive")
REQUIRED_COLUMNS = ("text", "language", "label", "split")

WORD_RE = re.compile(r"[a-zñáéíóúü]+", re.IGNORECASE)
EN_LABEL_MAP = {"0": "negative", "1": "neutral", "2": "positive"}
STAR_LABEL_MAP = {
    # These raw Shopee files use zero-based rating codes (0..4), not stars 1..5.
    # This agrees with the sentence-label mapping in processed training data.
    "0": "negative",
    "1": "negative",
    "2": "neutral",
    "3": "positive",
    "4": "positive",
}

LANGUAGE_CAPS = {"english": 12_000, "filipino": 9_000, "cebuano": 4_000}
NEUTRAL_SHARE = 0.42
# A single word inherits the label of the sentences it appeared in. With
# MIN_OCCURRENCES=1 and MIN_DOMINANCE=0.5, a praise word like "gwapo" that only
# ever shows up inside negative crime news ("gipatay tungod sa ka-gwapo") got
# mined as a NEGATIVE sample. Requiring more evidence and a stronger majority
# keeps context-only words out of the mined set.
MIN_OCCURRENCES = 4
MIN_DOMINANCE = 0.75
MIN_WORD_LENGTH = 3

RESERVED_TOKENS = {"nan", "null", "none", "na", "n/a", "true", "false"}

STOPWORDS = {
    "english": {
        "the", "and", "you", "for", "are", "but", "not", "was", "all", "any", "can", "her",
        "his", "how", "one", "our", "out", "she", "that", "their", "them", "then", "there",
        "these", "they", "this", "too", "use", "via", "was", "what", "when", "which", "who",
        "will", "with", "your", "have", "has", "had", "from", "were", "been", "its", "just",
        "get", "got", "him", "her", "here", "into", "more", "some", "very", "also", "about",
    },
    "filipino": {
        "ang", "mga", "ng", "sa", "na", "at", "ay", "ko", "mo", "ni", "si", "ito", "iyan",
        "iyon", "yung", "nang", "pag", "para", "kung", "din", "rin", "daw", "raw", "po", "ba",
        "lang", "nman", "naman", "kaya", "pero", "hindi", "may", "meron", "wala", "ako",
        "ikaw", "siya", "kami", "tayo", "kayo", "sila", "nito", "natin", "namin", "ninyo",
    },
    "cebuano": {
        "ang", "mga", "sa", "nga", "ug", "ka", "ko", "mo", "ni", "si", "kini", "kana", "kadto",
        "yung", "pag", "para", "kung", "pud", "sad", "ba", "lang", "man", "kay", "apan", "dili",
        "naa", "wala", "ako", "ikaw", "siya", "kami", "kita", "kamo", "sila", "nila", "nato",
        "namo", "ninyo", "mao", "unsa", "asa", "kanus", "ngano",
    },
}

LEXICON: dict[str, dict[str, tuple[str, ...]]] = {
    "english": {
        "positive": (
            "good", "great", "amazing", "awesome", "excellent", "fantastic", "wonderful",
            "helpful", "safe", "secure", "happy", "glad", "love", "like", "best", "perfect",
            "clean", "friendly", "kind", "thanks", "thank", "nice", "beautiful", "brilliant",
            "reliable", "protected", "improved", "success", "thankful", "grateful",
        ),
        "negative": (
            "bad", "terrible", "awful", "horrible", "worst", "dangerous", "unsafe", "scary",
            "fear", "afraid", "angry", "sad", "hate", "disgusting", "broken", "defective",
            "fake", "fraud", "scam", "poor", "useless", "disappointed", "disappointing",
            "risky", "threat", "threatening", "crime", "criminal", "stolen", "damaged",
        ),
        "neutral": (
            "report", "update", "information", "notice", "area", "place", "street", "barangay",
            "community", "resident", "neighbor", "road", "building", "office", "request", "status",
        ),
    },
    "filipino": {
        "positive": (
            "maganda", "mabuti", "mahusay", "maayos", "masaya", "salamat", "salamat", "tulong",
            "ligtas", "maasahan", "matibay", "dekalidad", "mabilis", "mabait", "magaling",
            "matulungin", "positibo", "maluwalhati", "kaaya", "mainam",
        ),
        "negative": (
            "masama", "pangit", "delikado", "mapanganib", "takot", "galit", "malungkot",
            "sira", "sirang", "depisyente", "pekeng", "manloloko", "magnanakaw", "krimen",
            "sugatan", "nasira", "mapanganib", "panganib", "hina", "walang", "bobo",
        ),
        "neutral": (
            "ulat", "balita", "impormasyon", "abiso", "lugar", "kalsada", "barangay", "komunidad",
            "resedente", "kapitbahay", "gusali", "opisina", "kahilingan", "estado",
        ),
    },
    "cebuano": {
        "positive": (
            "maayo", "nindot", "maanindot", "hingpit", "malipayon", "salamat", "tabang", "luwas",
            "kasaligan", "lig-on", "paspas", "buotan", "maalamon", "matabangon", "dayag",
            "malinawon", "mabungahon", "putli", "mahigugmaon",
            # Compliment vocabulary the original set lacked. These were the exact
            # words misclassified as negative because they only ever appeared in
            # negative news headlines before.
            "gwapo", "gwapa", "pogi", "kaayo", "kaayohan", "nindota", "gwapa",
            "malumi", "himaya", "malipayon", "lipay", "alingasaw", "bida",
            "idol", "astig", "lupet", "solid", "buot", "malinilon", "grabe",
        ),
        "negative": (
            "daotan", "ngil-ad", "delikado", "makuyaw", "kahadlok", "kasuko", "subo", "guba",
            "gubag", "depektibo", "bakak", "mangingilad", "kawatan", "krimen", "samaran",
            "nadaot", "katalagman", "huyang", "walay", "buang",
        ),
        "neutral": (
            "taho", "balita", "kasayuran", "pahibalo", "lugar", "dalan", "barangay", "katilingban",
            "pumoluyo", "silingan", "tukod", "buhatan", "hangyo", "kahimtang",
        ),
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Mine single-word sentiment samples and append them to datasets/processed splits."
    )
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--data-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--total-cap", type=int, default=25_000)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def split_for(text: str) -> str:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    ratio = int(digest[:8], 16) / 0xFFFFFFFF
    if ratio < 0.8:
        return "train"
    if ratio < 0.9:
        return "validation"
    return "test"


def read_rows(path: Path):
    with path.open(newline="", encoding="utf-8") as handle:
        yield from csv.DictReader(handle)


def labeled_sentences(raw_dir: Path, data_dir: Path):
    for split in ('train',):
        path = raw_dir / f"tweet_eval_{split}.csv"
        if path.is_file():
            for row in read_rows(path):
                label = EN_LABEL_MAP.get((row.get("label") or "").strip())
                text = (row.get("text") or "").strip()
                if label and text:
                    yield "english", text, label

    for split in ('train',):
        path = raw_dir / f"filipino_shopee_{split}.csv"
        if path.is_file():
            for row in read_rows(path):
                label = STAR_LABEL_MAP.get((row.get("label") or "").strip())
                text = (row.get("text") or "").strip()
                if label and text:
                    yield "filipino", text, label

    # Only use reviewed Cebuano sentences already assigned to training. A
    # review worksheet can contain validation/test sentences too.
    training_keys = set()
    train_path = data_dir / 'train.csv'
    if train_path.is_file():
        training_keys = {' '.join(r['text'].lower().split()) for r in read_rows(train_path) if r.get('language') == 'cebuano'}
    review = data_dir / "cebuano_prelabel_review.csv"
    if review.is_file():
        for row in read_rows(review):
            if (row.get("review_status") or "").strip().lower() != "accepted":
                continue
            label = (row.get("final_label") or "").strip().lower()
            text = (row.get("text") or "").strip()
            if label in LABELS and text and ' '.join(text.lower().split()) in training_keys:
                yield "cebuano", text, label


def mine_sentences(
    sentences,
) -> dict[str, dict[str, list[str]]]:
    counts: dict[str, Counter[str]] = defaultdict(Counter)
    totals: dict[str, Counter[str]] = defaultdict(Counter)
    for language, text, label in sentences:
        stopwords = STOPWORDS.get(language, set())
        seen = set()
        for word in WORD_RE.findall(text.lower()):
            if len(word) < MIN_WORD_LENGTH or word in stopwords:
                continue
            if word in RESERVED_TOKENS:
                continue
            if word in seen:
                continue
            seen.add(word)
            counts[language][(word, label)] += 1
            totals[language][word] += 1

    mined: dict[str, dict[str, list[str]]] = {}
    for language, word_totals in totals.items():
        per_label: dict[str, list[tuple[int, str]]] = {label: [] for label in LABELS}
        for word, total in word_totals.items():
            if total < MIN_OCCURRENCES:
                continue
            distribution = {
                label: counts[language][(word, label)]
                for label in LABELS
                if counts[language][(word, label)]
            }
            if not distribution:
                continue
            best_label = max(distribution, key=lambda label: (distribution[label], label))
            dominance = distribution[best_label] / total
            if dominance >= MIN_DOMINANCE:
                per_label[best_label].append((total, word))
        mined[language] = {
            label: [word for _, word in sorted(entries, reverse=True)]
            for label, entries in per_label.items()
        }
    return mined


def mine_words(raw_dir: Path, data_dir: Path) -> dict[str, dict[str, list[str]]]:
    return mine_sentences(labeled_sentences(raw_dir, data_dir))


def select_for_language(
    language: str,
    mined: dict[str, list[str]],
    cap: int,
) -> list[tuple[str, str]]:
    curated = LEXICON.get(language, {})
    pools: dict[str, list[str]] = {}
    claimed: set[str] = set()
    for label in LABELS:
        ordered: list[str] = []
        for word in curated.get(label, ()):
            if word not in claimed:
                claimed.add(word)
                ordered.append(word)
        for word in mined.get(label, []):
            if word not in claimed:
                claimed.add(word)
                ordered.append(word)
        pools[label] = ordered

    neutral_limit = max(1, int(cap * NEUTRAL_SHARE))
    limits = {
        "negative": cap,
        "positive": cap,
        "neutral": neutral_limit,
    }
    selected: list[tuple[str, str]] = []
    positions = {label: 0 for label in LABELS}
    while len(selected) < cap:
        progressed = False
        for label in LABELS:
            pool = pools[label]
            index = positions[label]
            if index >= len(pool) or index >= limits[label]:
                continue
            selected.append((pool[index], label))
            positions[label] = index + 1
            progressed = True
            if len(selected) >= cap:
                break
        if not progressed:
            break
    return selected


def read_existing(data_dir: Path) -> set[tuple[str, str]]:
    existing: set[tuple[str, str]] = set()
    for split in SPLITS:
        path = data_dir / f"{split}.csv"
        if not path.is_file():
            continue
        for row in read_rows(path):
            existing.add(((row.get("language") or "").strip(), (row.get("text") or "").strip()))
    return existing


def append_rows(path: Path, rows: list[dict[str, str]]) -> None:
    write_header = not path.is_file()
    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(REQUIRED_COLUMNS))
        if write_header:
            writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    args = parse_args()
    raw_dir = args.raw_dir.resolve()
    data_dir = args.data_dir.resolve()

    mined = mine_words(raw_dir, data_dir)
    existing = read_existing(data_dir)

    per_language_cap = {
        "english": args.total_cap * LANGUAGE_CAPS["english"] // sum(LANGUAGE_CAPS.values()),
        "filipino": args.total_cap * LANGUAGE_CAPS["filipino"] // sum(LANGUAGE_CAPS.values()),
        "cebuano": args.total_cap * LANGUAGE_CAPS["cebuano"] // sum(LANGUAGE_CAPS.values()),
    }

    generated: list[dict[str, str]] = []
    language_counts: Counter[str] = Counter()
    label_counts: Counter[str] = Counter()
    for language in ("english", "filipino", "cebuano"):
        selected = select_for_language(language, mined.get(language, {}), per_language_cap[language])
        for word, label in selected:
            if (language, word) in existing:
                continue
            generated.append(
                {
                    "text": word,
                    "language": language,
                    "label": label,
                    # Mined labels are derived training evidence, not a new
                    # independently reviewed held-out benchmark.
                    "split": 'train',
                }
            )
            language_counts[language] += 1
            label_counts[label] += 1

    by_split: dict[str, list[dict[str, str]]] = {split: [] for split in SPLITS}
    for row in generated:
        by_split[row["split"]].append(row)

    print(
        "generated={total} english={en} filipino={fil} cebuano={ceb} "
        "negative={neg} neutral={neu} positive={pos}".format(
            total=len(generated),
            en=language_counts["english"],
            fil=language_counts["filipino"],
            ceb=language_counts["cebuano"],
            neg=label_counts["negative"],
            neu=label_counts["neutral"],
            pos=label_counts["positive"],
        )
    )
    for split in SPLITS:
        print(f"  {split}: {len(by_split[split])}")

    if args.dry_run:
        print("dry run; nothing written")
        return

    for split in SPLITS:
        if by_split[split]:
            append_rows(data_dir / f"{split}.csv", by_split[split])
    print("appended single-word samples to training only; held-out files unchanged")


if __name__ == "__main__":
    main()
