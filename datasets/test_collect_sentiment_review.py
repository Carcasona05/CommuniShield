import unittest
from collect_sentiment_review import normalize, safe_text


class CollectionTests(unittest.TestCase):
    def test_normalization_for_exact_exclusion(self):
        self.assertEqual(normalize("  AKONG  anak\n nagkasakit "), "akong anak nagkasakit")

    def test_reject_common_contact_and_spreadsheet_injection_patterns(self):
        for text in ("Contact me at name@example.com", "Visit https://example.com now", "Call 09123456789 for details", "Ask @username about it", '=HYPERLINK("https://example.com")', "+12345678901234"):
            self.assertFalse(safe_text(text), text)
        self.assertTrue(safe_text("Akong anak nagkasakit gahapon."))


if __name__ == "__main__":
    unittest.main()
