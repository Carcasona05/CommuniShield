import unittest
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory

import pandas as pd

from cebuano_contrastive_examples import CHALLENGE, EXACT_REPORT, ONE_WORDS, build_training_rows, normalize
from train_sentiment import load_splits


class ContrastiveExamplesTest(unittest.TestCase):
    def test_labels_are_explicit_and_rows_are_training_only(self):
        rows = build_training_rows()
        self.assertGreater(len(rows), 3000)
        for row in rows:
            self.assertEqual(set(row), {"text", "language", "label", "split"})
            self.assertEqual(row["language"], "cebuano")
            self.assertEqual(row["split"], "train")
            self.assertIn(row["label"], {"positive", "negative", "neutral"})

    def test_no_normalized_duplicates_or_challenge_leakage(self):
        keys = [normalize(row["text"]) for row in build_training_rows()]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertFalse(set(keys) & {normalize(text) for text, _ in CHALLENGE})
        self.assertIn((EXACT_REPORT, "positive"), CHALLENGE)

    def test_topics_do_not_determine_the_label(self):
        rows = build_training_rows()
        for topic in ("sunog", "fire incident", "flooding", "vehicular accident"):
            self.assertEqual({r["label"] for r in rows if topic in r["text"]}, {"positive", "negative", "neutral"})
        counts = Counter(r["label"] for r in rows)
        self.assertLess(abs(counts["positive"] - counts["negative"]), 10)

    def test_curated_single_words_include_neutral_particles(self):
        self.assertIn("man", ONE_WORDS["neutral"])
        self.assertIn("gyud", ONE_WORDS["neutral"])
        self.assertIn("guba", ONE_WORDS["negative"])
        self.assertIn("salamat", ONE_WORDS["positive"])


class PlaceholderGuardTest(unittest.TestCase):
    def write_splits(self, directory, training_text):
        for split, text in (("train", training_text), ("validation", "Salamat sa tabang."), ("test", "Naa ra ko sa balay.")):
            pd.DataFrame([dict(text=text, language="cebuano", label="neutral", split=split)]).to_csv(
                Path(directory) / f"{split}.csv", index=False)

    def test_placeholder_seed_text_is_rejected(self):
        with TemporaryDirectory() as directory:
            self.write_splits(directory, "Sample training phrase 58: synthetic negative safety wording for prototype dataset 3.")
            with self.assertRaisesRegex(ValueError, "seed placeholder"):
                load_splits(Path(directory))

    def test_legitimate_use_of_word_sample_is_not_rejected(self):
        with TemporaryDirectory() as directory:
            self.write_splits(directory, "Nagkuha ko og sample sa tubig.")
            self.assertEqual(len(load_splits(Path(directory))["train"]), 1)


if __name__ == "__main__":
    unittest.main()
