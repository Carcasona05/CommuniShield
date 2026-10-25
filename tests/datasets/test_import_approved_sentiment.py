import unittest
import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from import_approved_sentiment import select_examples


class ApprovedDatasetImportTests(unittest.TestCase):
    def test_keeps_test_and_validation_examples_out_of_training(self):
        row = lambda text, label="neutral": {"text": text, "language": "cebuano", "label": label}
        splits = {"train": [row("existing")], "validation": [row("validation")], "test": [row("test")]}
        samples = [row("new"), row(" NEW "), row("existing"), row("validation"), row("test"), row("conflict", "positive"), row("conflict", "negative")]
        accepted, counts = select_examples(samples, splits)
        self.assertEqual(accepted, [{**row("new"), "split": "train"}])
        self.assertEqual(counts, {"accepted": 1, "duplicates": 2, "held_out": 2, "conflicts": 2})
        self.assertEqual(len(splits["train"]), 1)

    def test_conflicts_with_existing_training_labels_are_not_imported(self):
        original = {"text": "example", "language": "english", "label": "neutral"}
        accepted, counts = select_examples([{**original, "label": "negative"}], {"train": [original], "validation": [], "test": []})
        self.assertEqual(accepted, [])
        self.assertEqual(counts["conflicts"], 1)

    def test_cli_dry_run_and_new_snapshot_preserve_holdouts_and_refuse_overwrites(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            for split in ("train", "validation", "test"):
                with (source / f"{split}.csv").open("w", encoding="utf-8", newline="") as handle:
                    writer = csv.DictWriter(handle, fieldnames=["text", "language", "label", "split"])
                    writer.writeheader()
                    writer.writerow({"text": split, "language": "cebuano", "label": "neutral", "split": split})
            artifact = root / "approved.json"
            artifact.write_text(json.dumps({"dataset_id": "test-dataset", "version": 2, "status": "approved", "samples": [{"text": "new example", "language": "cebuano", "label": "positive"}]}), encoding="utf-8")
            command = [sys.executable, str(Path(__file__).resolve().parents[2] / "datasets" / "import_approved_sentiment.py"), "--dataset", str(artifact), "--data-dir", str(source)]
            dry_run = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(dry_run.returncode, 0, dry_run.stderr)
            destination = root / "new-snapshot"
            apply = command + ["--apply", "--output-dir", str(destination)]
            applied = subprocess.run(apply, capture_output=True, text=True)
            self.assertEqual(applied.returncode, 0, applied.stderr)
            for split in ("validation", "test"):
                self.assertEqual((source / f"{split}.csv").read_bytes(), (destination / f"{split}.csv").read_bytes())
            self.assertNotEqual((source / "train.csv").read_bytes(), (destination / "train.csv").read_bytes())
            self.assertNotEqual(subprocess.run(apply, capture_output=True).returncode, 0)
            self.assertNotEqual(subprocess.run(command + ["--apply", "--output-dir", str(source)], capture_output=True).returncode, 0)


if __name__ == "__main__":
    unittest.main()
