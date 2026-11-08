import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import improve_builtin_sentiment as improve


class ImprovementTests(unittest.TestCase):
    def test_real_candidate_export_without_test_file_or_deployment(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            data.mkdir()
            for split, count in (("train", 24), ("validation", 12)):
                with (data / f"{split}.csv").open("w", newline="", encoding="utf-8") as handle:
                    writer = csv.DictWriter(handle, fieldnames=["text", "language", "label", "split"])
                    writer.writeheader()
                    for label, words in {"negative": "danger terrible crime", "neutral": "notice schedule meeting", "positive": "wonderful excellent helpful"}.items():
                        for index in range(count):
                            writer.writerow({"text": f"{words} {split} example {index}", "language": "cebuano", "label": label, "split": split})
            original = {split: (data / f"{split}.csv").read_bytes() for split in ("train", "validation")}
            with patch("builtins.print"):
                report = improve.run(data, root / "candidate", ["cebuano"], quick=True)
            self.assertFalse(report["test_evaluated"])
            self.assertFalse(report["deployed"])
            self.assertTrue(report["models"][0]["validation_target_met"])
            self.assertIsNone(report["models"][0]["test_metrics"])
            self.assertTrue((root / "candidate" / "sentiment_cebuano.onnx").is_file())
            for split, content in original.items():
                self.assertEqual((data / f"{split}.csv").read_bytes(), content)

    def test_source_or_deployed_directories_are_not_output_targets(self):
        for path in (improve.BASE / "models", improve.BASE.parent / "server" / "models", improve.BASE / "processed"):
            with self.assertRaisesRegex(ValueError, "separate candidate"):
                improve.run(improve.BASE / "processed", path)

    def test_contextual_features_export_and_agree_with_sklearn(self):
        original = improve.vectorizer
        with patch.object(improve, "vectorizer", lambda kind: original("contextual")):
            self.test_real_candidate_export_without_test_file_or_deployment()

    def test_aligned_word_features_export_and_agree_with_sklearn(self):
        original = improve.vectorizer
        with patch.object(improve, "vectorizer", lambda kind: original("aligned-word")):
            self.test_real_candidate_export_without_test_file_or_deployment()


if __name__ == "__main__":
    unittest.main()
