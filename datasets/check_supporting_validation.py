"""Validate a trusted candidate on validation only, including exported ONNX parity.

Never opens test.csv. A passing report is not test admission or deployment.
"""
import argparse
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np

from audit_supporting_training import read_rows
from independent_support import LABELS, LANGUAGES, metrics, quality_reasons, calibrate
from supporting_routing import probabilities


def check(data_dir, candidate):
    rows = read_rows(data_dir / 'validation.csv')
    languages = {}
    for language in LANGUAGES:
        selected = [r for r in rows if r['language'] == language]
        texts = [r['text'] for r in selected]
        expected = np.array([LABELS.index(r['label']) for r in selected])
        scores = probabilities(candidate / f'sentiment_{language}.onnx', texts)
        saved = joblib.load(candidate / f'sentiment_{language}.joblib')
        pipeline = saved['pipeline']
        sklearn_scores = pipeline.predict_proba(texts)[:, [list(pipeline.classes_).index(l) for l in LABELS]]
        parity_error = float(np.max(np.abs(scores - sklearn_scores)))
        result = metrics(expected, scores.argmax(axis=1))
        reasons = quality_reasons(result)
        rule = calibrate(scores, expected)
        if not rule:
            reasons.append('No robust validation acceptance threshold')
        if parity_error > 1e-4 or not np.array_equal(scores.argmax(axis=1), sklearn_scores.argmax(axis=1)):
            reasons.append('Exported ONNX and fitted classifier disagree')
        languages[language] = {'passed': not reasons, 'reasons': reasons, 'metrics': result,
                               'rule': rule, 'onnx_max_probability_difference': parity_error,
                               'fit_selection': saved['metadata'].get('calibration'),
                               'class_weight': saved['metadata'].get('class_weight')}
    return {'validation_passed': all(v['passed'] for v in languages.values()), 'test_read': False,
            'languages': languages,
            'validation_sha256': hashlib.sha256((data_dir / 'validation.csv').read_bytes()).hexdigest(),
            'candidate_hashes': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(candidate.glob('sentiment_*.onnx'))},
            'note': 'Validation development report only. No claim of passing untouched test or improving the combined system.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, required=True)
    parser.add_argument('--candidate-dir', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    report = check(args.data_dir, args.candidate_dir)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
