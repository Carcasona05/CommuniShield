import csv
import os

BASE = "datasets/processed"

# Compliment generation targets
TARGET = 5000
print("=== compliment datasets ===")
for lang in ("cebuano", "filipino", "english"):
    path = os.path.join(BASE, f"compliments_{lang}.csv")
    if os.path.isfile(path):
        with open(path, newline="", encoding="utf-8") as handle:
            count = sum(1 for _ in csv.DictReader(handle))
    else:
        count = 0
    bar = "#" * int(40 * count / TARGET)
    print(f"{lang:9} {count:5}/{TARGET}  {bar}")

# Single-word relabeling progress (narrowed to frequent-word targets)
print("\n=== Gemini single-word relabeling ===")
BASE_T = BASE
targets_path = os.path.join(BASE_T, "cebuano_relabel_targets.csv")
relabel_path = os.path.join(BASE_T, "cebuano_singleword_relabel.csv")


def _rows(path):
    if not os.path.isfile(path):
        return []
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


targets = _rows(targets_path)
if targets:
    TOTAL = len(targets)
    labeled_words = {r["text"].strip().lower() for r in _rows(relabel_path)}
    count = sum(1 for r in targets if r["text"].strip().lower() in labeled_words)
else:
    # no target list yet -> full run
    TOTAL = 9634
    count = len(_rows(relabel_path))

bar = "#" * int(40 * count / TOTAL)
pct = 100 * count // TOTAL
print(f"relabel  {count:5}/{TOTAL}  {bar}  ({pct}%)")
if count >= TOTAL:
    print("-> relabeling COMPLETE. Run: python datasets/apply_singleword_relabel.py --apply")
else:
    print("-> still running (resumes automatically if interrupted)")
