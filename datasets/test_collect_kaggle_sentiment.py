import unittest
from collect_kaggle_sentiment import labelled_row


class KaggleCollectionTests(unittest.TestCase):
    def test_existing_labels_are_preserved(self):
        for label in ("negative", "neutral", "positive"):
            result = labelled_row({"text": "@Airline This is my source sentence", "airline_sentiment": label,
                                   "airline_sentiment_confidence": "0.9", "tweet_id": "123"})
            self.assertEqual(result["label"], label)
            self.assertNotIn("@Airline", result["text"])
            self.assertEqual(result["split"], "train")

    def test_missing_incompatible_or_low_agreement_labels_are_not_invented(self):
        for label, confidence in (("happy", "1"), ("positive", "NaN"), ("negative", ".79"), ("", "1")):
            self.assertIsNone(labelled_row({"text": "A source sentence for this test", "airline_sentiment": label,
                                           "airline_sentiment:confidence": confidence}))


if __name__ == "__main__":
    unittest.main()
