"""Stage a Cebuano-only candidate and compare with the current local model.

Does not replace served models or alter canonical splits. Review report.json and
ONNX predictions before deployment. Uses authored labels, never model predictions.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.pipeline import Pipeline

from cebuano_contrastive_examples import CHALLENGE, EXACT_REPORT, build_training_rows, normalize
from train_sentiment import CANDIDATES, build_classifier, build_vectorizer, evaluate, export_onnx, load_splits

BASE = Path(__file__).resolve().parent


def score(pipeline, frame):
    predictions = pd.Series(pipeline.predict(frame["text"]), index=frame.index)
    return evaluate(frame["label"], predictions)


def challenge_results(pipeline):
    texts = [text for text, _ in CHALLENGE]
    predictions = pipeline.predict(texts)
    probabilities = pipeline.predict_proba(texts)
    return [dict(text=text, expected=expected, predicted=str(predicted),
                 confidence=float(max(probs)), correct=expected == predicted)
            for (text, expected), predicted, probs in zip(CHALLENGE, predictions, probabilities)]


def train_candidate(frames, output_dir, baseline_metadata):
    """Select classifier/calibration using validation ONLY, then refit once.

    Negation examples can shift neutral-vs-emotional class balance. Small learned
    intercept offsets protect validation recall without keyword/phrase overrides.
    No test labels or challenge checks participate in parameter selection.
    """
    ceb = {split: frame.loc[frame["language"].eq("cebuano")].reset_index(drop=True)
           for split, frame in frames.items()}
    features = build_vectorizer()
    x_train = features.fit_transform(ceb["train"]["text"])
    x_validation = features.transform(ceb["validation"]["text"])
    floors = {label: baseline_metadata["validation_metrics"]["per_label"][label]["recall"] - 0.02
              for label in ("negative", "positive")}
    best = None
    for c in CANDIDATES:
        classifier = build_classifier(c)
        classifier.fit(x_train, ceb["train"]["label"])
        negative = list(classifier.classes_).index("negative")
        positive = list(classifier.classes_).index("positive")
        original_negative = classifier.estimators_[negative].intercept_.copy()
        original_positive = classifier.estimators_[positive].intercept_.copy()
        for negative_offset in (0.0, 0.15, 0.3, 0.45, 0.6, 0.8):
            for positive_offset in (0.0, 0.15, 0.3, 0.45, 0.6):
                classifier.estimators_[negative].intercept_[:] = original_negative + negative_offset
                classifier.estimators_[positive].intercept_[:] = original_positive + positive_offset
                metrics = evaluate(ceb["validation"]["label"], pd.Series(classifier.predict(x_validation)))
                eligible = all(metrics["per_label"][label]["recall"] >= floor for label, floor in floors.items())
                if eligible and (best is None or metrics["macro_f1"] > best["metrics"]["macro_f1"]):
                    best = dict(c=c, negative_offset=negative_offset, positive_offset=positive_offset, metrics=metrics)
        print(f"Validation search completed for C={c}; best eligible macro-F1={best['metrics']['macro_f1'] if best else 'none'}", flush=True)
    if best is None:
        raise ValueError("No candidate preserves validation recall; models were not replaced.")
    combined = pd.concat([ceb["train"], ceb["validation"]], ignore_index=True)
    pipeline = Pipeline([("features", build_vectorizer()), ("classifier", build_classifier(best["c"]))])
    pipeline.fit(combined["text"], combined["label"])
    classifier = pipeline.named_steps["classifier"]
    for label, offset in (("negative", best["negative_offset"]), ("positive", best["positive_offset"])):
        classifier.estimators_[list(classifier.classes_).index(label)].intercept_ += offset
    metadata = dict(baseline_metadata)
    metadata.update(trained_at=datetime.now(timezone.utc).isoformat(), training_samples=len(combined), best_c=best["c"],
                    validation_metrics=best["metrics"], test_metrics=score(pipeline, ceb["test"]),
                    calibration={"selection_split": "validation", "negative_logit_offset": best["negative_offset"], "positive_logit_offset": best["positive_offset"], "recall_floors": floors})
    artifact = output_dir / "sentiment_cebuano.joblib"
    joblib.dump({"pipeline": pipeline, "metadata": metadata}, artifact, compress=3)
    metadata["artifact_path"] = str(artifact)
    metadata["onnx_artifact"] = export_onnx(pipeline, artifact)
    return metadata


def main():
    run = BASE.parent / "artifacts" / "cebuano-contrastive" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    data_dir = run / "data"
    models_dir = run / "models"
    data_dir.mkdir(parents=True)
    models_dir.mkdir()
    frames = load_splits(BASE / "processed")
    protected = {normalize(text) for split in ("validation", "test")
                 for text in frames[split].loc[frames[split]["language"].eq("cebuano"), "text"]}
    existing = {normalize(text) for text in frames["train"].loc[frames["train"]["language"].eq("cebuano"), "text"]}
    additions = pd.DataFrame([r for r in build_training_rows()
                              if normalize(r["text"]) not in protected | existing], columns=frames["train"].columns)
    additions.to_csv(run / "authored_training_additions.csv", index=False)
    frames["train"] = pd.concat([frames["train"], additions], ignore_index=True)
    frames["train"].to_csv(data_dir / "train.csv", index=False)
    # Holdout files are copied byte-for-byte, never assigned synthetic labels here.
    holdout_hashes = {}
    for split in ("validation", "test"):
        content = (BASE / "processed" / f"{split}.csv").read_bytes()
        (data_dir / f"{split}.csv").write_bytes(content)
        holdout_hashes[split] = hashlib.sha256(content).hexdigest()
    load_splits(data_dir)
    baseline_artifact = joblib.load(BASE / "models" / "sentiment_cebuano.joblib")
    baseline = baseline_artifact["pipeline"]
    test = frames["test"].loc[frames["test"]["language"].eq("cebuano")].reset_index(drop=True)
    (run / "evaluation-input.json").write_text(test[["text", "label"]].to_json(orient="records", force_ascii=False), encoding="utf-8")
    baseline_metrics = score(baseline, test)
    before = challenge_results(baseline)
    print(f"Staging {len(additions)} authored training-only rows: {additions['label'].value_counts().to_dict()}", flush=True)
    print(f"Run directory: {run}", flush=True)
    metadata = train_candidate(frames, models_dir, baseline_artifact["metadata"])
    candidate = joblib.load(models_dir / "sentiment_cebuano.joblib")["pipeline"]
    after = challenge_results(candidate)
    after_metrics = score(candidate, test)
    before_correct = sum(r["correct"] for r in before)
    after_correct = sum(r["correct"] for r in after)
    critical = {EXACT_REPORT, "gwapo", "ka gwapo jud aning jobert oy", "kaila man ko ani niya oh", "guba na kaayo", "Nagpataka ka og pasangil."}
    gates = {
        "reported_comment_positive": next(r for r in after if r["text"] == EXACT_REPORT)["predicted"] == "positive",
        "critical_regressions_pass": all(r["correct"] for r in after if r["text"] in critical),
        "challenge_improved": after_correct > before_correct,
        "test_macro_f1_not_degraded": after_metrics["macro_f1"] >= baseline_metrics["macro_f1"] - 0.005,
        "negative_recall_not_degraded": after_metrics["per_label"]["negative"]["recall"] >= baseline_metrics["per_label"]["negative"]["recall"] - 0.02,
        "positive_recall_not_degraded": after_metrics["per_label"]["positive"]["recall"] >= baseline_metrics["per_label"]["positive"]["recall"] - 0.02,
    }
    report = dict(run_directory=str(run), provenance="Locally authored contrastive examples; no Gemini, no model-generated labels.",
                  additions=len(additions), additions_by_label=additions["label"].value_counts().to_dict(),
                  unchanged_holdout_sha256=holdout_hashes, baseline_test=baseline_metrics, candidate_test=after_metrics,
                  challenge_note="Targeted regression checks, not an independent generalization benchmark.",
                  challenge_before_correct=before_correct, challenge_after_correct=after_correct,
                  challenge_total=len(CHALLENGE), before=before, after=after, gates=gates, eligible=all(gates.values()), metadata=metadata)
    (run / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"baseline_test_macro_f1": baseline_metrics["macro_f1"], "candidate_test_macro_f1": after_metrics["macro_f1"],
                      "challenge_before": before_correct, "challenge_after": after_correct, "challenge_total": len(CHALLENGE), "gates": gates,
                      "eligible": report["eligible"], "report": str(run / "report.json")}, indent=2), flush=True)


if __name__ == "__main__":
    main()
