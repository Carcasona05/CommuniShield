import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from prepare_labeled_experiment import prepare
from import_approved_sentiment import COLUMNS


class SnapshotTests(unittest.TestCase):
    def test_snapshot_keeps_holdouts_and_cebuano_unchanged_and_excludes_conflicts(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            data.mkdir()
            def write(path, rows):
                with path.open("w", newline="", encoding="utf-8") as handle:
                    writer = csv.DictWriter(handle, fieldnames=COLUMNS)
                    writer.writeheader()
                    writer.writerows(rows)
            for split in ("train", "validation", "test"):
                write(data / f"{split}.csv", [{"text": f"baseline {split}", "language": "english", "label": "neutral", "split": split},
                                             {"text": f"Cebuano {split}", "language": "cebuano", "label": "positive", "split": split}])
            source = root / "extra.csv"
            write(source, [
                {"text": "baseline test", "language": "filipino", "label": "negative", "split": "train"},
                {"text": "baseline train", "language": "english", "label": "negative", "split": "train"},
                {"text": "new reviewed sentence", "language": "filipino", "label": "positive", "split": "train"},
            ])
            original = {split: (data / f"{split}.csv").read_bytes() for split in ("train", "validation", "test")}
            with patch("builtins.print"):
                manifest = prepare(data, [source], root / "snapshot")
            self.assertEqual(manifest["counts"]["heldout_overlap_excluded"], 1)
            self.assertEqual(manifest["counts"]["label_conflict_excluded"], 1)
            self.assertEqual(manifest["counts"]["accepted_filipino"], 1)
            for split in original:
                self.assertEqual((data / f"{split}.csv").read_bytes(), original[split])
            for split in ("validation", "test"):
                self.assertEqual((root / "snapshot" / f"{split}.csv").read_bytes(), original[split])


if __name__ == "__main__":
    unittest.main()
