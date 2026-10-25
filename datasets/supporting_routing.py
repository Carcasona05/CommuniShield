"""Validation-selected cascade policies, independently accepted on fixed test data."""
import itertools
import numpy as np

LABELS = ("negative", "neutral", "positive")


def probabilities(path, texts):
    if not texts:
        return np.zeros((0, 3))
    import onnxruntime as ort
    options = ort.SessionOptions(); options.intra_op_num_threads = 2; options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])
    arrays = []
    for start in range(0, len(texts), 32):
        output = session.run(["probabilities"], {"text": np.array(texts[start:start + 32], dtype=object).reshape(-1, 1)})[0]
        if output.shape != (len(texts[start:start + 32]), 3) or not np.isfinite(output).all() or (output < 0).any() or (output > 1).any():
            raise ValueError("Invalid supporting probability output")
        arrays.append(output)
    return np.concatenate(arrays)


def describe(y, predicted):
    classes = {}
    for label in range(3):
        support = int((y == label).sum()); tp = int(((y == label) & (predicted == label)).sum())
        count = int((predicted == label).sum())
        recall = tp / support if support else 0
        precision = tp / count if count else 0
        classes[LABELS[label]] = {"recall": recall, "support": support, "f1": 2 * tp / (support + count) if support + count else 0}
    return {"macro_f1": sum(row["f1"] for row in classes.values()) / 3,
            "per_class": classes, "coverage": float((predicted >= 0).mean()) if len(predicted) else 0.0}


def cascade(primary, supports):
    """Mirror supportingModelRouting.ts: agreement, no votes/probability averaging."""
    best = primary.argmax(axis=1); confidence = primary.max(axis=1)
    ordered = np.sort(primary, axis=1); margin = ordered[:, -1] - ordered[:, -2]
    eligible_any = np.zeros(len(primary), dtype=bool)
    first = np.full(len(primary), -1); conflict = np.zeros(len(primary), dtype=bool)
    for scores, rule in supports:
        eligible = (confidence < rule["primary_confidence"]) | (margin < rule["primary_margin"])
        eligible_any |= eligible
        ordered_support = np.sort(scores, axis=1)
        accepted = eligible & (scores.max(axis=1) >= rule["support_confidence"]) & ((ordered_support[:, -1] - ordered_support[:, -2]) >= rule["support_margin"])
        label = scores.argmax(axis=1)
        conflict |= accepted & (first >= 0) & (first != label)
        first = np.where(accepted & (first < 0), label, first)
    result = np.where(eligible_any, first, best)
    result = np.where(conflict, -1, result)
    used = eligible_any & (result >= 0)
    return result, used


def acceptable(y, result, used, baseline, previous, minimum_support):
    metrics = describe(y, result)
    reasons = []
    if metrics["macro_f1"] < max(baseline["macro_f1"], previous["macro_f1"]) + 0.001: reasons.append("Cascade macro-F1 did not improve by 0.001")
    if metrics["coverage"] < 0.95: reasons.append("Cascade coverage below 0.95")
    for label in LABELS:
        if metrics["per_class"][label]["recall"] < max(baseline["per_class"][label]["recall"], previous["per_class"][label]["recall"]) - 0.01:
            reasons.append(f"Cascade {label} recall regressed")
    support = int(used.sum())
    precision = float((result[used] == y[used]).mean()) if support else 0
    if support < minimum_support: reasons.append("Too few accepted fallback examples")
    if precision < 0.75: reasons.append("Fallback precision below 0.75")
    return {"passed": not reasons, "reasons": reasons, "metrics": metrics, "support": support, "precision": precision}


def candidate_used(primary, support, rule, result):
    p = np.sort(primary, axis=1); s = np.sort(support, axis=1)
    return (((p[:, -1] < rule["primary_confidence"]) | (p[:, -1] - p[:, -2] < rule["primary_margin"])) &
            (s[:, -1] >= rule["support_confidence"]) & (s[:, -1] - s[:, -2] >= rule["support_margin"]) &
            (result >= 0) & (result == support.argmax(axis=1)))


def calibrate(primary, support, y, existing):
    baseline = describe(y, primary.argmax(axis=1))
    previous = describe(y, cascade(primary, existing)[0])
    best = None
    for pc, pm, sc, sm in itertools.product((0.45, 0.55, 0.65, 0.75, 0.85), (0.05, 0.1, 0.2), (0.5, 0.6, 0.7, 0.8), (0.05, 0.1, 0.2)):
        rule = {"primary_confidence": pc, "primary_margin": pm, "support_confidence": sc, "support_margin": sm}
        result, _ = cascade(primary, [*existing, (support, rule)])
        used = candidate_used(primary, support, rule, result)
        check = acceptable(y, result, used, baseline, previous, 20)
        if check["passed"] and (best is None or check["metrics"]["macro_f1"] > best["score"]):
            best = {"score": check["metrics"]["macro_f1"], "rule": {**rule,
                    "validation_precision": check["precision"], "validation_support": check["support"]}}
    return best["rule"] if best else None


def evaluate_pool(splits, baseline, candidate, existing, builtin_hashes):
    languages, details = {}, {}
    for language in ("cebuano", "english", "filipino"):
        arrays = {}
        for split in ("validation", "test"):
            rows = [row for row in splits[split] if row["language"] == language]
            texts = [row["text"] for row in rows]
            primary = probabilities(baseline / f"sentiment_{language}.onnx", texts)
            other = [(probabilities(path / f"sentiment_{language}.onnx", texts), policy["languages"][language])
                     for _, path, policy in existing if language in policy.get("languages", {})]
            arrays[split] = (primary, probabilities(candidate / f"sentiment_{language}.onnx", texts),
                             np.array([LABELS.index(row["label"]) for row in rows]), other)
        rule = calibrate(*arrays["validation"])
        if not rule:
            details[language] = {"passed": False, "reasons": ["No validation-verified fallback region"]}
            continue
        primary, support, y, other = arrays["test"]
        result, _ = cascade(primary, [*other, (support, rule)])
        used = candidate_used(primary, support, rule, result)
        check = acceptable(y, result, used, describe(y, primary.argmax(axis=1)), describe(y, cascade(primary, other)[0]), 10)
        details[language] = check
        if check["passed"]: languages[language] = rule
    return {"version": 1, "passed": bool(languages), "languages": languages, "builtin_hashes": builtin_hashes,
            "evaluated_pool_ids": sorted([id for id, _, _ in existing]), "cascade_test": {"passed": bool(languages), "languages": details},
            "note": "Thresholds selected on validation; raw probabilities are not calibrated certainty."}
