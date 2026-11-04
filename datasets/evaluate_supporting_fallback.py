"""Evaluate an enabled-pool snapshot without training or changing the database.

Export using server/scripts/diagnostics/auditSentiment.ts --export-pool, then:
python datasets/evaluate_supporting_fallback.py --snapshot <pool-snapshot.json>

Uses frozen existing validation/test labels, with no threshold tuning. The
historical agreement veto is compared with the corrected qualified fallback.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path

import numpy as np

from supporting_routing import LABELS, cascade, probabilities
from independent_support import metrics

BASE = Path(__file__).resolve().parent


def describe(y, predicted):
    result = metrics(y, predicted)
    result["accuracy"] = float((y == predicted).mean())
    result["coverage"] = float((predicted >= 0).mean())
    result["unclear"] = int((predicted < 0).sum())
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    primary_dir = Path(snapshot["primaryDirectory"])
    for name, expected in snapshot["primaryHashes"].items():
        if hashlib.sha256((primary_dir / name).read_bytes()).hexdigest() != expected:
            raise ValueError("Built-in model changed after snapshot; re-export the pool.")
    languages = sorted({lang for model in snapshot["models"] for lang in model["policy"]["languages"]})
    report = {"snapshot": str(args.snapshot), "scope": languages, "trained": False,
              "thresholds_changed": False, "note": "Existing benchmark reused for regression evaluation, not a new independent domain benchmark.",
              "languages": {}, "holdout_sha256": {}}
    for split in ("validation", "test"):
        path = BASE / "processed" / f"{split}.csv"
        report["holdout_sha256"][split] = hashlib.sha256(path.read_bytes()).hexdigest()
    for language in languages:
        report["languages"][language] = {}
        for split in ("validation", "test"):
            with (BASE / "processed" / f"{split}.csv").open(encoding="utf-8", newline="") as handle:
                rows = [r for r in csv.DictReader(handle) if r["language"] == language]
            if not rows:
                raise ValueError(f"No {split} rows for {language}")
            texts = [r["text"] for r in rows]
            y = np.array([LABELS.index(r["label"]) for r in rows])
            primary = probabilities(primary_dir / f"sentiment_{language}.onnx", texts)
            supports = [(probabilities(Path(model["directory"]) / f"sentiment_{language}.onnx", texts), model["policy"]["languages"][language])
                        for model in snapshot["models"] if language in model["policy"]["languages"]]
            new, used = cascade(primary, supports)
            builtin = primary.argmax(axis=1)
            # All exported candidates passed independent admission. Previously an
            # accepted label differing from the weak primary was always unclear.
            old = np.where(used & (new != builtin), -1, new)
            changed = old != new
            accepted = int(used.sum())
            recovered = int(changed.sum())
            base_metrics, old_metrics, new_metrics = [describe(y, predictions) for predictions in (builtin, old, new)]
            strong_changed = 0
            sorted_primary = np.sort(primary, axis=1)
            for _, rule in supports:
                strong = (sorted_primary[:, -1] >= rule["primary_confidence"]) & ((sorted_primary[:, -1] - sorted_primary[:, -2]) >= rule["primary_margin"])
                strong_changed += int((strong & (new != builtin)).sum())
            gates = {
                "strong_primaries_preserved": strong_changed == 0,
                "changes_only_replace_abstentions": bool(((old[changed] < 0) & (new[changed] >= 0)).all()),
                "macro_f1_not_worse_than_previous": new_metrics["macro_f1"] >= old_metrics["macro_f1"],
                "macro_f1_not_worse_than_builtin": new_metrics["macro_f1"] >= base_metrics["macro_f1"] - .005,
                "accuracy_not_worse_than_previous": new_metrics["accuracy"] >= old_metrics["accuracy"],
                "coverage_not_worse_than_previous": new_metrics["coverage"] >= old_metrics["coverage"],
                "accepted_fallback_precision": accepted >= 10 and float((new[used] == y[used]).mean()) >= .75,
            }
            result = dict(samples=len(rows), builtin=base_metrics, previous=old_metrics, corrected=new_metrics,
                          recovered_from_unclear=recovered,
                          recovered_precision=float((new[changed] == y[changed]).mean()) if recovered else None,
                          fallback_count=accepted, fallback_precision=float((new[used] == y[used]).mean()) if accepted else 0,
                          gates=gates, passed=all(gates.values()))
            report["languages"][language][split] = result
            print(json.dumps({"language": language, "split": split, "samples": len(rows), "old_macro_f1": old_metrics["macro_f1"],
                              "new_macro_f1": new_metrics["macro_f1"], "builtin_macro_f1": base_metrics["macro_f1"],
                              "old_unclear": old_metrics["unclear"], "new_unclear": new_metrics["unclear"],
                              "recovered_precision": result["recovered_precision"], "passed": result["passed"], "gates": gates}), flush=True)
    report["passed"] = all(row["passed"] for splits in report["languages"].values() for row in splits.values())
    output = args.snapshot.with_name(args.snapshot.stem + "-fallback-evaluation.json")
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Evaluation saved to {output}")
    if not report["passed"]:
        raise SystemExit("Fallback failed regression gates. Do not refresh stored analyses until reviewed.")


if __name__ == "__main__":
    main()
