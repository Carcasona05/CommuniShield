import copy
import csv
import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from unittest.mock import patch

import builtin_sentiment_examples as examples
import retrain_builtin_models as retrain
from train_sentiment import build_vectorizer


class BuiltinRetrainingTests(unittest.TestCase):
    def test_richer_context_features_are_opt_in(self):
        self.assertEqual(build_vectorizer().transformer_list[0][1].ngram_range, (1, 2))
        self.assertEqual(build_vectorizer(3).transformer_list[0][1].ngram_range, (1, 3))

    def test_authored_data_is_balanced_and_reported_regressions_are_reserved(self):
        rows = examples.training_examples()
        counts = Counter((row["language"], row["label"]) for row in rows)
        self.assertEqual(len(counts), 9)
        self.assertEqual(len(set(counts.values())), 1)
        keys = {(row["language"], examples.normalize(row["text"])) for row in rows}
        self.assertEqual(len(keys), len(rows))
        reserved = {(language, examples.normalize(text)) for language, checks in examples.CHECKS.items() for text, _ in checks}
        self.assertFalse(keys & reserved)
        self.assertTrue(all(row["split"] == "train" for row in rows))
        for language in retrain.LANGUAGES:
            for topic in ("fire incident", "flooding", "vehicular accident"):
                self.assertEqual({row["label"] for row in rows if row["language"] == language and topic in row["text"]},
                                 {"positive", "negative", "neutral"})

    def test_snapshot_leaves_originals_unchanged_and_excludes_leakage_and_conflicts(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            (base / "processed").mkdir()
            def row(text, label="neutral", split="train"):
                return {"text": text, "language": "cebuano", "label": label, "split": split}
            splits = {"train": [row("retained"), row("RETAINED"), row("heldout"),
                                 row("conflicting", "positive"), row("conflicting", "negative"), row(examples.REPORTED_CASES[0][0])],
                      "validation": [row("heldout", split="validation")], "test": [row("test only", split="test")]}
            for split, rows in splits.items():
                with (base / "processed" / f"{split}.csv").open("w", newline="", encoding="utf-8") as stream:
                    writer = csv.DictWriter(stream, fieldnames=["text", "language", "label", "split"])
                    writer.writeheader(); writer.writerows(rows)
            hashes = {split: retrain.sha256(base / "processed" / f"{split}.csv") for split in splits}
            with patch.object(retrain, "BASE", base):
                result = retrain.prepare_data(base / "snapshot")
            for split in splits:
                self.assertEqual(retrain.sha256(base / "processed" / f"{split}.csv"), hashes[split])
            for split in ("validation", "test"):
                self.assertEqual(retrain.sha256(base / "snapshot" / f"{split}.csv"), hashes[split])
            self.assertEqual(result["excluded"], {"heldout_overlaps": 1, "conflicting_rows": 2,
                                                  "duplicates": 1, "reported_regressions": 1})

    def test_acceptance_requires_broad_improvement_and_all_reported_cases(self):
        metric = {"macro_f1": 0.7, "accuracy": 0.75,
                  "per_class": {label: {"recall": 0.7} for label in ("negative", "neutral", "positive")}}
        newer = {**metric, "macro_f1": 0.71}
        before = [{"text": text, "predicted": "neutral", "correct": label == "neutral"} for text, label in examples.REPORTED_CASES]
        after = [{"text": text, "predicted": label, "correct": True} for text, label in examples.REPORTED_CASES]
        self.assertTrue(retrain.acceptance("cebuano", metric, newer, before, after)["passed"])
        self.assertFalse(retrain.acceptance("cebuano", metric, metric, before, after)["passed"])
        wrong = copy.deepcopy(after); wrong[1]["predicted"] = "neutral"; wrong[1]["correct"] = False
        self.assertFalse(retrain.acceptance("cebuano", metric, newer, before, wrong)["passed"])
        degraded = copy.deepcopy(newer); degraded["per_class"]["negative"]["recall"] = 0.6
        self.assertFalse(retrain.acceptance("cebuano", metric, degraded, before, after)["passed"])

    def test_install_requires_stopped_services_before_reading_any_files(self):
        with self.assertRaisesRegex(ValueError, "Stop the backend"):
            retrain.install(Path("not-a-run"), False)

    def test_install_restores_all_original_files_if_a_replacement_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            base = root / "datasets"
            run = root / "run"
            (run / "selected").mkdir(parents=True)
            names = [*retrain.FILES, *[f"sentiment_{lang}.joblib" for lang in retrain.LANGUAGES], "baseline_metrics.json"]
            originals = {}
            for folder, files in ((root / "server/models", retrain.FILES), (base / "models", names)):
                folder.mkdir(parents=True)
                for name in files:
                    target = folder / name
                    target.write_bytes(f"old:{folder.name}:{name}".encode())
                    originals[str(target.relative_to(root))] = retrain.sha256(target)
                    backup = run / "backup" / target.relative_to(root)
                    backup.parent.mkdir(parents=True, exist_ok=True)
                    backup.write_bytes(target.read_bytes())
            for name in names:
                (run / "selected" / name).write_bytes(f"new:{name}".encode())
            (run / "report.json").write_text(json.dumps({"accepted_languages": ["cebuano"], "source_hashes": originals,
                "selected_hashes": {name: retrain.sha256(run / "selected" / name) for name in names}}))
            real_replace = retrain.os.replace
            count = 0
            def replacement(source, target):
                nonlocal count
                count += 1
                if count == 3:
                    raise OSError("simulated disk failure")
                real_replace(source, target)
            with patch.object(retrain, "ROOT", root), patch.object(retrain, "BASE", base), \
                 patch.object(retrain.os, "replace", side_effect=replacement), self.assertRaises(OSError):
                retrain.install(run, True)
            self.assertEqual(originals, {relative: retrain.sha256(root / relative) for relative in originals})


if __name__ == "__main__":
    unittest.main()
