"""Bounded aggregate diagnostics, never training texts or admission overrides."""
import math

LABELS = ('negative', 'neutral', 'positive')


def failures(metrics):
    reasons = []
    if metrics['macro_f1'] < .6:
        reasons.append('Validation: Macro-F1 below 0.60')
    for label in LABELS:
        values = metrics['per_class'][label]
        if values['support'] < 10:
            reasons.append(f'Validation: {label}: fewer than 10 held-out examples')
        for field in ('precision', 'recall'):
            if values[field] < .5:
                reasons.append(f'Validation: {label}: {field} below 0.50')
    return reasons


def observe(trial, metrics, offsets=None):
    item = {'metrics': metrics, 'failures': failures(metrics)}
    if offsets is not None:
        item['offsets'] = offsets
    trial['settings_evaluated'] = trial.get('settings_evaluated', 0) + 1
    trial['eligible_settings'] = trial.get('eligible_settings', 0) + int(not item['failures'])
    previous = trial.get('representative')
    # Diagnostic only: fewest failed gates, then highest F1, then smallest bias.
    rank = lambda row: (-len(row['failures']), row['metrics']['macro_f1'],
                        -sum(abs(v) for v in row.get('offsets', {}).values()))
    if previous is None or rank(item) > rank(previous):
        trial['representative'] = item


def report(trials):
    representatives = [trial['representative'] for trial in trials if trial.get('representative')]
    best = max(representatives, key=lambda row: (-len(row['failures']), row['metrics']['macro_f1'])) if representatives else None
    return {'version': 1, 'split': 'validation', 'model_format': 'sklearn',
            'test_evaluated': False, 'trials': trials, 'representative': best}


def sanitize(value):
    """Whitelist numeric evidence at the worker boundary; regenerate public reasons."""
    def number(value, maximum=1):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= maximum

    def representative(value):
        if not isinstance(value, dict) or not isinstance(value.get('metrics'), dict):
            return None
        metrics = value['metrics']
        if not number(metrics.get('macro_f1')):
            return None
        classes = metrics.get('per_class')
        if not isinstance(classes, dict):
            return None
        clean = {'macro_f1': metrics['macro_f1'], 'per_class': {}}
        for label in LABELS:
            row = classes.get(label)
            if not isinstance(row, dict) or not all(number(row.get(field)) for field in ('precision', 'recall', 'f1')):
                return None
            if not number(row.get('support'), 10000000) or int(row['support']) != row['support']:
                return None
            clean['per_class'][label] = {field: row[field] for field in ('precision', 'recall', 'f1', 'support')}
        result = {'metrics': clean, 'failures': failures(clean)}
        offsets = value.get('offsets')
        if isinstance(offsets, dict) and all(isinstance(offsets.get(label), (int, float)) and
                not isinstance(offsets[label], bool) and math.isfinite(offsets[label]) and abs(offsets[label]) <= 10 for label in LABELS):
            result['offsets'] = {label: offsets[label] for label in LABELS}
        return result

    if not isinstance(value, dict) or value.get('version') != 1 or value.get('split') != 'validation':
        return None
    if not isinstance(value.get('trials'), list) or not 1 <= len(value['trials']) <= 32:
        return None
    trials = []
    for row in value['trials']:
        if not isinstance(row, dict):
            return None
        item = representative(row.get('representative'))
        if item is None:
            return None
        clean = {'representative': item}
        for field in ('settings_evaluated', 'eligible_settings'):
            if not number(row.get(field), 10000) or int(row[field]) != row[field]:
                return None
            clean[field] = row[field]
        if clean['eligible_settings'] > clean['settings_evaluated']:
            return None
        if number(row.get('c'), 100000):
            clean['c'] = row['c']
        if row.get('class_weight') in ('balanced', None):
            clean['class_weight'] = row.get('class_weight')
        if number(row.get('strength')):
            clean['strength'] = row['strength']
        trials.append(clean)
    return report(trials)
