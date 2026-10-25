"""Warm-start the active classifier; never rebuild its fitted vocabulary.

Only trusted, checksummed worker-owned joblib states may be loaded. Validation
selects update strength; test rows never participate in fitting or selection.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import shutil
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import log_loss

from import_approved_sentiment import text_key
from train_sentiment import LABELS, MODEL_DIR, baseline_validation_metrics, evaluate, export_onnx, load_splits

UPDATE_STRENGTHS = (0.05, 0.1, 0.25, 0.5, 1.0)
REPLAY_PER_CLASS = 300


def new_examples(snapshot, previous):
    old = {text_key(row): row["label"] for row in previous.get("samples", [])}
    current = {text_key(row): row["label"] for row in snapshot["samples"]}
    if any(current.get(key) != label for key, label in old.items()):
        raise ValueError("Previously learned data was removed or relabelled. Continued training cannot unlearn it. Roll back to a model before those examples, or perform a separately reviewed full rebuild.")
    return [row for row in snapshot["samples"] if text_key(row) not in old]


def state_path(baseline: Path, language: str, bootstrap: Path) -> Path:
    name = f"sentiment_{language}"
    local = baseline / f"{name}.joblib"
    if local.is_file():
        # Remote active states were checksum-verified by Cloud.download_bundle.
        return local
    source = bootstrap / f"{name}.joblib"
    paired = bootstrap / f"{name}.onnx"
    if not source.is_file() or not paired.is_file() or hashlib.sha256(paired.read_bytes()).digest() != hashlib.sha256((baseline / f"{name}.onnx").read_bytes()).digest():
        raise ValueError(f"Matching training state missing for {language}. Provision the trusted joblib state paired with the active ONNX model; ONNX alone cannot continue training.")
    return source


def replay_rows(train: pd.DataFrame, additions: pd.DataFrame) -> pd.DataFrame:
    """Deterministic, balanced rehearsal; no validation/test rows admitted."""
    added = {text_key(row) for row in additions.to_dict("records")}
    candidates = train.loc[[text_key(row) not in added for row in train.to_dict("records")]].copy()
    candidates["replay_key"] = [hashlib.sha256((row["language"] + "\0" + row["text"]).encode()).hexdigest()
                                for row in candidates.to_dict("records")]
    parts = [candidates.loc[candidates["label"].eq(label)].sort_values("replay_key").head(REPLAY_PER_CLASS)
             for label in LABELS]
    return pd.concat([*parts, additions], ignore_index=True).drop(columns=["replay_key"], errors="ignore")


def continue_pipeline(active, replay: pd.DataFrame, additions: pd.DataFrame,
                      validation: pd.DataFrame, reference: dict | None):
    # Never call active.features.fit() or OneVsRestClassifier.fit(), which
    # would reinitialize its binary estimators instead of retaining weights.
    features = active.named_steps["features"]
    trained = copy.deepcopy(active)
    classifier = trained.named_steps["classifier"]
    if list(classifier.classes_) != list(LABELS):
        raise ValueError("Active classifier class order is incompatible")
    x_replay = features.transform(replay["text"])
    for index, label in enumerate(classifier.classes_):
        estimator = classifier.estimators_[index]
        estimator.set_params(solver="lbfgs", warm_start=True, max_iter=200)
        estimator.fit(x_replay, replay["label"].eq(label).astype(int))
    old = active.named_steps["classifier"]
    x_validation = features.transform(validation["text"])
    x_new = features.transform(additions["text"])
    unrepresented = int((x_new.getnnz(axis=1) == 0).sum())
    if unrepresented == len(additions):
        raise ValueError("New examples contain no features recognized by the active vocabulary. A separately reviewed vocabulary rebuild is required.")
    old_new_loss = log_loss(additions["label"], old.predict_proba(x_new), labels=list(LABELS))
    floors = {label: max(0.0, reference["per_label"][label]["recall"] - 0.02) if reference else 0.5 for label in LABELS}
    best = None
    for strength in UPDATE_STRENGTHS:
        candidate = copy.deepcopy(classifier)
        for before, after, target in zip(old.estimators_, classifier.estimators_, candidate.estimators_):
            target.coef_ = before.coef_ + strength * (after.coef_ - before.coef_)
            target.intercept_ = before.intercept_ + strength * (after.intercept_ - before.intercept_)
        metrics = evaluate(validation["label"], pd.Series(candidate.predict(x_validation)))
        loss = log_loss(additions["label"], candidate.predict_proba(x_new), labels=list(LABELS))
        eligible = metrics["macro_f1"] >= (max(0.6, reference["macro_f1"] - 0.01) if reference else 0.6) and all(
            metrics["per_label"][label]["recall"] >= floor for label, floor in floors.items())
        if reference is None:
            eligible = eligible and all(metrics['per_label'][label]['precision'] >= 0.5 for label in LABELS)
        if not eligible or (reference is not None and loss > old_new_loss + 1e-10):
            continue
        rank = (metrics["macro_f1"], -loss, -strength)
        if best is None or rank > best["rank"]:
            best = {"rank": rank, "classifier": candidate, "validation": metrics,
                    "strength": strength, "new_loss_before": old_new_loss, "new_loss_after": loss,
                    "new_examples_without_features": unrepresented}
    if best is None:
        raise ValueError("No continued update preserves validation quality while learning the new examples. The active model remains unchanged.")
    result = copy.deepcopy(active)
    result.set_params(classifier=best["classifier"])
    return result, {key: value for key, value in best.items() if key not in ("classifier", "rank")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--baseline-model-dir", type=Path, required=True)
    parser.add_argument("--snapshot-file", type=Path, required=True)
    parser.add_argument("--independent-quality", action="store_true", help="Select against absolute held-out quality, not built-in metrics")
    parser.add_argument("--bootstrap-state-dir", type=Path, default=MODEL_DIR)
    parser.add_argument('--languages', nargs='+', choices=('cebuano','english','filipino'))
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot_file.read_text(encoding="utf-8"))
    previous_file = args.baseline_model_dir / "approved_snapshot.json"
    previous = json.loads(previous_file.read_text(encoding="utf-8")) if previous_file.is_file() else {"samples": []}
    additions = new_examples(snapshot, previous)
    frames = load_splits(args.data_dir)
    # build_snapshot already excludes held-out and baseline-duplicate samples.
    accepted = json.loads((args.data_dir / "approved_training_samples.json").read_text(encoding="utf-8"))
    train_keys = {text_key(row) for row in accepted}
    holdout_keys = {text_key(row) for split in ("validation", "test") for row in frames[split].to_dict("records")}
    additions = [row for row in additions if text_key(row) in train_keys and text_key(row) not in holdout_keys]
    if not additions:
        raise ValueError("No new approved training examples since the active model. Nothing was updated.")
    args.output_dir.mkdir(parents=True, exist_ok=False)
    models = []
    for language in sorted(set(args.languages) if args.languages else {row["language"] for row in frames["train"].to_dict("records")}):
        source = state_path(args.baseline_model_dir, language, args.bootstrap_state_dir)
        # joblib is executable serialization: sources MUST be trusted bootstrap
        # artifacts or private worker artifacts whose manifest checksum matched.
        saved = joblib.load(source)
        active = saved["pipeline"]
        metadata = dict(saved["metadata"])
        new = pd.DataFrame([row for row in additions if row["language"] == language])
        target = args.output_dir / f"sentiment_{language}.joblib"
        if new.empty:
            shutil.copyfile(source, target)
            shutil.copyfile(args.baseline_model_dir / f"sentiment_{language}.onnx", target.with_suffix(".onnx"))
            metadata.update(update_mode="unchanged_no_new_examples", new_examples=0)
        else:
            train = frames["train"].loc[frames["train"]["language"].eq(language)]
            validation = frames["validation"].loc[frames["validation"]["language"].eq(language)].reset_index(drop=True)
            reference = None if args.independent_quality else baseline_validation_metrics(args.baseline_model_dir / f"sentiment_{language}.onnx", validation)
            replay = replay_rows(train, new)
            print(f"{language}: continuing active weights with {len(new)} new and {len(replay) - len(new)} replay examples", flush=True)
            try:
                updated, selection = continue_pipeline(active, replay, new, validation, reference)
            except ValueError as error:
                if not args.independent_quality or not str(error).startswith('No continued update preserves'):
                    raise
                (args.output_dir / 'training_failure.json').write_text(json.dumps({
                    'kind':'validation_quality','language':language,'completed_languages':[]}), encoding='utf-8')
                print(f'{language}: no continued candidate meets validation quality requirements', flush=True)
                raise SystemExit(2) from None
            metadata.update(update_mode="warm_start_fixed_vocabulary", new_examples=len(new),
                            replay_examples=len(replay) - len(new), selection_split="validation",
                            fit_splits=["train"], training_samples=len(replay),
                            validation_metrics=selection["validation"], continued_update=selection)
            metadata.pop("test_metrics", None)  # measured later by the independent ONNX gate
            joblib.dump({"pipeline": updated, "metadata": metadata}, target, compress=3)
            export_onnx(updated, target)
        models.append(metadata)
    (args.output_dir / "baseline_metrics.json").write_text(json.dumps({
        "mode": "continued", "models": models, "new_examples": len(additions),
        "input_split_hashes": {split: hashlib.sha256((args.data_dir / f"{split}.csv").read_bytes()).hexdigest()
                               for split in ("train", "validation", "test")},
        "trainer_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    }, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
