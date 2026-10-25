import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import Pipeline

import continue_sentiment as continued


class ContinuedTrainingTests(unittest.TestCase):
    def rows(self):
        return pd.DataFrame([{"text": f"{label} feeling wording entry{n}", "language": "cebuano", "label": label}
                             for label in continued.LABELS for n in range(8)])

    def test_delta_uses_new_samples_only_and_normalizes_duplicates(self):
        old = {"text": "Old text", "language": "cebuano", "label": "neutral"}
        new = {"text": "New text", "language": "cebuano", "label": "negative"}
        self.assertEqual(continued.new_examples({"samples": [{**old, "text": " OLD  TEXT "}, new]}, {"samples": [old]}), [new])
        self.assertEqual(continued.new_examples({"samples": [old]}, {"samples": [old]}), [])

    def test_removed_or_relabelled_learning_is_not_silently_retained(self):
        old = {"text": "Old text", "language": "cebuano", "label": "neutral"}
        for current in [[], [{**old, "label": "positive"}]]:
            with self.assertRaisesRegex(ValueError, "cannot unlearn"):
                continued.new_examples({"samples": current}, {"samples": [old]})

    def test_replay_is_deterministic_bounded_and_contains_new_examples_once(self):
        rows = self.rows()
        new = rows.iloc[:1]
        with patch.object(continued, "REPLAY_PER_CLASS", 2):
            result = continued.replay_rows(rows, new)
            again = continued.replay_rows(rows.sample(frac=1, random_state=1), new)
        pd.testing.assert_frame_equal(result, again)
        self.assertEqual(len(result), 7)
        self.assertEqual(result["text"].eq(new.iloc[0]["text"]).sum(), 1)

    def test_update_starts_from_active_weights_without_refitting_features(self):
        rows = self.rows()
        active = Pipeline([("features", TfidfVectorizer()),
                           ("classifier", OneVsRestClassifier(LogisticRegression(solver="liblinear")))])
        active.fit(rows["text"], rows["label"])
        before = copy.deepcopy(active)
        reference = continued.evaluate(rows["label"], pd.Series(active.predict(rows["text"])))
        original_fit = LogisticRegression.fit
        starts = []
        def checked_fit(estimator, *args, **kwargs):
            self.assertTrue(estimator.warm_start)
            self.assertEqual(estimator.solver, "lbfgs")
            starts.append(estimator.coef_.copy())
            return original_fit(estimator, *args, **kwargs)
        with patch.object(TfidfVectorizer, "fit", side_effect=AssertionError("vocabulary must stay fixed")), \
             patch.object(TfidfVectorizer, "fit_transform", side_effect=AssertionError("features must not refit")), \
             patch.object(LogisticRegression, "fit", checked_fit):
            updated, metadata = continued.continue_pipeline(active, rows, rows.iloc[::2], rows, reference)
        self.assertEqual(len(starts), 3)
        for starting, old in zip(starts, before.named_steps["classifier"].estimators_):
            np.testing.assert_array_equal(starting, old.coef_)
        self.assertEqual(updated.named_steps["features"].vocabulary_, before.named_steps["features"].vocabulary_)
        np.testing.assert_array_equal(updated.named_steps["features"].idf_, before.named_steps["features"].idf_)
        for old, untouched in zip(before.named_steps["classifier"].estimators_, active.named_steps["classifier"].estimators_):
            np.testing.assert_array_equal(old.coef_, untouched.coef_)
        self.assertIn(metadata["strength"], continued.UPDATE_STRENGTHS)
        self.assertLessEqual(metadata["new_loss_after"], metadata["new_loss_before"] + 1e-10)

    def test_bootstrap_training_state_must_match_active_onnx(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            bootstrap, active = folder / "bootstrap", folder / "active"
            bootstrap.mkdir(); active.mkdir()
            name = "sentiment_cebuano"
            (bootstrap / f"{name}.joblib").write_bytes(b"not deserialized during this test")
            (bootstrap / f"{name}.onnx").write_bytes(b"different")
            (active / f"{name}.onnx").write_bytes(b"active")
            with self.assertRaisesRegex(ValueError, "Matching training state missing"):
                continued.state_path(active, "cebuano", bootstrap)
            (bootstrap / f"{name}.onnx").write_bytes(b"active")
            self.assertEqual(continued.state_path(active, "cebuano", bootstrap), bootstrap / f"{name}.joblib")

    def test_independent_selection_needs_no_builtin_validation_reference(self):
        rows = self.rows()
        active = Pipeline([('features', TfidfVectorizer()),
                           ('classifier', OneVsRestClassifier(LogisticRegression(solver='liblinear')))])
        active.fit(rows['text'], rows['label'])
        before = copy.deepcopy(active)
        updated, metadata = continued.continue_pipeline(active, rows, rows.iloc[::2], rows, None)
        self.assertGreaterEqual(metadata['validation']['macro_f1'], .6)
        self.assertTrue(all(v['recall'] >= .5 for v in metadata['validation']['per_label'].values()))
        self.assertEqual(updated.named_steps['features'].vocabulary_, active.named_steps['features'].vocabulary_)
        for old, current in zip(before.named_steps['classifier'].estimators_, active.named_steps['classifier'].estimators_):
            np.testing.assert_array_equal(old.coef_, current.coef_)


if __name__ == "__main__":
    unittest.main()
