from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypedDict, cast

import joblib
import onnx
import pandas as pd
import sklearn
from onnx.checker import check_model
from skl2onnx import to_onnx
from skl2onnx.common.data_types import StringTensorType
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import FeatureUnion, Pipeline

RANDOM_STATE = 42
LABELS = ("negative", "neutral", "positive")
LANGUAGES = ("english", "filipino")
CANDIDATES = (0.5, 1.0, 2.0, 4.0)
DATASET_DIR = Path(__file__).resolve().parent / "processed"
MODEL_DIR = Path(__file__).resolve().parent / "models"
REQUIRED_COLUMNS = {"text", "language", "label", "split"}
ZERO_DIVISION = cast(Any, 0)


class LabelMetrics(TypedDict):
    precision: float
    recall: float
    f1: float
    support: float


class EvaluationMetrics(TypedDict):
    samples: int
    accuracy: float
    macro_f1: float
    weighted_f1: float
    per_label: dict[str, LabelMetrics]
    confusion_matrix_labels: list[str]
    confusion_matrix: list[list[int]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DATASET_DIR)
    parser.add_argument("--output-dir", type=Path, default=MODEL_DIR)
    return parser.parse_args()


def load_splits(data_dir: Path) -> dict[str, pd.DataFrame]:
    frames: dict[str, pd.DataFrame] = {}
    for split in ("train", "validation", "test"):
        path = data_dir / f"{split}.csv"
        if not path.is_file():
            raise FileNotFoundError(path)
        frame = pd.read_csv(path, dtype="string")
        if set(frame.columns) != REQUIRED_COLUMNS:
            raise ValueError(f"{path} must contain exactly {sorted(REQUIRED_COLUMNS)}")
        if not bool(frame["split"].eq(split).all()):
            raise ValueError(f"{path} contains an incorrect split value")
        if bool(frame[list(REQUIRED_COLUMNS)].isna().to_numpy().any()):
            raise ValueError(f"{path} contains missing required values")
        frame = frame.assign(
            text=frame["text"].str.strip(),
            language=frame["language"].str.strip().str.lower(),
            label=frame["label"].str.strip().str.lower(),
        )
        if bool(frame["text"].eq("").any()):
            raise ValueError(f"{path} contains empty text")
        if not bool(frame["label"].isin(LABELS).all()):
            raise ValueError(f"{path} contains unsupported sentiment labels")
        frames[split] = frame.reset_index(drop=True)

    for left, right in (("train", "validation"), ("train", "test"), ("validation", "test")):
        left_keys = set(frames[left]["language"] + "\0" + frames[left]["text"])
        right_keys = set(frames[right]["language"] + "\0" + frames[right]["text"])
        overlap = left_keys.intersection(right_keys)
        if overlap:
            raise ValueError(f"{left} and {right} contain {len(overlap)} duplicate examples")
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
                max_features=120_000,
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
                max_features=120_000,
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


def build_classifier(candidate: float) -> OneVsRestClassifier:
    return OneVsRestClassifier(
        LogisticRegression(
            C=candidate,
            max_iter=1000,
            random_state=RANDOM_STATE,
            solver="liblinear",
        )
    )


def _label_metrics(entry: dict[str, Any]) -> LabelMetrics:
    return LabelMetrics(
        precision=float(entry.get("precision", 0.0)),
        recall=float(entry.get("recall", 0.0)),
        f1=float(entry.get("f1-score", 0.0)),
        support=float(entry.get("support", 0.0)),
    )


def evaluate(y_true: pd.Series, y_pred: pd.Series) -> EvaluationMetrics:
    report_raw: object = classification_report(
        y_true,
        y_pred,
        labels=LABELS,
        target_names=LABELS,
        output_dict=True,
        zero_division=ZERO_DIVISION,
    )
    if not isinstance(report_raw, dict):
        raise TypeError("classification_report must return a dict with output_dict=True")
    report = cast(dict[str, Any], report_raw)
    per_label: dict[str, LabelMetrics] = {}
    for label in LABELS:
        entry = report[label]
        if not isinstance(entry, dict):
            raise TypeError(f"classification_report entry for {label!r} must be a dict")
        per_label[label] = _label_metrics(entry)
    return EvaluationMetrics(
        samples=int(len(y_true)),
        accuracy=float(accuracy_score(y_true, y_pred)),
        macro_f1=float(
            f1_score(
                y_true,
                y_pred,
                labels=LABELS,
                average="macro",
                zero_division=ZERO_DIVISION,
            )
        ),
        weighted_f1=float(
            f1_score(
                y_true,
                y_pred,
                labels=LABELS,
                average="weighted",
                zero_division=ZERO_DIVISION,
            )
        ),
        per_label=per_label,
        confusion_matrix_labels=list(LABELS),
        confusion_matrix=confusion_matrix(y_true, y_pred, labels=LABELS).tolist(),
    )


def train_language(
    language: str,
    train: pd.DataFrame,
    validation: pd.DataFrame,
    test: pd.DataFrame,
    output_dir: Path,
) -> dict[str, object]:
    train_frame: pd.DataFrame = train.loc[train["language"].eq(language)].reset_index(drop=True)
    validation_frame: pd.DataFrame = validation.loc[validation["language"].eq(language)].reset_index(
        drop=True
    )
    test_frame: pd.DataFrame = test.loc[test["language"].eq(language)].reset_index(drop=True)
    if train_frame.empty or validation_frame.empty or test_frame.empty:
        raise ValueError(f"{language} requires nonempty train, validation, and test data")
    if any(
        not bool(frame["label"].isin(LABELS).all())
        for frame in (train_frame, validation_frame, test_frame)
    ):
        raise ValueError(f"{language} splits must contain all {len(LABELS)} labels")

    print(
        f"\n{language}: {len(train_frame):,} train / {len(validation_frame):,} validation / "
        f"{len(test_frame):,} test"
    )
    vectorizer = build_vectorizer()
    train_features = vectorizer.fit_transform(train_frame["text"])
    validation_features = vectorizer.transform(validation_frame["text"])

    best_candidate = CANDIDATES[0]
    best_score = -1.0
    best_validation: EvaluationMetrics | None = None
    validation_labels = cast(pd.Series, validation_frame["label"])
    for candidate in CANDIDATES:
        classifier = build_classifier(candidate)
        classifier.fit(train_features, train_frame["label"])
        predictions = classifier.predict(validation_features)
        metrics = evaluate(
            validation_labels,
            pd.Series(cast(Any, predictions), index=validation_frame.index),
        )
        score = metrics["macro_f1"]
        accuracy = metrics["accuracy"]
        print(f"  C={candidate:g}: macro_f1={score:.4f}, accuracy={accuracy:.4f}")
        if score > best_score:
            best_candidate = candidate
            best_score = score
            best_validation = metrics

    combined = pd.concat([train_frame, validation_frame], ignore_index=True)
    pipeline = Pipeline(
        [
            ("features", build_vectorizer()),
            ("classifier", build_classifier(best_candidate)),
        ]
    )
    pipeline.fit(combined["text"], combined["label"])
    test_predictions = pipeline.predict(test_frame["text"])
    test_metrics = evaluate(
        cast(pd.Series, test_frame["label"]),
        pd.Series(cast(Any, test_predictions), index=test_frame.index),
    )
    metadata: dict[str, object] = {
        "artifact_version": 1,
        "model_type": "word_character_tfidf_logistic_regression",
        "language": language,
        "labels": list(LABELS),
        "best_c": best_candidate,
        "random_state": RANDOM_STATE,
        "sklearn_version": sklearn.__version__,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_samples": int(len(combined)),
        "validation_metrics": best_validation,
        "test_metrics": test_metrics,
    }
    artifact_path = output_dir / f"sentiment_{language}.joblib"
    joblib.dump({"pipeline": pipeline, "metadata": metadata}, artifact_path, compress=3)
    onnx_metadata = export_onnx(pipeline, artifact_path)
    metadata["artifact_path"] = str(artifact_path)
    metadata["onnx_artifact"] = onnx_metadata
    test_macro = test_metrics["macro_f1"]
    test_accuracy = test_metrics["accuracy"]
    print(
        f"  selected C={best_candidate:g}; test macro_f1={test_macro:.4f}, "
        f"accuracy={test_accuracy:.4f}"
    )
    print(f"  saved {artifact_path} and {onnx_metadata['artifact_path']}")
    return metadata


def main() -> None:
    args = parse_args()
    frames = load_splits(args.data_dir.resolve())
    args.output_dir.mkdir(parents=True, exist_ok=True)
    results = [
        train_language(
            language,
            frames["train"],
            frames["validation"],
            frames["test"],
            args.output_dir.resolve(),
        )
        for language in LANGUAGES
    ]
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "python_model_family": "word-character TF-IDF with logistic regression",
        "models": results,
    }
    manifest_path = args.output_dir.resolve() / "baseline_metrics.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nMetrics saved to {manifest_path}")


if __name__ == "__main__":
    main()
