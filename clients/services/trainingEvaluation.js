// Display stored evidence only. This helper does not decide admission or alter gates.
const DEFAULTS = {
  minimum_macro_f1: 0.6, minimum_class_precision: 0.5, minimum_class_recall: 0.5,
  minimum_class_support: 10, minimum_accepted_precision: 0.75,
  minimum_validation_accepted: 20, minimum_test_accepted: 10,
};
const LABELS = ["negative", "neutral", "positive"];
const number = (value) => typeof value === "number" && Number.isFinite(value);

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
    const rows = [];
    const add = (split, label, value, minimum, count = false) => {
      const recorded = number(value) && value >= 0 && (count ? Number.isInteger(value) : value <= 1) && number(minimum);
      rows.push({ id: `${split}-${label}`, label: `${split}: ${label}`, value: recorded ? value : null,
        minimum: number(minimum) ? minimum : null, count,
        status: !recorded ? "missing" : value >= minimum ? "passed" : "failed" });
    };
    for (const [split, result] of [["Validation", scores?.validation || evidence?.validation_metrics], ["Test", scores?.candidate || evidence?.metrics]]) {
      add(split, "macro-F1", result?.macro_f1, thresholds.minimum_macro_f1);
      for (const label of LABELS) {
        const value = result?.per_class?.[label];
        add(split, `${label} precision`, value?.precision, thresholds.minimum_class_precision);
        add(split, `${label} recall`, value?.recall, thresholds.minimum_class_recall);
        add(split, `${label} examples`, value?.support, thresholds.minimum_class_support, true);
      }
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
    return { language, rows, failed, missing, reasons,
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
