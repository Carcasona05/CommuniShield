import csv
import tempfile
import unittest
from pathlib import Path

import numpy as np

import mine_fallback_examples as mine


def row(text, language="cebuano", label="positive"):
    return {"text": text, "language": language, "label": label}


def uniform_scores(_language, texts):
    """Scripted built-in: every text sits near a tie, inside any reachable threshold."""
    return np.array([[0.30, 0.35, 0.35] for _ in texts], dtype=float)


class FallbackMiningTests(unittest.TestCase):
    def splits(self):
        return {
            "train": [row("already known", label="negative")],
            "validation": [row("held out phrase")],
            "test": [row("also held out")],
        }

    def test_keeps_only_uncertain_region_rows(self):
        samples = [row("unsure one"), row("unsure two"), row("obvious praise")]

        def scores(_language, texts):
            return np.array([[0.30, 0.35, 0.35] if text != "obvious praise" else [0.05, 0.05, 0.90]
                             for text in texts], dtype=float)

        kept, stats = mine.select_region(samples, self.splits(), scores, 0.85, 0.2)
        self.assertEqual([r["text"] for r in kept], ["unsure one", "unsure two"])
        self.assertEqual(stats["confident_region"], 1)
        self.assertEqual(stats["accepted"], 2)

    def test_dedupes_against_all_splits_and_rejects_conflicts(self):
        samples = [row("already known", label="positive"),  # baseline train has negative -> conflict
                   row("held out phrase"),                    # in validation -> held out
                   row("fresh uncertain"),                    # valid
                   row("fresh uncertain")]                    # in-pool duplicate
        kept, stats = mine.select_region(samples, self.splits(), uniform_scores, 0.85, 0.2)
        self.assertEqual([r["text"] for r in kept], ["fresh uncertain"])
        self.assertEqual(stats["conflicts"], 1)
        self.assertEqual(stats["held_out"], 1)
        self.assertEqual(stats["duplicates"], 1)

    def test_confident_rows_outside_any_reachable_threshold_are_excluded(self):
        samples = [row("confident but wrong")]

        def scores(_language, texts):
            return np.array([[0.90, 0.05, 0.05] for _ in texts])  # confidently negative vs positive label

        kept, stats = mine.select_region(samples, self.splits(), scores, 0.85, 0.2)
        self.assertEqual(kept, [])
        self.assertEqual(stats["confident_region"], 1)

    def test_pool_self_disagreement_counts_as_conflict_not_duplicate(self):
        samples = [row("same text", label="positive"), row("same text", label="negative")]
        kept, stats = mine.select_region(samples, self.splits(), uniform_scores, 0.85, 0.2)
        self.assertEqual(len(kept), 1)
        self.assertEqual(stats["conflicts"], 1)

    def test_balance_equalizes_classes_within_each_language(self):
        kept = ([row(f"p{i}") for i in range(5)] + [row(f"n{i}", label="negative") for i in range(2)] +
                [row(f"e{i}", language="english") for i in range(3)])
        result = mine.balance(kept, max_per_class=None)
        counts = {}
        for item in result:
            key = (item["language"], item["label"])
            counts[key] = counts.get(key, 0) + 1
        self.assertEqual(counts[("cebuano", "positive")], 2)
        self.assertEqual(counts[("cebuano", "negative")], 2)
        self.assertEqual(counts[("english", "positive")], 3)

    def test_balance_cap_limits_output_for_upload(self):
        kept = [row(f"p{i}") for i in range(600)] + [row(f"n{i}", label="negative") for i in range(600)]
        result = mine.balance(kept, max_per_class=400)
        self.assertEqual(len(result), 800)

    def test_pool_loader_prefers_reviewed_labels_and_skips_pending(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "pool.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=["text", "language", "review_status", "final_label", "label"])
                writer.writeheader()
                writer.writerow({"text": "reviewed ok", "language": "cebuano", "review_status": "accepted",
                                 "final_label": "positive", "label": ""})
                writer.writerow({"text": "still pending", "language": "cebuano", "review_status": "pending",
                                 "final_label": "", "label": "negative"})
                writer.writerow({"text": "", "language": "cebuano", "review_status": "accepted",
                                 "final_label": "positive", "label": ""})
            rows, dropped = mine.load_pool([path], None)
        self.assertEqual([r["text"] for r in rows], ["reviewed ok"])
        self.assertEqual(rows[0]["label"], "positive")
        self.assertEqual(dropped["pending_review"], 1)
        self.assertEqual(dropped["invalid"], 1)

    def test_load_splits_requires_columns_and_text(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            for split in ("train", "validation", "test"):
                with (directory / f"{split}.csv").open("w", encoding="utf-8", newline="") as handle:
                    writer = csv.DictWriter(handle, fieldnames=["text", "language", "label", "split"])
                    writer.writeheader()
                    writer.writerow({"text": "ok row", "language": "cebuano", "label": "neutral", "split": split})
            splits = mine.load_splits(directory)
        self.assertEqual(len(splits["train"]), 1)
        with self.assertRaises(ValueError):
            with tempfile.TemporaryDirectory() as tmp:
                directory = Path(tmp)
                for split in ("train", "validation", "test"):
                    (directory / f"{split}.csv").write_text("wrong,columns\n1,2\n", encoding="utf-8")
                mine.load_splits(directory)


if __name__ == "__main__":
    unittest.main()
