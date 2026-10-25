/** Pure, validation-policy-driven cascade. Scores are NOT calibrated certainty. */
export const SUPPORT_LABELS = ["negative", "neutral", "positive"] as const;
export type SupportLabel = typeof SUPPORT_LABELS[number];
export type Scores = Record<SupportLabel, number>;
export type RoutingRule = {
  primary_confidence: number; primary_margin: number;
  support_confidence: number; support_margin: number;
  validation_precision: number; validation_support: number;
};
export type PoolPolicy = { version: 1 | 2; scope_version?: number; requested_languages?: string[]; admission?: string; passed: boolean; builtin_hashes: Record<string, string>; languages: Record<string, RoutingRule>; evaluated_pool_ids: string[]; cascade_test?: { passed: boolean }; independent_test?: { passed: boolean; languages: Record<string, IndependentCheck> } };
type IndependentMetrics = { macro_f1: number; per_class: Record<string, { precision: number; recall: number; support: number }> };
type IndependentCheck = { passed: boolean; metrics: IndependentMetrics; validation_metrics: IndependentMetrics; precision: number; support: number };
export type SupportProposal = { id: string; version: string; scores: Scores; rule: RoutingRule; independent?: boolean };

export function validIndependentPolicy(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const p = raw as PoolPolicy;
  const supported = ['cebuano','english','filipino'];
  const qualified = p.languages && typeof p.languages === 'object' ? Object.keys(p.languages) : [];
  const scoped = p.scope_version === 1;
  if (p.scope_version !== undefined && !scoped) return false;
  if (scoped && (!Array.isArray(p.requested_languages) || !p.requested_languages.length || p.requested_languages.length > 3 ||
    new Set(p.requested_languages).size !== p.requested_languages.length || p.requested_languages.some(l => !supported.includes(l)) ||
    qualified.some(l => !p.requested_languages!.includes(l)))) return false;
  const quality = (m: IndependentMetrics | undefined) => !!m && Number.isFinite(m.macro_f1) && m.macro_f1 >= 0.6 && m.macro_f1 <= 1 &&
    SUPPORT_LABELS.every((label) => {
      const c = m.per_class?.[label];
      return !!c && Number.isInteger(c.support) && c.support >= 10 && [c.precision, c.recall].every((v) => Number.isFinite(v) && v >= 0.5 && v <= 1);
    });
  return p.version === 2 && p.admission === "independent-v1" && p.passed === true &&
    Array.isArray(p.evaluated_pool_ids) && p.evaluated_pool_ids.length === 0 &&
    p.independent_test?.passed === true && qualified.length >= 1 && qualified.length <= 3 && (scoped || qualified.length === 3) &&
    qualified.every((language) => {
      if (!supported.includes(language)) return false;
      const r = p.languages[language], check = p.independent_test?.languages?.[language];
      return validRule(r) && r.primary_confidence === 0.85 && r.primary_margin === 0.2 && r.support_confidence >= 0.5 && r.support_margin >= 0.05 &&
        !!check && check.passed === true && quality(check.metrics) && quality(check.validation_metrics) &&
        Number.isInteger(check.support) && check.support >= 10 && Number.isFinite(check.precision) && check.precision >= 0.75 && check.precision <= 1;
    });
}

export function ranked(scores: Scores) {
  const entries = SUPPORT_LABELS.map((label) => ({ label, score: scores[label] })).sort((a, b) => b.score - a.score);
  if (entries.some(({ score }) => !Number.isFinite(score) || score < 0 || score > 1) ||
      Math.abs(entries.reduce((sum, item) => sum + item.score, 0) - 1) > 0.01) throw new Error("Invalid model probabilities");
  return { ...entries[0]!, margin: entries[0]!.score - entries[1]!.score };
}

export function validRule(raw: unknown): raw is RoutingRule {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as RoutingRule;
  return [r.primary_confidence, r.primary_margin, r.support_confidence, r.support_margin, r.validation_precision]
    .every((value) => Number.isFinite(value) && value >= 0 && value <= 1) &&
    Number.isInteger(r.validation_support) && r.validation_support >= 20 && r.validation_precision >= 0.75;
}

export const needsSupport = (scores: Scores, rule: RoutingRule) => {
  const primary = ranked(scores);
  return primary.score < rule.primary_confidence || primary.margin < rule.primary_margin;
};

export function routeSupportingModels(primary: Scores, proposals: SupportProposal[]) {
  const base = ranked(primary);
  const eligible = proposals.filter((p) => validRule(p.rule) && needsSupport(primary, p.rule));
  if (!eligible.length) return { label: base.label, confidence: base.score, origin: "builtin", reason: "builtin_retained", ids: [] as string[] };
  const accepted = eligible.filter((p) => {
    const value = ranked(p.scores);
    return value.score >= p.rule.support_confidence && value.margin >= p.rule.support_margin;
  });
  if (!accepted.length) return { label: "unclear" as const, confidence: 0, origin: "unclear", reason: "no_reliable_support", ids: eligible.map((p) => p.id) };
  const labels = new Set(accepted.map((p) => ranked(p.scores).label));
  if (labels.size !== 1) return { label: "unclear" as const, confidence: 0, origin: "unclear", reason: "support_disagreement", ids: accepted.map((p) => p.id) };
  if (accepted.some((p) => p.independent && ranked(p.scores).label !== base.label)) {
    return { label: "unclear" as const, confidence: 0, origin: "unclear", reason: "primary_support_disagreement", ids: accepted.map((p) => p.id) };
  }
  // Agreeing proposals are ranked by observed validation precision, not by
  // averaging unrelated raw probabilities or counting votes.
  accepted.sort((a, b) => b.rule.validation_precision - a.rule.validation_precision || a.id.localeCompare(b.id));
  const best = accepted[0]!;
  return { label: ranked(best.scores).label, confidence: ranked(best.scores).score,
    origin: "supporting", reason: "validated_support", ids: accepted.map((p) => p.id) };
}
