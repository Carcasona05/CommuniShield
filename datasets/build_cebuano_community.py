from __future__ import annotations

import argparse
import csv
import json
import os
import random
import threading
import time
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Sequence, TypedDict

BASE_DIR = Path(__file__).resolve().parent
RAW_DIR = BASE_DIR / "raw" / "community_safety"
OUTPUT_PATH = BASE_DIR / "processed" / "cebuano_community_review.csv"
ENV_PATH = BASE_DIR.parent / "server" / ".env"
LABELS = ("negative", "neutral", "positive")
FIELDNAMES = [
    "text",
    "language",
    "prelabel",
    "prelabel_confidence",
    "review_status",
    "final_label",
    "reviewer_notes",
]
MODELS = ("gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-flash-latest")
LABEL_BATCH = 8
TRANSLATE_BATCH = 15
MAX_ATTEMPTS = 2
REQUEST_TIMEOUT = 45
MAX_TEXT_LENGTH = 1_400


class Task(TypedDict):
    mode: str
    text: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a Cebuano community-safety labeled sentence set via Gemini."
    )
    parser.add_argument("--fake-news-cap", type=int, default=1020)
    parser.add_argument("--hate-cap", type=int, default=3000)
    parser.add_argument("--dengue-cap", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--dry-run", action="store_true", help="Print the task plan only")
    return parser.parse_args()


def load_key() -> str:
    value = os.environ.get("GEMINI_API_KEY")
    if value and value.strip():
        return value.strip()
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


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def fake_news_tasks(path: Path, cap: int) -> list[Task]:
    seen: set[str] = set()
    tasks: list[Task] = []
    for row in read_csv_rows(path):
        text = (row.get("text") or "").strip()
        if not text or len(text) > MAX_TEXT_LENGTH or normalize(text) in seen:
            continue
        seen.add(normalize(text))
        tasks.append({"mode": "label", "text": text})
        if len(tasks) >= cap:
            break
    return tasks


def hate_tasks(paths: Sequence[Path], cap: int, seed: int) -> list[Task]:
    groups: dict[str, list[str]] = {"1": [], "0": []}
    seen: set[str] = set()
    for path in paths:
        for row in read_csv_rows(path):
            text = (row.get("text") or "").strip()
            label = (row.get("label") or "").strip()
            if text and label in groups and normalize(text) not in seen and len(text) <= MAX_TEXT_LENGTH:
                seen.add(normalize(text))
                groups[label].append(text)
    rng = random.Random(seed)
    for label in ("1", "0"):
        rng.shuffle(groups[label])
    picked = groups["1"][: cap // 2] + groups["0"][: cap - cap // 2]
    return [{"mode": "translate", "text": text} for text in picked]


def dengue_tasks(path: Path, cap: int, seed: int) -> list[Task]:
    flagged: list[str] = []
    seen: set[str] = set()
    for row in read_csv_rows(path):
        text = (row.get("text") or "").strip()
        if not text or len(text) > MAX_TEXT_LENGTH or normalize(text) in seen:
            continue
        flags = [str(row.get(column) or "0") for column in ("dengue", "health", "mosquito", "sick")]
        if any(value.strip() == "1" for value in flags):
            seen.add(normalize(text))
            flagged.append(text)
    rng = random.Random(seed)
    rng.shuffle(flagged)
    return [{"mode": "translate", "text": text} for text in flagged[:cap]]


def extract_response_text(payload: object) -> str:
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


def extract_list(value: object) -> list[dict[str, object]] | None:
    data = value
    if isinstance(data, dict):
        for key in ("items", "translations", "results", "data"):
            candidate = data.get(key)
            if isinstance(candidate, list):
                data = candidate
                break
        else:
            return None
    if not isinstance(data, list):
        return None
    return [entry for entry in data if isinstance(entry, dict)]


def build_body(prompt: str, use_schema: bool) -> bytes:
    generation: dict[str, object] = {"temperature": 0.1, "responseMimeType": "application/json"}
    if use_schema:
        generation["responseSchema"] = {
            "type": "ARRAY",
            "items": {"type": "OBJECT", "properties": {"value": {"type": "STRING"}}},
        }
    return json.dumps(
        {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": generation},
        ensure_ascii=False,
    ).encode("utf-8")


def call_one_model(api_key: str, model: str, prompt: str, use_schema: bool) -> str:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        f"?key={urllib.parse.quote(api_key)}"
    )
    body = build_body(prompt, use_schema)
    for attempt in range(1, MAX_ATTEMPTS + 1):
        request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
                raw = json.loads(response.read().decode("utf-8"))
            return extract_response_text(raw)
        except Exception:  # noqa: BLE001
            if attempt < MAX_ATTEMPTS:
                time.sleep(0.5)
    return ""


def probe_models(api_key: str) -> list[str]:
    working: list[str] = []
    prompt = build_prompt("label", [{"mode": "label", "text": "Nindot ang bag-ong barangay hall."}])
    for model in MODELS:
        text = call_one_model(api_key, model, prompt, False)
        if text:
            working.append(model)
    return working + [model for model in MODELS if model not in working]


def build_prompt(mode: str, tasks: list[Task]) -> str:
    texts = json.dumps([task["text"] for task in tasks], ensure_ascii=False)
    if mode == "label":
        return (
            "Classify the sentiment of each Cebuano sentence. Judge the emotion or tone of the "
            "message itself, not whether the news is real. Respond with a JSON array of objects in "
            "the same order, each {\"label\":\"negative|neutral|positive\",\"confidence\":0.0}. "
            f"Input: {texts}"
        )
    return (
        "Translate each Filipino sentence into natural, fluent Cebuano and classify the sentiment of "
        "its meaning. Respond with a JSON array of objects in the same order, each "
        "{\"cebuano\":\"...\",\"label\":\"negative|neutral|positive\",\"confidence\":0.0}. "
        "Keep proper names and locations as-is. Input: " + texts
    )


def valid_entries(mode: str, entries: list[dict[str, object]]) -> bool:
    for entry in entries:
        label = str(entry.get("label") or "").strip().lower()
        if label not in LABELS:
            return False
        if mode == "translate" and not str(entry.get("cebuano") or "").strip():
            return False
    return True


def analyze_batch(
    api_key: str,
    tasks: list[Task],
    models: list[str],
) -> list[dict[str, object]] | None:
    mode = tasks[0]["mode"]
    prompt = build_prompt(mode, tasks)
    for use_schema in (True, False):
        for model in models:
            text = call_one_model(api_key, model, prompt, use_schema)
            if not text:
                continue
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                continue
            entries = extract_list(parsed)
            if entries and len(entries) == len(tasks) and valid_entries(mode, entries):
                return entries
    return None


def process_batch(
    api_key: str,
    tasks: list[Task],
    models: list[str],
    counter: dict[str, int],
    counter_lock: threading.Lock,
    depth: int = 0,
) -> list[dict[str, object]] | None:
    with counter_lock:
        counter["calls"] += 1
    result = analyze_batch(api_key, tasks, models)
    if result is not None and len(result) == len(tasks):
        return result
    if depth >= 2 or len(tasks) <= 1:
        return None
    middle = len(tasks) // 2
    left = process_batch(api_key, tasks[:middle], models, counter, counter_lock, depth + 1)
    right = process_batch(api_key, tasks[middle:], models, counter, counter_lock, depth + 1)
    if left is not None and right is not None:
        return left + right
    if left is not None:
        return left
    if right is not None:
        return right
    return None


def load_done(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    done: set[str] = set()
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            notes = (row.get("reviewer_notes") or "").strip()
            if notes:
                done.add(normalize(notes))
    return done


def build_batches(todo: list[Task]) -> list[list[Task]]:
    batches: list[list[Task]] = []
    current: list[Task] = []
    for task in todo:
        batch_size = LABEL_BATCH if task["mode"] == "label" else TRANSLATE_BATCH
        if current and (task["mode"] != current[0]["mode"] or len(current) >= batch_size):
            batches.append(current)
            current = []
        current.append(task)
        if len(current) >= batch_size:
            batches.append(current)
            current = []
    if current:
        batches.append(current)
    return batches


def main() -> None:
    args = parse_args()
    tasks: list[Task] = []
    tasks += fake_news_tasks(RAW_DIR / "cebuano_fake_legit_news.csv", args.fake_news_cap)
    tasks += hate_tasks(
        [RAW_DIR / f"filipino_hate_speech_{name}.csv" for name in ("train", "validation", "test")],
        args.hate_cap,
        args.seed,
    )
    tasks += dengue_tasks(
        RAW_DIR / "filipino_dengue" / "dengue" / "train.csv",
        args.dengue_cap,
        args.seed + 1,
    )
    mode_counts = Counter(task["mode"] for task in tasks)
    print(
        f"tasks={len(tasks)} label={mode_counts['label']} "
        f"translate={mode_counts['translate']}"
    )
    if args.dry_run:
        return

    api_key = load_key()
    models = probe_models(api_key)
    print(f"models_ordered: {models}")
    done = load_done(OUTPUT_PATH)
    todo = [task for task in tasks if normalize(task["text"]) not in done]
    print(f"already_done={len(tasks) - len(todo)} todo={len(todo)}")
    if not todo:
        print("Nothing to do; all tasks already processed.")
        return

    batches = build_batches(todo)
    print(f"batches={len(batches)} workers={args.workers}")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    counter: dict[str, int] = {"calls": 0}
    counter_lock = threading.Lock()
    progress_lock = threading.Lock()
    state = {"completed": 0, "written": 0, "failed": 0}

    def run_batch(batch: list[Task]):
        return batch, process_batch(api_key, batch, models, counter, counter_lock)

    write_header = not OUTPUT_PATH.is_file()
    with OUTPUT_PATH.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, extrasaction="ignore")
        if write_header:
            writer.writeheader()
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(run_batch, batch) for batch in batches]
            for future in as_completed(futures):
                batch, results = future.result()
                with progress_lock:
                    state["completed"] += 1
                if results is None:
                    with progress_lock:
                        state["failed"] += len(batch)
                    continue
                mode = batch[0]["mode"]
                for task, entry in zip(batch, results):
                    label = str(entry.get("label") or "").strip().lower()
                    confidence = 0.5
                    try:
                        confidence = float(entry.get("confidence") or 0.5)
                    except (TypeError, ValueError):
                        confidence = 0.5
                    text = task["text"] if mode == "label" else str(entry.get("cebuano") or "").strip()
                    if not text:
                        continue
                    writer.writerow(
                        {
                            "text": text,
                            "language": "cebuano",
                            "prelabel": label,
                            "prelabel_confidence": f"{confidence:.4f}",
                            "review_status": "accepted",
                            "final_label": label,
                            "reviewer_notes": task["text"],
                        }
                    )
                    with progress_lock:
                        state["written"] += 1
                if state["completed"] % 25 == 0:
                    with counter_lock:
                        calls = counter["calls"]
                    print(
                        f"progress batches={state['completed']}/{len(batches)} "
                        f"calls={calls} written={state['written']} failed={state['failed']}"
                    )

    with counter_lock:
        calls = counter["calls"]
    print(f"done: calls={calls} written={state['written']} failed={state['failed']}")
    print(f"output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()