import unittest
import numpy as np
import supporting_routing as routing

RULE = {"primary_confidence": 0.7, "primary_margin": 0.2, "support_confidence": 0.7, "support_margin": 0.2}


class SupportingRoutingTests(unittest.TestCase):
    def test_confident_primary_is_not_outvoted(self):
        base = np.array([[0.05, 0.05, 0.9]])
        against = np.array([[0.9, 0.05, 0.05]])
        result, used = routing.cascade(base, [(against, RULE), (against, RULE)])
        self.assertEqual(result.tolist(), [2]); self.assertFalse(used.any())

    def test_disagreement_abstains_even_when_two_supports_agree(self):
        base = np.array([[0.34, 0.33, 0.33]])
        positive = np.array([[0.05, 0.05, 0.9]])
        negative = np.array([[0.9, 0.05, 0.05]])
        result, used = routing.cascade(base, [(positive, RULE), (positive, RULE), (negative, RULE)])
        self.assertEqual(result.tolist(), [-1]); self.assertFalse(used.any())

    def test_unclear_is_penalized_in_recall_instead_of_hidden(self):
        y = np.array([0, 1, 2]); result = np.array([0, -1, 2])
        metrics = routing.describe(y, result)
        self.assertEqual(metrics["per_class"]["neutral"]["recall"], 0)
        self.assertAlmostEqual(metrics["coverage"], 2 / 3)
        self.assertAlmostEqual(metrics["macro_f1"], 2 / 3)

    def fixture(self):
        y = np.tile(np.arange(3), 60)
        primary = np.full((len(y), 3), 0.05)
        primary[np.arange(len(y)), y] = 0.9
        primary[90:] = 0.3
        primary[np.arange(90, len(y)), (y[90:] + 1) % 3] = 0.4
        support = np.full_like(primary, 0.05)
        support[np.arange(len(y)), y] = 0.9
        support[:90] = 0.05
        support[np.arange(90), (y[:90] + 1) % 3] = 0.9
        return primary, support, y

    def test_validation_can_find_a_beneficial_fallback_without_replacing_confident_rows(self):
        primary, support, y = self.fixture()
        rule = routing.calibrate(primary, support, y, [])
        self.assertIsNotNone(rule)
        self.assertGreaterEqual(rule["validation_support"], 20)
        self.assertGreaterEqual(rule["validation_precision"], 0.75)
        result, _ = routing.cascade(primary, [(support, rule)])
        np.testing.assert_array_equal(result, y)
        np.testing.assert_array_equal(result[:90], primary[:90].argmax(axis=1))

    def test_bad_support_cannot_get_a_verified_policy(self):
        primary, _, y = self.fixture()
        bad = np.full_like(primary, 1 / 3)
        self.assertIsNone(routing.calibrate(primary, bad, y, []))

    def test_missing_language_rows_never_crash_pool_evaluation(self):
        from pathlib import Path
        np.testing.assert_array_equal(routing.probabilities(Path("missing-model.onnx"), []), np.zeros((0, 3)))
        policy = routing.evaluate_pool({"validation": [], "test": []}, Path("missing-a.onnx"), Path("missing-b.onnx"), [], {})
        self.assertFalse(policy["passed"])
        self.assertEqual(policy["languages"], {})
        self.assertFalse(policy["cascade_test"]["passed"])
        self.assertEqual(policy["evaluated_pool_ids"], [])


if __name__ == "__main__":
    unittest.main()
