from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

import joblib
import onnx
import pandas as pd
import sklearn
from onnx.checker import check_model
from skl2onnx import to_onnx
from skl2onnx.common.data_types import StringTensorType
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.pipeline import FeatureUnion, Pipeline

RANDOM_STATE = 42
LABELS = ("english", "filipino", "cebuano")
CANDIDATES = (0.5, 1.0, 2.0, 4.0)
DATASET_DIR = Path(__file__).resolve().parent / "processed"
MODEL_DIR = Path(__file__).resolve().parent / "models"
REQUIRED_COLUMNS = {"text", "language", "label", "split"}
ZERO_DIVISION = cast(Any, 0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DATASET_DIR)
    parser.add_argument("--output-dir", type=Path, default=MODEL_DIR)
    return parser.parse_args()


def load_data(data_dir: Path) -> dict[str, pd.DataFrame]:
    frames: dict[str, pd.DataFrame] = {}
    for split in ("train", "validation", "test"):
        path = data_dir / f"{split}.csv"
        if not path.is_file():
            raise FileNotFoundError(path)
        frame = pd.read_csv(path, dtype="string")
        if set(frame.columns) != REQUIRED_COLUMNS:
            raise ValueError(f"{path} must contain exactly {sorted(REQUIRED_COLUMNS)}")
        frame = frame.assign(
            text=frame["text"].str.strip(),
            language=frame["language"].str.strip().str.lower(),
        )
        if bool(frame["text"].eq("").any()):
            raise ValueError(f"{path} contains empty text")
        if bool(frame["language"].isna().any()):
            raise ValueError(f"{path} contains missing language values")
        if not bool(frame["language"].isin(LABELS).all()):
            raise ValueError(f"{path} contains unsupported languages")
        frames[split] = frame.reset_index(drop=True)
    return frames


def build_vectorizer() -> FeatureUnion:
    transformers: list[tuple[str, Any]] = [
        (
            "word",
            TfidfVectorizer(
                analyzer="word",
                ngram_range=(1, 2),
                min_df=2,
                max_df=0.995,
                max_features=40_000,
                strip_accents=None,
                sublinear_tf=True,
            ),
        ),
        (
            "character",
            TfidfVectorizer(
                analyzer="char",
                ngram_range=(3, 5),
                min_df=3,
                max_features=50_000,
                strip_accents=None,
                sublinear_tf=True,
            ),
        ),
    ]
    return FeatureUnion(transformers)


def pin_string_normalizer_locale(model: Any) -> int:
    patched = 0
    for node in model.graph.node:
        if node.op_type != "StringNormalizer":
            continue
        if any(attribute.name == "locale" for attribute in node.attribute):
            continue
        attribute = node.attribute.add()
        attribute.name = "locale"
        attribute.type = onnx.AttributeProto.STRING
        attribute.s = b"C"
        patched += 1
    return patched


def export_onnx(pipeline: Pipeline, artifact_path: Path) -> dict[str, object]:
    onnx_path = artifact_path.with_suffix(".onnx")
    initial_types = cast(Any, [("text", StringTensorType([None, 1]))])
    model: Any = to_onnx(
        pipeline,
        initial_types=initial_types,
        target_opset=17,
        options={id(pipeline.named_steps["classifier"]): {"zipmap": False}},
    )
    pinned = pin_string_normalizer_locale(model)
    check_model(model)
    onnx.save(model, onnx_path)
    return {
        "artifact_path": str(onnx_path),
        "opset": int(model.opset_import[0].version),
        "string_normalizer_locale_pinned": pinned,
    }


def build_classifier(candidate: float) -> LogisticRegression:
    return LogisticRegression(
        C=candidate,
        max_iter=1000,
        random_state=RANDOM_STATE,
        solver="lbfgs",
    )


def evaluate(y_true: pd.Series, y_pred: pd.Series) -> dict[str, float]:
    return {
        "samples": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "macro_f1": float(
            f1_score(
                y_true,
                y_pred,
                labels=list(LABELS),
                average="macro",
                zero_division=ZERO_DIVISION,
            )
        ),
        "weighted_f1": float(
            f1_score(
                y_true,
                y_pred,
                labels=list(LABELS),
                average="weighted",
                zero_division=ZERO_DIVISION,
            )
        ),
    }


def main() -> None:
    args = parse_args()
    frames = load_data(args.data_dir.resolve())
    train = frames["train"]
    validation = frames["validation"]
    test = frames["test"]
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(
        f"{len(train):,} train / {len(validation):,} validation / {len(test):,} test"
    )

    vectorizer = build_vectorizer()
    train_features = vectorizer.fit_transform(train["text"])
    validation_features = vectorizer.transform(validation["text"])

    best_candidate = CANDIDATES[0]
    best_score = -1.0
    for candidate in CANDIDATES:
        classifier = build_classifier(candidate)
        classifier.fit(train_features, train["language"])
        predictions = classifier.predict(validation_features)
        metrics = evaluate(
            validation["language"], pd.Series(cast(Any, predictions), index=validation.index)
        )
        print(
            f"  C={candidate:g}: macro_f1={metrics['macro_f1']:.4f}, "
            f"accuracy={metrics['accuracy']:.4f}"
        )
        if metrics["macro_f1"] > best_score:
            best_score = metrics["macro_f1"]
            best_candidate = candidate

    combined = pd.concat([train, validation], ignore_index=True)
    pipeline = Pipeline(
        [
            ("features", build_vectorizer()),
            ("classifier", build_classifier(best_candidate)),
        ]
    )
    pipeline.fit(combined["text"], combined["language"])

    classes = list(pipeline.named_steps["classifier"].classes_)
    if classes != sorted(LABELS):
        raise ValueError(f"unexpected classifier label order: {classes}")

    test_predictions = pipeline.predict(test["text"])
    test_metrics = evaluate(
        test["language"], pd.Series(cast(Any, test_predictions), index=test.index)
    )

    metadata: dict[str, object] = {
        "artifact_version": 1,
        "model_type": "word_character_tfidf_logistic_regression",
        "labels": classes,
        "best_c": best_candidate,
        "random_state": RANDOM_STATE,
        "sklearn_version": sklearn.__version__,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_samples": int(len(combined)),
        "test_metrics": test_metrics,
    }
    artifact_path = output_dir / "language_id.joblib"
    joblib.dump({"pipeline": pipeline, "metadata": metadata}, artifact_path, compress=3)
    onnx_metadata = export_onnx(pipeline, artifact_path)
    metadata["artifact_path"] = str(artifact_path)
    metadata["onnx_artifact"] = onnx_metadata

    manifest_path = output_dir / "language_id_metrics.json"
    manifest_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(
        f"  selected C={best_candidate:g}; test macro_f1={test_metrics['macro_f1']:.4f}, "
        f"accuracy={test_metrics['accuracy']:.4f}"
    )
    print(f"  label order: {classes}")
    print(f"  saved {artifact_path} and {onnx_metadata['artifact_path']}")
    print(f"  metrics saved to {manifest_path}")


if __name__ == "__main__":
    main()
