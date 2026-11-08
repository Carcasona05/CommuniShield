// Display stored evidence only. This helper does not decide admission or alter gates.
const DEFAULTS = {
  minimum_macro_f1: 0.6, minimum_class_precision: 0.5, minimum_class_recall: 0.5,
  minimum_class_support: 10, minimum_accepted_precision: 0.75,
  minimum_validation_accepted: 20, minimum_test_accepted: 10,
};
const LABELS = ["negative", "neutral", "positive"];
const number = (value) => typeof value === "number" && Number.isFinite(value);

// Summary cards use the same stored evidence as the gates, without interpreting
// a rejected validation setting as a final test result or inventing old scores.
export function evaluationMetricSummaries(metrics, routingPolicy = metrics?.routing_policy) {
  const rate = value => number(value) && value >= 0 && value <= 1 ? value : null;
  const count = value => number(value) && Number.isInteger(value) && value >= 0 ? value : null;
  const checks = routingPolicy?.independent_test?.languages || {};
  const requested = Array.isArray(metrics?.requested_languages) ? metrics.requested_languages : [];
  const names = new Set([...Object.keys(metrics?.languages || {}), ...Object.keys(checks), ...requested,
    ...(typeof metrics?.failed_language === "string" ? [metrics.failed_language] : [])]);
  return [...names].filter(language => routingPolicy?.scope_version !== 1 || !requested.length || requested.includes(language))
    .sort().map(language => {
      const evidence = checks[language] || {};
      const stored = metrics?.languages?.[language] || {};
      const diagnostics = evidence.validation_diagnostics || metrics?.validation_diagnostics?.[language];
      const rejected = evidence.failure_stage === "validation_selection" ||
        (metrics?.failure_stage === "validation_selection" && metrics.failed_language === language);
      const test = !rejected && evidence.test_evaluated !== false ? stored.candidate || evidence.metrics : null;
      const validation = stored.validation || evidence.validation_metrics || diagnostics?.representative?.metrics;
      const result = test || validation;
      const split = test ? "Test" : validation ? "Validation" : null;
      const classes = result?.per_class || result?.per_label;
      return { language, split, diagnostic: !test && !!diagnostics,
        macroF1: rate(result?.macro_f1),
        labels: LABELS.map(label => ({ label,
          precision: rate(classes?.[label]?.precision),
          recall: rate(classes?.[label]?.recall),
          support: count(classes?.[label]?.support),
        })) };
    });
}

export function evaluationLanguages(metrics) {
  const thresholds = { ...DEFAULTS, ...metrics?.routing_policy?.thresholds, ...metrics?.policy };
  const checks = metrics?.routing_policy?.independent_test?.languages || {};
  const names = new Set(["cebuano", "english", "filipino", ...Object.keys(metrics?.languages || {}), ...Object.keys(checks)]);
  return [...names].map((language) => {
    if (metrics?.routing_policy?.scope_version === 1 && Array.isArray(metrics.requested_languages) && !metrics.requested_languages.includes(language)) {
      return {language,rows:[],failed:[],missing:[],reasons:[],status:'skipped'};
    }
    const evidence = checks[language];
    const scores = metrics?.languages?.[language];
    const rule = metrics?.routing_policy?.languages?.[language];
    const diagnostics = evidence?.validation_diagnostics;
    const validationRejected = evidence?.failure_stage === "validation_selection" && diagnostics?.version === 1;
    const rows = [];
    const add = (split, label, value, minimum, count = false) => {
      const recorded = number(value) && value >= 0 && (count ? Number.isInteger(value) : value <= 1) && number(minimum);
      rows.push({ id: `${split}-${label}`, label: `${split}: ${label}`, value: recorded ? value : null,
        minimum: number(minimum) ? minimum : null, count,
        status: !recorded ? "missing" : value >= minimum ? "passed" : "failed" });
    };
    for (const [split, result] of [["Validation", scores?.validation || evidence?.validation_metrics], ["Test", scores?.candidate || evidence?.metrics]]) {
      if (validationRejected && split === "Test") continue;
      add(split, "macro-F1", result?.macro_f1, thresholds.minimum_macro_f1);
      for (const label of LABELS) {
        const value = result?.per_class?.[label];
        add(split, `${label} precision`, value?.precision, thresholds.minimum_class_precision);
        add(split, `${label} recall`, value?.recall, thresholds.minimum_class_recall);
        add(split, `${label} examples`, value?.support, thresholds.minimum_class_support, true);
      }
      if (validationRejected) continue; // Acceptance/test checks were intentionally not run.
      const testSkipped = evidence?.test_acceptance_evaluated === false ||
        evidence?.reasons?.some?.((reason) => typeof reason === "string" && reason.startsWith("No validation threshold meets"));
      const acceptance = split === "Validation" ? evidence?.validation_acceptance ||
        (rule ? { precision: rule.validation_precision, support: rule.validation_support } : null) : testSkipped ? null : evidence;
      add(split, "accepted-prediction precision", acceptance?.precision, thresholds.minimum_accepted_precision);
      add(split, "accepted predictions", acceptance?.support,
        split === "Validation" ? thresholds.minimum_validation_accepted : thresholds.minimum_test_accepted, true);
    }
    const reasons = Array.isArray(evidence?.reasons) ? evidence.reasons.filter((r) => typeof r === "string") : [];
    const failed = rows.filter((row) => row.status === "failed");
    const missing = rows.filter((row) => row.status === "missing");
    return { language, rows, failed, missing, reasons, diagnostics: validationRejected ? diagnostics : null,
      status: evidence?.passed === false || failed.length || reasons.length ? "failed" :
        missing.length || evidence?.passed !== true ? "missing" : "passed" };
  });
}

export function gateValue(value, count = false, minimum = null) {
  if (!number(value)) return "Not recorded";
  if (count) return String(value);
  // Never display 75.0% beside a failed 75.0% minimum due to rounding.
  for (let decimals = 1; decimals <= 6; decimals++) {
    const actual = (value * 100).toFixed(decimals);
    if (!number(minimum) || value === minimum || actual !== (minimum * 100).toFixed(decimals)) return `${actual}%`;
  }
  return `${value < minimum ? "< " : "> "}${(minimum * 100).toFixed(6)}%`;
}
