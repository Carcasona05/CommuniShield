"""Offline, validation-only built-in candidates. Never deploys or opens test.csv.

Train on train.csv; select features, regularization and offsets on validation.csv.
An achieved validation target is NOT a final untouched-test performance claim.
Outputs cannot overwrite datasets/models or server/models. No network credentials.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion, Pipeline

from train_sentiment import (LABELS, build_classifier, evaluate, export_onnx,
                             load_splits, select_validation_offsets)

BASE = Path(__file__).resolve().parent
LANGUAGES = ("cebuano", "english", "filipino")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalized_keys(frame):
    return frame["language"].str.lower().str.strip() + "\0" + frame["text"].str.lower().str.replace(r"\s+", " ", regex=True).str.strip()


def validate_frames(frames):
    for split, frame in frames.items():
        if not frame["language"].isin(LANGUAGES).all():
            raise ValueError(f"Unsupported language in {split}")
        if frame.assign(key=normalized_keys(frame)).groupby("key")["label"].nunique().gt(1).any():
            raise ValueError(f"Conflicting normalized labels in {split}; review labels before training")
    if set(normalized_keys(frames["train"])) & set(normalized_keys(frames["validation"])):
        raise ValueError("Normalized train/validation overlap; do not move held-out rows into training")


def vectorizer(kind):
    if kind == "aligned-word":
        # Explicit ASCII tokens and no runtime lowercasing avoid the converter's
        # default Unicode/locale and char-ngram semantic differences. Case-sensitive
        # tokens are deliberate and identical in sklearn and ONNX.
        return FeatureUnion([("word", TfidfVectorizer(
            analyzer="word", token_pattern=r"[a-zA-Z0-9_]{2,}", lowercase=False,
            ngram_range=(1, 3), min_df=2, max_df=.995, max_features=180000,
            sublinear_tf=True))])
    return FeatureUnion([
        ("word", TfidfVectorizer(ngram_range=(1, 3 if kind == "contextual" else 2),
                                min_df=2, max_df=.995, max_features=120000, sublinear_tf=True)),
        # char_wb is not supported by the installed ONNX converter. Keep both
        # variants exportable; contextual adds word trigrams/shorter char clues.
        ("character", TfidfVectorizer(analyzer="char",
                                     ngram_range=(2, 5) if kind == "contextual" else (3, 5), min_df=3,
                                     max_features=120000, sublinear_tf=True)),
    ])


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def run(data_dir, output_dir, languages=LANGUAGES, target=.75, quick=False, feature_kinds=None):
    if not 0 <= target <= 1:
        raise ValueError("Target must be between zero and one")
    if not languages or len(set(languages)) != len(languages) or any(language not in LANGUAGES for language in languages):
        raise ValueError("Invalid languages")
    if feature_kinds is not None and (not feature_kinds or any(kind not in ("standard", "contextual", "aligned-word") for kind in feature_kinds)):
        raise ValueError("Invalid feature configuration")
    output_dir = output_dir.resolve()
    protected = [BASE / "models", BASE.parent / "server" / "models", data_dir.resolve()]
    if any(output_dir == path.resolve() or output_dir.is_relative_to(path.resolve()) for path in protected):
        raise ValueError("Use a separate candidate output directory, not source data or deployed models")
    output_dir.mkdir(parents=True, exist_ok=False)
    # Explicitly do NOT open test.csv, even to calculate a fingerprint.
    frames = load_splits(data_dir, include_test=False)
    validate_frames(frames)
    fingerprints = {split: digest(data_dir / f"{split}.csv") for split in frames}
    report = {"created_at": datetime.now(timezone.utc).isoformat(),
              "target_macro_f1": target, "selection_split": "validation",
              "test_evaluated": False, "deployed": False, "input_split_hashes": fingerprints,
              "trainer_sha256": digest(Path(__file__)), "models": []}
    save_json(output_dir / "validation_report.json", report)
    for language in languages:
        train = frames["train"].loc[frames["train"]["language"].eq(language)].reset_index(drop=True)
        validation = frames["validation"].loc[frames["validation"]["language"].eq(language)].reset_index(drop=True)
        if any(set(frame["label"]) != set(LABELS) for frame in (train, validation)):
            raise ValueError(f"{language}: every split must contain all three labels")
        trials, best = [], None
        for kind in (feature_kinds or (("standard",) if quick else ("standard", "contextual"))):
            features = vectorizer(kind)
            x_train = features.fit_transform(train["text"])
            x_validation = features.transform(validation["text"])
            for c in ((2.0,) if quick else (.5, 2.0, 8.0, 32.0)):
                for weight in (("balanced",) if quick else ("balanced", None)):
                    classifier = build_classifier(c)
                    classifier.set_params(estimator__class_weight=weight)
                    classifier.fit(x_train, train["label"])
                    selection = select_validation_offsets(classifier.decision_function(x_validation),
                                                         classifier.classes_, validation["label"], independent_quality=True)
                    trial = {"features": kind, "c": c, "class_weight": weight,
                             "validation_macro_f1": selection["macro_f1"] if selection else None,
                             "quality_floors_passed": selection is not None}
                    trials.append(trial)
                    print(f"{language}: {json.dumps(trial)}", flush=True)
                    if selection and (best is None or selection["macro_f1"] > best["selection"]["macro_f1"]):
                        best = {"features": features, "classifier": classifier, "selection": selection, "trial": trial}
            del x_train, x_validation
        if best is None:
            report["models"].append({"language": language, "validation_target_met": False,
                                     "reason": "No candidate meets existing validation class-quality floors", "trials": trials})
            save_json(output_dir / "validation_report.json", report)
            continue
        classifier = best["classifier"]
        for index, label in enumerate(classifier.classes_):
            classifier.estimators_[index].intercept_ += best["selection"]["offsets"][label]
        pipeline = Pipeline([("features", best["features"]), ("classifier", classifier)])
        metrics = evaluate(validation["label"], pd.Series(pipeline.predict(validation["text"])))
        artifact = output_dir / f"sentiment_{language}.joblib"
        metadata = {"language": language, "fit_splits": ["train"], "training_samples": len(train),
                    "validation_metrics": metrics, "test_metrics": None, "test_evaluated": False,
                    "validation_target_met": metrics["macro_f1"] >= target,
                    "configuration": best["trial"], "offsets": best["selection"]["offsets"],
                    "input_split_hashes": fingerprints}
        joblib.dump({"pipeline": pipeline, "metadata": metadata}, artifact, compress=3)
        export_onnx(pipeline, artifact)
        # Check exported three-class contract and agreement on bounded validation
        # batches before calling the export usable (never touch test labels).
        import onnxruntime as ort
        session = ort.InferenceSession(str(artifact.with_suffix(".onnx")), providers=["CPUExecutionProvider"])
        checked, mismatches, exported_labels = 0, 0, []
        for offset in range(0, len(validation), 16):
            texts = validation["text"].iloc[offset:offset + 16].tolist()
            values = session.run(["probabilities"], {"text": np.array(texts, dtype=object).reshape(-1, 1)})[0]
            if values.shape != (len(texts), 3) or not np.isfinite(values).all():
                raise ValueError("Invalid exported ONNX probabilities")
            labels = np.array(LABELS)[values.argmax(axis=1)]
            mismatches += int((labels != pipeline.predict(texts)).sum())
            exported_labels.extend(labels.tolist())
            checked += len(texts)
        del session
        metadata["onnx_smoke_samples"] = checked
        metadata["onnx_prediction_mismatches"] = mismatches
        metadata["export_compatible"] = mismatches == 0
        metadata["onnx_validation_metrics"] = evaluate(validation["label"], pd.Series(exported_labels))
        # Report the failure and continue other languages. Never silently deploy
        # a changed predictor or use the Python score as its ONNX performance.
        metadata["eligible_for_review"] = mismatches == 0 and metadata["validation_target_met"]
        metadata["onnx_sha256"] = digest(artifact.with_suffix(".onnx"))
        metadata["trials"] = trials
        report["models"].append(metadata)
        save_json(output_dir / "validation_report.json", report)
        print(f"{language}: selected validation macro-F1={metrics['macro_f1']:.4f}; target_met={metadata['validation_target_met']}", flush=True)
    report["all_validation_targets_met"] = all(model["validation_target_met"] for model in report["models"])
    report["all_exports_compatible"] = all(model.get("export_compatible", False) for model in report["models"])
    if fingerprints != {split: digest(data_dir / f"{split}.csv") for split in frames}:
        raise ValueError("Source data changed during training; discard these candidates")
    save_json(output_dir / "validation_report.json", report)
    print(f"Finished. Validation only; no final test claim or deployment. Report: {output_dir / 'validation_report.json'}", flush=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=BASE / "processed")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--languages", nargs="+", choices=LANGUAGES, default=list(LANGUAGES))
    parser.add_argument("--target", type=float, default=.75)
    parser.add_argument("--quick", action="store_true", help="One configuration for offline smoke tests")
    parser.add_argument("--feature-kinds", nargs="+", choices=("standard", "contextual", "aligned-word"))
    args = parser.parse_args()
    run(args.data_dir.resolve(), args.output_dir, args.languages, args.target, args.quick, args.feature_kinds)


if __name__ == "__main__":
    main()
