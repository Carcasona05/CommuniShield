import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { evaluationMetricSummaries, gateValue } from "../../services/trainingEvaluation";

export default function SentimentClassMetrics({ metrics, routingPolicy }) {
  return <View style={s.stack}>
    {evaluationMetricSummaries(metrics, routingPolicy).map((summary) => <View key={summary.language} style={s.card} testID={`class-metrics-${summary.language}`}>
      <View style={s.heading}><Text style={s.language}>{summary.language}</Text><Text style={s.split}>{summary.split ? `${summary.split} metrics` : "Scores unavailable"}</Text></View>
      {summary.diagnostic ? <Text style={s.note}>Closest rejected validation setting—not a qualified model. No final test evaluation was performed for this language.</Text> : null}
      {!summary.split ? <Text style={s.note}>Per-class scores were not recorded for this language. The failure summary cannot reconstruct them; a new run with the updated worker is needed.</Text> : null}
      <Text style={s.macro}>Macro-F1: {gateValue(summary.macroF1)}</Text>
      <View style={s.tableHeader}><Text style={[s.cell, s.labelCell, s.columnHeading]}>Sentiment</Text><Text style={[s.cell, s.columnHeading]}>Precision</Text><Text style={[s.cell, s.columnHeading]}>Recall</Text><Text style={[s.cell, s.columnHeading]}>Examples</Text></View>
      {summary.labels.map((values) => <View key={values.label} style={s.tableRow}>
        <Text style={[s.cell, s.labelCell, s.sentiment]}>{values.label}</Text>
        <Text style={[s.cell, s.value]}>{gateValue(values.precision)}</Text>
        <Text style={[s.cell, s.value]}>{gateValue(values.recall)}</Text>
        <Text style={[s.cell, s.value]}>{gateValue(values.support, true)}</Text>
      </View>)}
      {summary.split ? <Text style={s.note}>Example counts refer to the {summary.split.toLowerCase()} split, not the uploaded training rows.</Text> : null}
    </View>)}
  </View>;
}

const s = StyleSheet.create({
  stack: { gap: 14 },
  card: { padding: 12, gap: 10, borderRadius: 10, borderWidth: 1, borderColor: "#DCE4EF", backgroundColor: "#FFFFFF" },
  heading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  language: { fontSize: 15, lineHeight: 23, fontFamily: "PoppinsSemiBold", color: "#203B66", textTransform: "capitalize" },
  split: { fontSize: 12, lineHeight: 20, fontFamily: "PoppinsMedium", color: "#334155", backgroundColor: "#EDF2F8", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  note: { fontSize: 13, lineHeight: 21, fontFamily: "PoppinsRegular", color: "#475569" },
  macro: { fontSize: 14, lineHeight: 22, fontFamily: "PoppinsMedium", color: "#203B66" },
  tableHeader: { flexDirection: "row", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#CBD5E1" },
  tableRow: { flexDirection: "row", alignItems: "center", minHeight: 42, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#EDF1F7" },
  cell: { flex: 1, minWidth: 0, paddingHorizontal: 3, textAlign: "right", fontSize: 13, lineHeight: 21, color: "#334155" },
  labelCell: { flex: 1.2, textAlign: "left" },
  columnHeading: { fontFamily: "PoppinsMedium" },
  sentiment: { fontFamily: "PoppinsMedium", textTransform: "capitalize" },
  value: { fontFamily: "PoppinsSemiBold" },
});
