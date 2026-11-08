"""Reserve genuinely new approved examples for historical-state validation.

Only a worker-owned snapshot is changed. Original train/validation/test files and
the recorded approved selection stay intact. Legacy weights may have learned the
original validation split, so it must not select updates or confidence rules.
"""
import csv
import hashlib
import json
from pathlib import Path

from import_approved_sentiment import text_key

LABELS = ('negative', 'neutral', 'positive')
COLUMNS = ['text', 'language', 'label', 'split']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(snapshot_dir, original_dir, languages):
    snapshot_dir, original_dir = Path(snapshot_dir).resolve(), Path(original_dir).resolve()
    if snapshot_dir == original_dir or snapshot_dir.is_relative_to(original_dir):
        raise ValueError('Continuation calibration requires an isolated worker snapshot')
    path = snapshot_dir / 'continuation_validation.json'
    if path.exists():
        raise ValueError('Continuation validation was already prepared; use a new snapshot')
    accepted = json.loads((snapshot_dir / 'approved_training_samples.json').read_text(encoding='utf-8'))
    original_keys = set()
    for split in ('train', 'validation', 'test'):
        with (original_dir / f'{split}.csv').open(encoding='utf-8-sig', newline='') as handle:
            original_keys.update(text_key(row) for row in csv.DictReader(handle))
    if any(text_key(row) in original_keys for row in accepted):
        raise ValueError('New continuation calibration examples overlap historical source data')
    if len({text_key(row) for row in accepted}) != len(accepted):
        raise ValueError('Continuation calibration requires unique approved examples')
    reserved, counts = [], {}
    for language in sorted(languages):
        counts[language] = {}
        for label in LABELS:
            group = [row for row in accepted if row['language'] == language and row['label'] == label]
            # At least ten per class held out, and at least one left for fitting.
            if len(group) < 11:
                raise ValueError(f'{language}: independent continued validation needs at least 11 new approved {label} examples. Add reviewed examples or use Train fresh candidate; historical validation cannot be reused.')
            group.sort(key=lambda row: hashlib.sha256(('continuation-validation-v1\0' + '\0'.join(text_key(row))).encode()).hexdigest())
            count = max(10, len(group) // 4)
            reserved.extend(group[:count]); counts[language][label] = count
    reserved_keys = {text_key(row) for row in reserved}
    with (snapshot_dir / 'train.csv').open(encoding='utf-8-sig', newline='') as handle:
        training = [row for row in csv.DictReader(handle) if text_key(row) not in reserved_keys]
    training_keys = {text_key(row) for row in training}
    if any(text_key(row) not in training_keys for row in accepted if text_key(row) not in reserved_keys):
        raise ValueError('Approved examples missing from the worker training snapshot')
    receipt = {'version': 1, 'source': 'new-approved-examples-only', 'selection': 'stratified-sha256-v1',
               'counts': counts, 'validation_samples': len(reserved),
               'training_additions': len(accepted) - len(reserved),
               'historical_validation_sha256': digest(original_dir / 'validation.csv'),
               'test_sha256': digest(snapshot_dir / 'test.csv')}
    for split, rows in [('train', training), ('validation', reserved)]:
        with (snapshot_dir / f'{split}.csv').open('w', encoding='utf-8', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=COLUMNS)
            writer.writeheader()
            writer.writerows({**row, 'split': split} for row in rows)
    (snapshot_dir / 'approved_training_samples.json').write_text(
        json.dumps([row for row in accepted if text_key(row) not in reserved_keys], ensure_ascii=False), encoding='utf-8')
    receipt['validation_sha256'] = digest(snapshot_dir / 'validation.csv')
    receipt['training_sha256'] = digest(snapshot_dir / 'train.csv')
    receipt['approved_training_sha256'] = digest(snapshot_dir / 'approved_training_samples.json')
    path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    return receipt


def verify(snapshot_dir, languages):
    """Refuse to calibrate legacy inherited weights on the original validation."""
    directory = Path(snapshot_dir)
    path = directory / 'continuation_validation.json'
    if not path.is_file():
        raise ValueError('Independent continuation validation is missing. Restart the updated worker; do not reuse historical validation or substitute test data.')
    receipt = json.loads(path.read_text(encoding='utf-8'))
    if receipt.get('version') != 1 or receipt.get('source') != 'new-approved-examples-only' or any(language not in receipt.get('counts', {}) for language in languages):
        raise ValueError('Invalid continuation validation provenance')
    if any(receipt.get(field) != digest(directory / name) for field, name in (
            ('validation_sha256', 'validation.csv'), ('test_sha256', 'test.csv'),
            ('training_sha256', 'train.csv'), ('approved_training_sha256', 'approved_training_samples.json'))):
        raise ValueError('Continuation evaluation split changed after reservation')
    return receipt
