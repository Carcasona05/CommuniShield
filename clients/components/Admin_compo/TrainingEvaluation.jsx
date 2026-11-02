import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Disclosure } from "./SentimentUi";
import { evaluationLanguages, gateValue } from "../../services/trainingEvaluation";

const colors = { passed: "#16794B", failed: "#B93838", missing: "#946212", skipped: '#64748B' };
const names = { passed: "Passed", failed: "Failed", missing: "Not recorded", skipped:'Not included' };
const backgrounds = { passed: "#EAF6EF", failed: "#FDEEEE", missing: "#FFF4DE", skipped:'#EEF2F6' };
const icons = { passed: "checkmark-circle-outline", failed: "close-circle-outline", missing: "help-circle-outline", skipped:'remove-circle-outline' };

function ResultPill({ status, label }) {
  return <View style={[s.pill, { backgroundColor: backgrounds[status] }]}>
    <Ionicons name={icons[status]} size={14} color={colors[status]} />
    <Text style={[s.result, { color: colors[status] }]}>{label || names[status]}</Text>
  </View>;
}

function GateRow({ row }) {
  return <View style={[s.check, row.status === "failed" && s.failedRow]}>
    <View style={s.checkTitle}><Ionicons name={icons[row.status]} size={17} color={colors[row.status]} /><Text style={s.checkName}>{row.label}</Text></View>
    <View style={s.measurements}>
      <Text style={s.note}>Minimum: {row.minimum == null ? "Not recorded" : `≥ ${gateValue(row.minimum, row.count)}`}</Text>
      <Text style={s.observed}>Observed: {gateValue(row.value, row.count, row.minimum)}</Text>
      <ResultPill status={row.status} />
    </View>
  </View>;
}

function simpleReason(row) {
  const check = row.label.replace(/^(Validation|Test): /, "");
  if (check === "accepted-prediction precision") return "Too many accepted predictions were wrong.";
  if (check === "accepted predictions") return "Not enough predictions met the confidence requirements.";
  if (check === "macro-F1") return "The overall sentiment score is below the required minimum.";
  const [label, measure] = check.split(" ");
  if (measure === "precision") return `Too many predictions labelled ${label} were wrong.`;
  if (measure === "recall") return `The model missed too many ${label} examples.`;
  return `Not enough ${label} examples were available for evaluation.`;
}

export default function TrainingEvaluation({ metrics }) {
  if (metrics?.admission !== "independent-v1") return <View style={s.panel}>
    <Text style={s.heading}>Legacy evaluation</Text>
    <Text style={s.note}>This run used a different evaluation policy. Its macro-F1 scores alone do not show independent eligibility.</Text>
    {Object.entries(metrics?.languages || {}).map(([language, result]) => <Text key={language} style={s.note}>{language}: test macro-F1 {gateValue(result.candidate?.macro_f1)}</Text>)}
  </View>;
  const languages = evaluationLanguages(metrics);
  const partial = metrics.partial_pass === true && metrics.passed === true && metrics.qualified_languages?.length > 0;
  const failed = metrics.passed === false || languages.some((l) => l.status === "failed");
  const complete = metrics.passed === true && languages.every((l) => ['passed','skipped'].includes(l.status));
  const status = partial ? 'missing' : failed ? "failed" : complete ? "passed" : "missing";
  const priority = { failed: 0, missing: 1, passed: 2, skipped:3 };
  const orderedLanguages = [...languages].sort((a, b) => priority[a.status] - priority[b.status]);
  return <View style={s.panel} testID="training-quality-checks">
    <View style={[s.banner, { backgroundColor: backgrounds[status] }]}>
      <Ionicons name={icons[status]} size={23} color={colors[status]} />
      <View style={s.flex}><Text style={[s.heading, { color: colors[status] }]}>{partial ? 'Some languages are ready for review' : failed ? "Not ready to enable" : complete ? "Ready for admin review" : "Some results are missing"}</Text>
        <Text style={s.note}>{partial ? `Only ${metrics.qualified_languages.join(', ')} passed and can be enabled. Failed and unincluded languages keep using their built-ins.` : failed ? "Training finished, but some quality checks failed. The built-in model is unchanged." : complete ? "Quality checks passed for the included languages. A super-admin can review and enable them." : "There is not enough recorded evidence to confirm that all checks passed."}</Text></View>
    </View>
    <Text style={s.heading}>{partial ? 'Results by language' : failed ? "Why it failed" : "Results by language"}</Text>
    {orderedLanguages.map((language) => {
      const grouped = new Map();
      for (const row of language.failed) {
        const reason = simpleReason(row);
        grouped.set(reason, [...(grouped.get(reason) || []), row]);
      }
      return <View key={language.language} style={s.language} testID={`quality-language-${language.language}`}>
        <View style={s.languageHeading}><Text style={s.languageName}>{language.language}</Text><ResultPill status={language.status} label={language.status === 'skipped' ? 'Not included' : language.status === "failed" ? "Needs improvement" : language.status === "passed" ? "Passed" : "Missing results"} /></View>
        {language.status === 'skipped' ? <Text style={s.note}>Not trained in this run. The built-in continues serving this language.</Text> : null}
        {[...grouped].map(([reason, rows]) => <View key={reason} style={s.simpleFailure}><Text style={s.checkName}>{reason}</Text>{rows.map((row) => <View key={row.id} style={s.evidence}><Text style={s.note}>{row.id.startsWith("Test-") ? "Final test" : "Validation check"}</Text><View style={s.measurements}><Text style={s.observed}>Result: {gateValue(row.value, row.count, row.minimum)}</Text><Text style={s.note}>Required: {row.minimum == null ? "Not recorded" : `≥ ${gateValue(row.minimum, row.count)}`}</Text></View></View>)}</View>)}
        {language.status === "failed" && !language.failed.length ? <Text style={s.note}>{language.reasons[0] || "A required check did not pass. See detailed scores for the recorded explanation."}</Text> : null}
        {language.missing.length ? <Text style={s.note}>Some measurements were not recorded. They are not counted as passes.</Text> : null}
      </View>;
    })}
    {failed ? <Text style={s.note}>Next step: inspect the mistakes and add reviewed examples for the affected languages and labels before training again. Passing the overall score alone is not enough.</Text> : null}
    <Disclosure title="See detailed scores">
      <Text style={s.note}>Macro-F1 is an overall sentiment score, not accuracy or confidence. Precision measures how often a predicted label was correct; recall measures how many examples of that label were found. Accepted predictions meet the model’s confidence and margin requirements. All required checks must pass.</Text>
      {orderedLanguages.filter(l => l.status !== 'skipped').map((language) => <Disclosure key={language.language} title={`${language.language}: all quality checks (${language.rows.length})`}>
        {["Validation", "Test"].map((split) => <View key={split} style={s.checkGroup}><Text style={s.groupTitle}>{split} checks</Text>{language.rows.filter((row) => row.id.startsWith(`${split}-`)).map((row) => <GateRow key={row.id} row={row} />)}</View>)}
        {language.reasons.map((reason, i) => <Text key={i} style={s.reason}>{reason}</Text>)}
      </Disclosure>)}
      {Array.isArray(metrics.reasons) ? metrics.reasons.map((reason, i) => <Text key={i} style={s.reason}>{reason}</Text>) : null}
    </Disclosure>
  </View>;
}

const s = StyleSheet.create({
  panel: { gap: 12 }, flex: { flex: 1, minWidth: 0, gap: 4 },
  banner: { padding: 14, borderRadius: 10, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  heading: { fontSize: 13, lineHeight: 21, fontFamily: "PoppinsSemiBold", color: "#294880" },
  note: { fontSize: 11, lineHeight: 18, fontFamily: "PoppinsRegular", color: "#64748B", flexShrink: 1 },
  language: { borderWidth: 1, borderColor: "#E2EAF3", borderRadius: 10, padding: 12, gap: 10, backgroundColor: "#FFFFFF" },
  languageHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  languageName: { fontSize: 13, fontFamily: "PoppinsSemiBold", color: "#294880", textTransform: "capitalize" },
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 20 },
  simpleFailure: { paddingTop: 9, borderTopWidth: 1, borderTopColor: "#EDF1F6", gap: 6 },
  evidence: { gap: 3, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: "#F1C6C1" },
  checkGroup: { gap: 2 },
  groupTitle: { fontFamily: "PoppinsMedium", fontSize: 11, color: "#294880", paddingVertical: 8 },
  check: { padding: 10, gap: 7, borderBottomWidth: 1, borderBottomColor: "#EDF1F6", backgroundColor: "#FFFFFF", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" },
  failedRow: { borderBottomColor: "#F9E9E6" },
  checkTitle: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1, minWidth: 165 },
  checkName: { fontSize: 11, lineHeight: 18, fontFamily: "PoppinsMedium", color: "#334155", flexShrink: 1 },
  measurements: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, maxWidth: "100%" },
  observed: { fontSize: 11, lineHeight: 18, fontFamily: "PoppinsMedium", color: "#334155", flexShrink: 1 },
  result: { fontSize: 11, fontFamily: "PoppinsMedium", flexShrink: 1 },
  reason: { fontSize: 11, lineHeight: 18, fontFamily: "PoppinsRegular", color: "#B93838" },
});
