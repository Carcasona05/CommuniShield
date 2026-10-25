"""Absolute, held-out quality admission. Never scores a built-in model.

Validation selects support thresholds; the untouched test split confirms them.
These checks qualify a candidate, not a claim of improved combined-system quality.
"""
import itertools
import math
import numpy as np
from supporting_routing import LABELS, probabilities

LANGUAGES = ('cebuano', 'english', 'filipino')
POLICY = {'minimum_macro_f1': 0.6, 'minimum_class_precision': 0.5,
          'minimum_class_recall': 0.5, 'minimum_class_support': 10,
          'minimum_accepted_precision': 0.75, 'minimum_validation_accepted': 20,
          'minimum_test_accepted': 10}


def metrics(y, predicted):
    classes = {}
    for i, label in enumerate(LABELS):
        support = int((y == i).sum())
        count = int((predicted == i).sum())
        tp = int(((y == i) & (predicted == i)).sum())
        classes[label] = {'support': support, 'precision': tp / count if count else 0,
                          'recall': tp / support if support else 0,
                          'f1': 2 * tp / (support + count) if support + count else 0}
    return {'macro_f1': sum(c['f1'] for c in classes.values()) / 3, 'per_class': classes}


def quality_reasons(value):
    reasons = []
    if value['macro_f1'] < POLICY['minimum_macro_f1']:
        reasons.append('Macro-F1 below 0.60')
    for label, c in value['per_class'].items():
        if c['support'] < POLICY['minimum_class_support']:
            reasons.append(f'{label}: fewer than 10 held-out examples')
        if c['precision'] < POLICY['minimum_class_precision']:
            reasons.append(f'{label}: precision below 0.50')
        if c['recall'] < POLICY['minimum_class_recall']:
            reasons.append(f'{label}: recall below 0.50')
    return reasons


def accepted(scores, y, confidence, margin):
    ordered = np.sort(scores, axis=1)
    mask = (ordered[:, -1] >= confidence) & (ordered[:, -1] - ordered[:, -2] >= margin)
    count = int(mask.sum())
    return {'support': count, 'precision': float((scores[mask].argmax(axis=1) == y[mask]).mean()) if count else 0}


def precision_lower_bound(precision, support, z=1.96):
    """Wilson 95% lower bound: validation selection only, not a new test gate."""
    if support <= 0:
        return 0.0
    scale = z * z / support
    return (precision + scale / 2 - z * math.sqrt(precision * (1 - precision) / support + scale / (4 * support))) / (1 + scale)


def calibrate(scores, y):
    choices = []
    for confidence, margin in itertools.product((0.5, 0.6, 0.7, 0.8), (0.05, 0.1, 0.2)):
        check = accepted(scores, y, confidence, margin)
        if check['support'] >= 20 and precision_lower_bound(check['precision'], check['support']) >= 0.75:
            choices.append((check['support'], check['precision'], confidence, margin))
    if not choices:
        return None
    # Prefer evidence breadth, then observed precision; test labels never select.
    count, precision, confidence, margin = max(choices)
    return {'primary_confidence': 0.85, 'primary_margin': 0.2,
            'support_confidence': confidence, 'support_margin': margin,
            'validation_precision': precision, 'validation_support': count,
            'validation_precision_lower_bound': precision_lower_bound(precision, count),
            'selection_policy': 'validation-wilson-95-v1'}


def evaluate(splits, candidate, builtin_hashes, selected_languages=None, training_failures=None):
    scoped = selected_languages is not None
    requested = sorted(set(selected_languages)) if scoped else list(LANGUAGES)
    if not requested or any(l not in LANGUAGES for l in requested):
        raise ValueError('Invalid training language scope')
    training_failures = training_failures or {}
    languages, rules, checks, reasons = {}, {}, {}, []
    for language in requested:
        if language in training_failures:
            check = {'passed': False, 'reasons': ['No fitted candidate met validation quality requirements.'], 'failure_stage': 'validation_selection'}
            checks[language] = check
            reasons.append(f'{language}: {check["reasons"][0]}')
            continue
        arrays = {}
        for split in ('validation', 'test'):
            rows = [r for r in splits[split] if r['language'] == language]
            y = np.array([LABELS.index(r['label']) for r in rows])
            p = probabilities(candidate / f'sentiment_{language}.onnx', [r['text'] for r in rows])
            if p.shape != (len(rows), 3) or not np.isfinite(p).all() or (p < 0).any() or (p > 1).any() or (np.abs(p.sum(axis=1) - 1) > 0.01).any():
                raise ValueError('Candidate probabilities are not valid three-class distributions')
            arrays[split] = (p, y)
        val, test = arrays['validation'], arrays['test']
        validation = metrics(val[1], val[0].argmax(axis=1))
        result = metrics(test[1], test[0].argmax(axis=1))
        languages[language] = {'candidate': result, 'validation': validation}
        language_reasons = [f'Validation: {r}' for r in quality_reasons(validation)]
        language_reasons += [f'Test: {r}' for r in quality_reasons(result)]
        rule = calibrate(*val)
        check = {'passed': False, 'metrics': result, 'validation_metrics': validation,
                 'support': 0, 'precision': 0, 'test_acceptance_evaluated': bool(rule)}
        if rule:
            check['validation_acceptance'] = {'support': rule['validation_support'], 'precision': rule['validation_precision']}
            check['selected_thresholds'] = {'confidence': rule['support_confidence'], 'margin': rule['support_margin']}
            check.update(accepted(*test, rule['support_confidence'], rule['support_margin']))
            if check['support'] < 10:
                language_reasons.append('Fewer than 10 accepted test predictions')
            if check['precision'] < 0.75:
                language_reasons.append('Accepted test precision below 0.75')
        else:
            language_reasons.append('No validation threshold meets 20 accepted predictions with a 95% precision lower bound of 0.75')
        check['reasons'] = language_reasons
        check['passed'] = not language_reasons
        checks[language] = check
        if check['passed']:
            rules[language] = rule
        reasons.extend(f'{language}: {r}' for r in language_reasons)
    # Every shipped language must meet absolute quality; routing can qualify a
    # subset, but no failed candidate is published or silently enabled.
    passed = bool(rules) if scoped else not reasons
    policy = {'version': 2, 'admission': 'independent-v1', 'passed': passed,
              'languages': rules, 'builtin_hashes': builtin_hashes, 'evaluated_pool_ids': [],
              'independent_test': {'passed': passed, 'languages': checks}, 'thresholds': POLICY,
              'note': 'Independent held-out quality; no claim of improvement over the built-in or the combined system.'}
    if scoped:
        policy['scope_version'] = 1
        policy['requested_languages'] = requested
    return {'passed': passed, 'admission': 'independent-v1', 'reasons': reasons,
            'languages': languages, 'policy': POLICY, 'routing_policy': policy,
            **({'requested_languages': requested, 'qualified_languages': sorted(rules), 'partial_pass': passed and bool(reasons)} if scoped else {})}
