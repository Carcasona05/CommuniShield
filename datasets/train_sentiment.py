from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypedDict, cast

import joblib
import numpy as np
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
CANDIDATES = (0.5, 1.0, 2.0, 4.0)
LOGIT_OFFSETS = (-0.3, -0.15, 0.0, 0.15, 0.3, 0.45, 0.6, 0.8)
DATASET_DIR = Path(__file__).resolve().parent / "processed"
MODEL_DIR = Path(__file__).resolve().parent / "models"
REQUIRED_COLUMNS = {"text", "language", "label", "split"}
ZERO_DIVISION = cast(Any, 0)


class TrainingQualityError(ValueError):
    """Expected validation rejection, not a crashed training process."""

    def __init__(self, language, reasons):
        self.language = language
        self.reasons = reasons
        super().__init__(f"{language}: {'; '.join(reasons)}")


PLACEHOLDER_PATTERN = re.compile(
    r"sample\s+training\s+phrase\s+\d+|prototype\s+dataset\s+\d+|"
    r"synthetic\s+(?:negative|positive|neutral)\s+safety\s+wording",
    re.IGNORECASE,
)


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
    parser.add_argument("--baseline-model-dir", type=Path,
                        help="Active ONNX bundle used for validation-only recall safeguards")
    parser.add_argument('--independent-quality', action='store_true',
                        help='Select with absolute validation quality floors, not built-in scores')
    parser.add_argument('--validation-only', action='store_true',
                        help='Offline development: do not load or score test.csv')
    parser.add_argument('--languages', nargs='+', choices=('cebuano','english','filipino'),
                        help='Fit only the declared languages; never infer scope from baseline splits')
    return parser.parse_args()


def load_splits(data_dir: Path, include_test: bool = True) -> dict[str, pd.DataFrame]:
    frames: dict[str, pd.DataFrame] = {}
    for split in (("train", "validation", "test") if include_test else ("train", "validation")):
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
        if bool(frame["text"].str.contains(PLACEHOLDER_PATTERN, na=False).any()):
            raise ValueError(f"{path} contains seed placeholder phrases, not labeled training examples")
        if not bool(frame["label"].isin(LABELS).all()):
            raise ValueError(f"{path} contains unsupported sentiment labels")
        frames[split] = frame.reset_index(drop=True)
        frames[split].attrs["source_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()

    for left, right in (("train", "validation"), ("train", "test"), ("validation", "test")):
        if left not in frames or right not in frames:
            continue
        left_keys = set(frames[left]["language"] + "\0" + frames[left]["text"])
        right_keys = set(frames[right]["language"] + "\0" + frames[right]["text"])
        overlap = left_keys.intersection(right_keys)
        if overlap:
            raise ValueError(f"{left} and {right} contain {len(overlap)} duplicate examples")
    return frames


def build_vectorizer(word_max_ngram: int = 2) -> FeatureUnion:
    transformers: list[tuple[str, Any]] = [
        (
            "word",
            TfidfVectorizer(
                analyzer="word",
                ngram_range=(1, word_max_ngram),
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
            # Rebalance classes from this training snapshot only. Validation
            # calibration separately protects each class's recall.
            class_weight="balanced",
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


def baseline_validation_metrics(model: Path, frame: pd.DataFrame) -> EvaluationMetrics:
    # Legacy bundles were refitted on validation: re-predicting that data with
    # them creates an in-sample (unfairly high) target. Use recorded pre-refit
    # validation metrics paired with exactly the same ONNX artifact instead.
    for folder in dict.fromkeys([model.parent, MODEL_DIR]):
        metadata = folder / "baseline_metrics.json"
        paired = folder / model.name
        if not metadata.is_file() or not paired.is_file():
            continue
        manifest = json.loads(metadata.read_text(encoding="utf-8"))
        if hashlib.sha256(paired.read_bytes()).digest() != hashlib.sha256(model.read_bytes()).digest():
            continue
        # Downloaded active bundles include hashes bound to their training
        # metadata by the worker; reject a stale sidecar rather than guessing.
        expected_hash = manifest.get("onnx_hashes", {}).get(model.name)
        if expected_hash and expected_hash != hashlib.sha256(model.read_bytes()).hexdigest():
            continue
        language = model.stem.removeprefix("sentiment_")
        entry = next((item for item in manifest.get("models", []) if item.get("language") == language), None)
        if entry and entry.get("validation_metrics"):
            metrics = entry["validation_metrics"]
            if metrics.get("samples") != len(frame):
                raise ValueError(f"{language}: validation size differs from the baseline metadata. Provision the original frozen holdout.")
            if any(metrics["per_label"][label]["support"] != int(frame["label"].eq(label).sum()) for label in LABELS):
                raise ValueError(f"{language}: validation class counts differ from the baseline metadata.")
            expected_validation = manifest.get("input_split_hashes", {}).get("validation")
            if expected_validation and expected_validation != frame.attrs.get("source_sha256"):
                raise ValueError(f"{language}: validation file changed since baseline training. Provision the original frozen holdout.")
            return metrics
    raise ValueError(f"Recorded validation metadata matching {model.name} is missing. Provision datasets/models/baseline_metrics.json with its matching ONNX bundle; do not use test metrics as a substitute.")


def select_validation_offsets(decisions, classes, labels, reference=None, independent_quality=False):
    """Choose class intercept offsets on validation, never keywords or test rows.

    Macro-F1 alone can trade away negative recall. Protect ALL classes relative
    to the active model's validation recall, while keeping macro-F1 comparable.
    Center the neutral offset at zero to avoid redundant uniform shifts.
    """
    if independent_quality and reference is not None:
        raise ValueError('Independent selection must not use a built-in metric reference')
    classes = [str(label) for label in classes]
    if set(classes) != set(LABELS):
        raise ValueError("Classifier must contain all three sentiment classes")
    decisions = np.asarray(decisions, dtype=float)
    labels = list(labels)
    if decisions.shape != (len(labels), 3) or not np.isfinite(decisions).all():
        raise ValueError("Invalid validation decision scores")
    expected = np.array([classes.index(label) for label in labels])
    support = np.bincount(expected, minlength=3)
    if not support.all():
        raise ValueError("Validation must contain all three sentiment classes")
    floors = np.array([max(0.0, reference["per_label"][label]["recall"] - 0.02)
                       for label in classes]) if reference else np.full(3, 0.5 if independent_quality else 0.0)
    minimum_f1 = max(0.6, reference["macro_f1"] - 0.01) if reference else (0.6 if independent_quality else 0.0)
    if independent_quality and (support < 10).any():
        return None
    offsets = itertools.product(LOGIT_OFFSETS, repeat=2) if reference or independent_quality else [(0.0, 0.0)]
    best = None
    for negative, positive in offsets:
        bias = np.array([negative if label == "negative" else positive if label == "positive" else 0.0
                         for label in classes])
        predicted = (decisions + bias).argmax(axis=1)
        confusion = np.bincount(expected * 3 + predicted, minlength=9).reshape(3, 3)
        tp = confusion.diagonal()
        recall = tp / support
        predicted_counts = confusion.sum(axis=0)
        precision = np.divide(tp, predicted_counts, out=np.zeros(3), where=predicted_counts > 0)
        denominator = support + confusion.sum(axis=0)
        score = float(np.mean(2 * tp / denominator))
        if score < minimum_f1 or np.any(recall + 1e-12 < floors):
            continue
        if independent_quality and np.any(precision < 0.5):
            continue
        # Prefer smaller offsets when validation scores tie.
        rank = (score, -float(np.abs(bias).sum()))
        if best is None or rank > best["rank"]:
            best = {"rank": rank, "offsets": dict(zip(classes, bias.tolist())),
                    "macro_f1": score, "recall_floors": dict(zip(classes, floors.tolist())),
                    "precision_floors": dict.fromkeys(classes, 0.5) if independent_quality else None}
    return best


def train_language(
    language: str,
    train: pd.DataFrame,
    validation: pd.DataFrame,
    test: pd.DataFrame,
    output_dir: Path,
    baseline_model_dir: Path | None = None,
    word_max_ngram: int = 2,
    independent_quality: bool = False,
    evaluate_test: bool = True,
) -> dict[str, object]:
    if independent_quality and baseline_model_dir is not None:
        raise ValueError('Independent training cannot use built-in selection metrics')
    train_frame: pd.DataFrame = train.loc[train["language"].eq(language)].reset_index(drop=True)
    validation_frame: pd.DataFrame = validation.loc[validation["language"].eq(language)].reset_index(
        drop=True
    )
    test_frame = test.loc[test["language"].eq(language)].reset_index(drop=True) if evaluate_test else None
    evaluated_frames = [train_frame, validation_frame] + ([test_frame] if test_frame is not None else [])
    if any(frame.empty for frame in evaluated_frames):
        raise ValueError(f"{language} requires nonempty train, validation, and test data")
    if any(
        set(frame["label"]) != set(LABELS)
        for frame in evaluated_frames
    ):
        raise ValueError(f"{language} splits must contain all {len(LABELS)} labels")

    print(
        f"\n{language}: {len(train_frame):,} train / {len(validation_frame):,} validation / "
        f"{f'{len(test_frame):,} test' if test_frame is not None else 'test deferred (validation-only)'}"
    )
    vectorizer = build_vectorizer() if word_max_ngram == 2 else build_vectorizer(word_max_ngram)
    train_features = vectorizer.fit_transform(train_frame["text"])
    validation_features = vectorizer.transform(validation_frame["text"])

    reference = baseline_validation_metrics(baseline_model_dir / f"sentiment_{language}.onnx", validation_frame) if baseline_model_dir else None
    best_candidate = CANDIDATES[0]
    best_score = -1.0
    best_classifier = None
    best_selection = None
    best_class_weight = 'balanced'
    validation_labels = cast(pd.Series, validation_frame["label"])
    configurations = [(c, weight) for c in CANDIDATES for weight in (('balanced', None) if independent_quality else ('balanced',))]
    for candidate, class_weight in configurations:
        classifier = build_classifier(candidate)
        classifier.set_params(estimator__class_weight=class_weight)
        classifier.fit(train_features, train_frame["label"])
        selection = select_validation_offsets(classifier.decision_function(validation_features),
                                               classifier.classes_, validation_labels, reference, independent_quality)
        if selection is None:
            print(f"  C={candidate:g}, weight={class_weight}: no validation setting meets the required class-quality floors", flush=True)
            continue
        score = selection["macro_f1"]
        print(f"  C={candidate:g}, weight={class_weight}: validation macro_f1={score:.4f}, offsets={selection['offsets']}", flush=True)
        if score > best_score:
            best_candidate = candidate
            best_score = score
            best_classifier = classifier
            best_selection = selection
            best_class_weight = class_weight

    if best_classifier is None or best_selection is None:
        raise TrainingQualityError(language, [
            'No fitted candidate meets the required validation macro-F1 and per-class precision/recall floors. '
            'Review the training labels and class coverage. Quality requirements were not relaxed.'
        ])
    for index, label in enumerate(best_classifier.classes_):
        best_classifier.estimators_[index].intercept_ += best_selection["offsets"][label]
    pipeline = Pipeline(
        [
            ("features", vectorizer),
            ("classifier", best_classifier),
        ]
    )
    # Export the exact model selected on validation. Do NOT refit it on
    # train+validation: that changes its decisions and contaminates the holdout.
    best_validation = evaluate(validation_labels, pd.Series(pipeline.predict(validation_frame["text"])))
    test_predictions = pipeline.predict(test_frame["text"]) if test_frame is not None else None
    test_metrics = evaluate(
        cast(pd.Series, test_frame["label"]),
        pd.Series(cast(Any, test_predictions), index=test_frame.index),
    ) if test_frame is not None else None
    metadata: dict[str, object] = {
        "artifact_version": 1,
        "model_type": "word_character_tfidf_logistic_regression",
        "language": language,
        "labels": list(LABELS),
        "best_c": best_candidate,
        "word_max_ngram": word_max_ngram,
        'class_weight': best_class_weight,
        'test_evaluated': evaluate_test,
        "random_state": RANDOM_STATE,
        "sklearn_version": sklearn.__version__,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_samples": int(len(train_frame)),
        "fit_splits": ["train"],
        "calibration": {"selection_split": "validation", "logit_offsets": best_selection["offsets"],
                        "recall_floors": best_selection["recall_floors"], "baseline_validation": reference,
                        "precision_floors": best_selection['precision_floors'],
                        "selection_policy": 'independent-quality-v2' if independent_quality else 'legacy'},
        "validation_metrics": best_validation,
        "test_metrics": test_metrics,
    }
    artifact_path = output_dir / f"sentiment_{language}.joblib"
    joblib.dump({"pipeline": pipeline, "metadata": metadata}, artifact_path, compress=3)
    onnx_metadata = export_onnx(pipeline, artifact_path)
    metadata["artifact_path"] = str(artifact_path)
    metadata["onnx_artifact"] = onnx_metadata
    if test_metrics is not None:
        print(f"  selected C={best_candidate:g}; test macro_f1={test_metrics['macro_f1']:.4f}, accuracy={test_metrics['accuracy']:.4f}")
    else:
        print(f'  selected C={best_candidate:g}; test not read or scored')
    print(f"  saved {artifact_path} and {onnx_metadata['artifact_path']}")
    return metadata


def discover_languages(frames: dict[str, pd.DataFrame]) -> tuple[str, ...]:
    languages = set()
    for frame in frames.values():
        languages.update(str(value) for value in frame["language"].unique())
    return tuple(sorted(languages))


def main() -> None:
    args = parse_args()
    frames = load_splits(args.data_dir.resolve(), include_test=not args.validation_only)
    languages = tuple(sorted(set(args.languages))) if args.languages else discover_languages(frames)
    print(f"languages: {', '.join(languages)}")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for language in languages:
        try:
            result = train_language(
                language,
                frames["train"],
                frames["validation"],
                frames.get("test", pd.DataFrame()),
                args.output_dir.resolve(),
                args.baseline_model_dir.resolve() if args.baseline_model_dir else None,
                independent_quality=args.independent_quality,
                word_max_ngram=3 if args.independent_quality else 2,
                evaluate_test=not args.validation_only,
            )
            results.append(result)
        except TrainingQualityError as error:
            # Deliberately no private text, traceback, or absolute file paths.
            # Partial artifacts stay private and can never be registered.
            failure = {
                'kind': 'validation_quality', 'language': error.language,
                'reasons': error.reasons, 'completed_languages': [r['language'] for r in results],
                'requested_languages': list(languages), 'test_used_for_selection': False,
            }
            (args.output_dir / 'training_failure.json').write_text(json.dumps(failure, indent=2), encoding='utf-8')
            print(f'Validation quality checks failed: {error}', flush=True)
            raise SystemExit(2) from None
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "python_model_family": "word-character TF-IDF with logistic regression",
        "models": results,
        "input_split_hashes": {split: hashlib.sha256((args.data_dir / f"{split}.csv").read_bytes()).hexdigest()
                               for split in frames},
        "trainer_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    }
    manifest_path = args.output_dir.resolve() / "baseline_metrics.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nMetrics saved to {manifest_path}")


if __name__ == "__main__":
    main()
