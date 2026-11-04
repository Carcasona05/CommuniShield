from __future__ import annotations

"""
End-to-end retrain for the sentiment models after the Cebuano praise fix.

Pipeline:
  1. repair_cebuano_splits.py --apply        remove context-mined praise poison rows
  2. merge_compliments.py                    fold in the generated/downloaded compliments
  3. relabel_singlewords.py                  Gemini: accurate standalone labels for ambiguous
                                             Cebuano single words (fixes "kaila" etc.)
  4. apply_singleword_relabel.py --apply     write those labels back into the splits
  5. train_sentiment.py                      retrain per-language models (+ ONNX export)
  6. train_language_id.py                    retrain the language router on the new splits
  7. copy the exported ONNX models into server/models so the API serves them

Run after build_compliments.py has finished generating.

    python datasets/retrain_all.py
"""

import shutil
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ROOT = BASE_DIR.parent
PROCESSED = BASE_DIR / "processed"
DATASET_MODELS = BASE_DIR / "models"
SERVER_MODELS = ROOT / "server" / "models"

ONNX_ARTIFACTS = (
    "sentiment_cebuano.onnx",
    "sentiment_english.onnx",
    "sentiment_filipino.onnx",
    "language_id.onnx",
)


def run(script: str, *args: str) -> None:
    cmd = [sys.executable, str(BASE_DIR / script), *args]
    print(f"\n=== {script} {' '.join(args)} ===", flush=True)
    subprocess.run(cmd, check=True, cwd=str(BASE_DIR))


def copy_models() -> None:
    SERVER_MODELS.mkdir(parents=True, exist_ok=True)
    print(f"\n=== copying ONNX models to {SERVER_MODELS} ===")
    for name in ONNX_ARTIFACTS:
        src = DATASET_MODELS / name
        if not src.is_file():
            raise FileNotFoundError(f"expected trained artifact missing: {src}")
        dst = SERVER_MODELS / name
        shutil.copy2(src, dst)
        print(f"  {name} -> {dst} ({dst.stat().st_size:,} bytes)")


def main() -> None:
    run("repair_cebuano_splits.py", "--apply")
    run("merge_compliments.py")
    for language in ("cebuano", "filipino"):
        run("relabel_singlewords.py", "--language", language)
        run("apply_singleword_relabel.py", "--language", language, "--apply")
    run("train_sentiment.py")
    run("train_language_id.py")
    copy_models()
    print("\nretrain complete; server/models updated.")


if __name__ == "__main__":
    main()
