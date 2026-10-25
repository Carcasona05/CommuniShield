"""Read-only training/validation audit. Deliberately never opens test.csv.

Optional --candidate-dir must be a trusted local worker-owned joblib bundle.
Outputs are diagnostic review material, not automatically relabelled training data.
"""
import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from import_approved_sentiment import text_key

BASE = Path(__file__).resolve().parent
LABELS = ('negative', 'neutral', 'positive')


def read_rows(path):
    with path.open(encoding='utf-8', newline='') as handle:
        return list(csv.DictReader(handle))


def audit_rows(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[text_key(row)].append(row)
    conflicts = [group for group in grouped.values() if len({r['label'] for r in group}) > 1]
    languages = {}
    for language in sorted({r['language'] for r in rows}):
        selected = [r for r in rows if r['language'] == language]
        languages[language] = {
            'rows': len(selected), 'classes': dict(Counter(r['label'] for r in selected)),
            'single_word_classes': dict(Counter(r['label'] for r in selected if len(r['text'].split()) == 1)),
            'short_phrase_classes': dict(Counter(r['label'] for r in selected if 2 <= len(r['text'].split()) <= 4)),
        }
    return {'languages': languages, 'duplicate_keys': sum(len(g) > 1 for g in grouped.values()),
            'conflicting_keys': len(conflicts),
            'conflict_examples': [[{'text': r['text'], 'language': r['language'], 'label': r['label']} for r in g] for g in conflicts[:20]]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=BASE / 'processed')
    parser.add_argument('--candidate-dir', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    train = read_rows(args.data_dir / 'train.csv')
    validation = read_rows(args.data_dir / 'validation.csv')
    report = {'splits_read': ['train', 'validation'], 'test_read': False,
              'hashes': {split: hashlib.sha256((args.data_dir / f'{split}.csv').read_bytes()).hexdigest() for split in ('train','validation')},
              'train': audit_rows(train), 'validation': audit_rows(validation)}
    train_keys = {text_key(r) for r in train}
    report['train_validation_overlap_keys'] = len(train_keys & {text_key(r) for r in validation})
    raw_path = BASE / 'raw' / 'filipino_shopee_train.csv'
    if raw_path.is_file():
        raw = read_rows(raw_path)
        matched = [r for r in raw if text_key({'text':r['text'],'language':'filipino'}) in train_keys]
        report['filipino_raw_training_label_codes'] = dict(Counter(r['label'] for r in matched))
        processed = {text_key(r): r['label'] for r in train if r['language'] == 'filipino'}
        report['filipino_raw_code_to_processed_label_counts'] = dict(Counter(
            f"{r['label']} -> {processed[text_key({'text':r['text'],'language':'filipino'})]}" for r in matched))
        examples = [r['text'] for r in matched if r['label'] == '3']
        report['raw_code_3_training_examples_for_review_not_auto_relabelling'] = sorted(examples, key=lambda t: hashlib.sha256(t.encode()).hexdigest())[:12]
    errors = []
    if args.candidate_dir:
        import joblib
        import numpy as np
        from independent_support import metrics, calibrate, accepted
        report['validation_models'] = {}
        for language in ('cebuano', 'english', 'filipino'):
            selected = [r for r in validation if r['language'] == language]
            pipeline = joblib.load(args.candidate_dir / f'sentiment_{language}.joblib')['pipeline']
            classes = list(pipeline.classes_)
            probabilities = pipeline.predict_proba([r['text'] for r in selected])[:, [classes.index(l) for l in LABELS]]
            expected = np.array([LABELS.index(r['label']) for r in selected])
            predicted = probabilities.argmax(axis=1)
            rule = calibrate(probabilities, expected)
            report['validation_models'][language] = {
                'metrics': metrics(expected, predicted), 'selected_rule': rule,
                'accepted': accepted(probabilities, expected, rule['support_confidence'], rule['support_margin']) if rule else None,
                'confusion': [[int(((expected == i) & (predicted == j)).sum()) for j in range(3)] for i in range(3)],
                'labels': LABELS,
            }
            wrong = [i for i in range(len(selected)) if expected[i] != predicted[i]]
            for i in sorted(wrong, key=lambda i: -float(probabilities[i].max()))[:25]:
                errors.append({'language':language, 'text':selected[i]['text'], 'expected':LABELS[expected[i]],
                               'predicted':LABELS[predicted[i]], 'score':float(probabilities[i].max()),
                               'split':'validation', 'use':'diagnostic_only_not_for_training'})
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'audit.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    with (args.out / 'validation_errors_review.csv').open('w',encoding='utf-8',newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=['language','text','expected','predicted','score','split','use'])
        writer.writeheader(); writer.writerows(errors)
    print(json.dumps({k:v for k,v in report.items() if k not in ('raw_code_3_training_examples_for_review_not_auto_relabelling','validation_models')},indent=2,ensure_ascii=False))
    if 'validation_models' in report:
        print(json.dumps(report['validation_models'],indent=2))


if __name__ == '__main__':
    main()
