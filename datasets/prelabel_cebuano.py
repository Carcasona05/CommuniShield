from __future__ import annotations

import argparse
import ast
import csv
import json
import os
import random
import time
from pathlib import Path
from typing import Sequence, TypedDict, cast

import pandas as pd
import urllib.error
import urllib.parse
import urllib.request

RANDOM_STATE = 42
LABELS = ("positive", "neutral", "negative", "mixed", "unclear")
RAW_PATH = Path(__file__).resolve().parent / "raw" / "cebuano_sentences_train.csv"
OUTPUT_PATH = Path(__file__).resolve().parent / "processed" / "cebuano_prelabel_review.csv"
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)
DEFAULT_SAMPLE = 500
DEFAULT_LIMIT = 1000


class PrelabelResult(TypedDict):
    label: str
    confidence: float
    error: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gemini-prelabel Cebuano sentences for human review. Does not auto-accept labels."
    )
    parser.add_argument("--input", type=Path, default=RAW_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--sample", type=int, default=DEFAULT_SAMPLE)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Max Gemini calls this run")
    parser.add_argument("--seed", type=int, default=RANDOM_STATE)
    return parser.parse_args()


def extract_cebuano(raw: object) -> str | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        parsed = ast.literal_eval(raw)
    except (ValueError, SyntaxError):
        return None
    if not isinstance(parsed, (list, tuple)):
        return None
    items = cast(Sequence[object], parsed)
    if len(items) < 2:
        return None
    ceb = str(items[1]).strip()
    return ceb or None


def load_candidates(path: Path) -> list[str]:
    frame = pd.read_csv(path, dtype="string")
    if "set" not in frame.columns:
        raise ValueError(f"{path} must have a 'set' column")
    seen: set[str] = set()
    out: list[str] = []
    for raw in list(frame["set"]):
        ceb = extract_cebuano(raw)
        if not ceb:
            continue
        key = " ".join(ceb.lower().split())
        if key in seen:
            continue
        seen.add(key)
        out.append(ceb)
    return out


def normalize_label(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.strip().lower()
    return v if v in LABELS else None


def _candidate_text(payload: object) -> str:
    if not isinstance(payload, dict):
        return ""
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    first = candidates[0]
    if not isinstance(first, dict):
        return ""
    content = first.get("content")
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list) or not parts:
        return ""
    part = parts[0]
    if not isinstance(part, dict):
        return ""
    text = part.get("text")
    return text if isinstance(text, str) else ""


def gemini_prelabel(api_key: str, text: str, timeout: float = 20.0) -> PrelabelResult:
    prompt = (
        "Classify the sentiment of this Cebuano community-safety text. "
        'Respond with JSON only: {"label":"positive|neutral|negative|mixed|unclear",'
        '"confidence":0,"language":"cebuano"}. Do not infer credibility or severity. '
        f"Text: {json.dumps(text, ensure_ascii=False)}"
    )
    body = json.dumps(
        {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "label": {
                            "type": "STRING",
                            "enum": list(LABELS),
                        },
                        "confidence": {"type": "NUMBER"},
                        "language": {"type": "STRING", "enum": ["cebuano"]},
                    },
                    "required": ["label", "confidence", "language"],
                },
            },
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{GEMINI_URL}?key={urllib.parse.quote(api_key)}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload: object = json.loads(resp.read().decode("utf-8"))
    raw = _candidate_text(payload)
    if not raw:
        return {"label": "", "confidence": 0.0, "error": "empty_response"}
    try:
        parsed: object = json.loads(raw)
    except json.JSONDecodeError:
        return {"label": "", "confidence": 0.0, "error": "invalid_json"}
    if not isinstance(parsed, dict):
        return {"label": "", "confidence": 0.0, "error": "invalid_json"}
    label = normalize_label(parsed.get("label"))
    if not label:
        return {"label": "", "confidence": 0.0, "error": "invalid_label"}
    try:
        conf = float(parsed.get("confidence", 0) or 0)
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(1.0, conf))
    return {"label": label, "confidence": conf, "error": ""}


def load_existing(path: Path) -> dict[str, dict[str, str]]:
    if not path.is_file():
        return {}
    existing: dict[str, dict[str, str]] = {}
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = (row.get("text") or "").strip()
            if text:
                existing[text] = {key: str(value or "") for key, value in row.items()}
    return existing


def write_rows(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "text",
        "language",
        "prelabel",
        "prelabel_confidence",
        "review_status",
        "final_label",
        "reviewer_notes",
    ]
    write_header = not path.is_file()
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> None:
    args = parse_args()
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("GEMINI_API_KEY is required")

    candidates = load_candidates(args.input)
    if not candidates:
        raise SystemExit("No Cebuano candidates found in input")

    rng = random.Random(args.seed)
    sample = candidates[:]
    rng.shuffle(sample)
    sample = sample[: max(1, args.sample)]

    existing = load_existing(args.output)
    todo = [t for t in sample if t not in existing or not existing[t].get("prelabel")]
    todo = todo[: max(1, args.limit)]

    print(f"candidates={len(candidates)} sample={len(sample)} to_label={len(todo)}")
    if not todo:
        print("Nothing to prelabel.")
        return

    new_rows: list[dict[str, object]] = []
    for i, text in enumerate(todo, 1):
        try:
            result = gemini_prelabel(api_key, text)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            result = PrelabelResult(label="", confidence=0.0, error=str(exc))
        row: dict[str, object] = {
            "text": text,
            "language": "cebuano",
            "prelabel": result.get("label", ""),
            "prelabel_confidence": result.get("confidence", 0.0),
            "review_status": "pending" if result.get("label") else "error",
            "final_label": "",
            "reviewer_notes": result.get("error", ""),
        }
        new_rows.append(row)
        if i % 25 == 0 or i == len(todo):
            write_rows(args.output, new_rows)
            new_rows = []
            print(f"labeled {i}/{len(todo)}")
        time.sleep(0.15)

    if new_rows:
        write_rows(args.output, new_rows)

    print(f"Review file: {args.output}")
    print("Human step: set review_status=accepted and final_label for reviewed rows only.")


if __name__ == "__main__":
    main()
