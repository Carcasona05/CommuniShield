import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { sentimentDistribution } from "../../services/sentimentDistribution";

export default function SentimentDistributionCard({ summary }) {
  const model = sentimentDistribution(summary);
  return <View style={s.card} testID="sentiment-distribution-card">
    <View style={s.header}><View style={s.icon}><Ionicons name="bar-chart-outline" size={21} color="#294880" /></View>
      <View style={s.flex}><Text style={s.title}>Sentiment distribution</Text><Text style={s.note}>Reports & comments combined</Text></View></View>
    <View style={s.summary}><Text style={s.total}>{model.usable.toLocaleString()}</Text><Text style={s.summaryLabel}>usable sentiment results</Text></View>
    <Text style={s.note}>Percentages use only positive, neutral, negative{model.rows.some(row => row.key === "mixed") ? " and mixed" : ""} results. Unclear and no-data results are excluded.</Text>
    {!model.usable ? <Text style={s.empty}>No usable sentiment results yet.</Text> : null}
    <View style={s.rows}>{model.rows.map(row => <View key={row.key} style={s.row}>
      <View style={s.rowHeading}><View style={s.labelGroup}><View style={[s.dot, { backgroundColor: row.color }]} /><Text style={s.label}>{row.title}</Text></View>
        <Text style={s.value}>{row.count.toLocaleString()}<Text style={s.percent}> · {row.percent.toFixed(1)}%</Text></Text></View>
      <View accessibilityRole="progressbar" accessibilityLabel={`${row.title} sentiment`} accessibilityValue={{ min: 0, max: 100, now: row.percent, text: `${row.count} results, ${row.percent.toFixed(1)} percent` }} style={s.track}>
        <View style={[s.fill, { width: `${row.percent}%`, backgroundColor: row.color }]} /></View>
    </View>)}</View>
    <View style={s.coverage}><View style={s.rowHeading}><Text style={s.coverageTitle}>Analysis coverage</Text><Text style={s.note}>{model.total.toLocaleString()} total subjects</Text></View>
      <Text style={s.note}>Separate from sentiment percentages. Unclear does not mean neutral.</Text>
      <View style={s.chips}>{model.coverage.map(item => <View key={item.label} style={s.chip}><Text style={s.chipLabel}>{item.label}</Text><Text style={s.chipCount}>{item.count.toLocaleString()}</Text></View>)}</View>
    </View>
  </View>;
}
const s = StyleSheet.create({
  card: { marginTop: 20, borderWidth: 1, borderColor: "#D5E0EF", borderRadius: 16, padding: 18, gap: 12, backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "center", gap: 12 }, flex: { flex: 1, minWidth: 0 },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#EDF3FC", justifyContent: "center", alignItems: "center" },
  title: { fontFamily: "PoppinsSemiBold", fontSize: 16, color: "#203B66" },
  note: { fontFamily: "PoppinsRegular", fontSize: 11, lineHeight: 18, color: "#596B82" },
  summary: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 8 },
  total: { fontFamily: "PoppinsSemiBold", fontSize: 30, color: "#203B66" }, summaryLabel: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#52647C" },
  rows: { gap: 18, paddingVertical: 6 }, row: { gap: 8 },
  rowHeading: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 },
  labelGroup: { flexDirection: "row", gap: 8, alignItems: "center" }, dot: { width: 9, height: 9, borderRadius: 5 },
  label: { fontFamily: "PoppinsMedium", fontSize: 13, color: "#334155" },
  value: { fontFamily: "PoppinsSemiBold", fontSize: 13, color: "#203B66" }, percent: { color: "#52647C", fontFamily: "PoppinsRegular" },
  track: { height: 10, backgroundColor: "#EDF1F6", borderRadius: 6, overflow: "hidden" }, fill: { height: "100%", borderRadius: 6 },
  coverage: { borderTopWidth: 1, borderTopColor: "#E2E8F0", paddingTop: 16, gap: 10 },
  coverageTitle: { fontFamily: "PoppinsSemiBold", fontSize: 13, color: "#334155" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { backgroundColor: "#F4F7FB", borderRadius: 9, borderWidth: 1, borderColor: "#DFE6F0", paddingHorizontal: 12, paddingVertical: 9, gap: 5, flexGrow: 1, minWidth: 95 },
  chipLabel: { fontFamily: "PoppinsRegular", fontSize: 11, color: "#52647C" }, chipCount: { fontFamily: "PoppinsSemiBold", fontSize: 17, color: "#334155" },
  empty: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#64748B", paddingVertical: 6 },
});
