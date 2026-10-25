import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pandas as pd

from merge_cebuano_corrections import merge, select_corrections, sha256


def row(text, label="neutral", split="train"):
    return dict(text=text, language="cebuano", label=label, split=split)


class MergeCorrectionsTest(unittest.TestCase):
    def frames(self):
        return {
            "train": pd.DataFrame([row("Existing praise", "positive"), row("Existing conflict", "negative")]),
            "validation": pd.DataFrame([row("Protected phrase!", split="validation")]),
            "test": pd.DataFrame([row("Other heldout", split="test")]),
        }

    def test_duplicates_conflicts_and_normalized_holdouts_are_excluded(self):
        accepted, counts = select_corrections(self.frames(), [
            row("existing PRAISE!", "positive"), row("Existing conflict", "positive"),
            row("protected PHRASE", "positive"), row("New correction", "positive"),
            row("new CORRECTION!", "positive"),
        ])
        self.assertEqual([r["text"] for r in accepted], ["New correction"])
        self.assertEqual(counts, dict(source=5, accepted=1, duplicates=2, held_out=1, conflicts=1))

    def test_dry_run_is_read_only_and_apply_is_idempotent(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "processed"
            data.mkdir()
            for split, frame in self.frames().items():
                frame.to_csv(data / f"{split}.csv", index=False)
            before = {split: sha256(data / f"{split}.csv") for split in self.frames()}
            with patch("merge_cebuano_corrections.build_training_rows", return_value=[row("New correction", "positive")]):
                preview = merge(data, root / "backups", False)
                self.assertFalse(preview["applied"])
                self.assertFalse((root / "backups").exists())
                self.assertEqual(sha256(data / "train.csv"), before["train"])
                first = merge(data, root / "backups", True)
                self.assertTrue(first["applied"])
                self.assertTrue((Path(first["backup_directory"]) / "train.before.csv").exists())
                after = sha256(data / "train.csv")
                second = merge(data, root / "backups", True)
                self.assertEqual(second["counts"]["accepted"], 0)
                self.assertEqual(sha256(data / "train.csv"), after)
                for split in ("validation", "test"):
                    self.assertEqual(sha256(data / f"{split}.csv"), before[split])


if __name__ == "__main__":
    unittest.main()
