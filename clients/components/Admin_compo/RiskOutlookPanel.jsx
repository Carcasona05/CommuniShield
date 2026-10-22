import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function RiskOutlookPanel({ forecast, scope, loading }) {
  const available = !loading && forecast?.status === "available";
  return (
    <View style={styles.panel} testID="seven-day-outlook">
      <View style={styles.header}>
        <Ionicons name="calendar-outline" size={20} color="#294880" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>7-day report-volume outlook</Text>
          <Text style={styles.body}>{scope || "All Barangays"} · next 7 full UTC days</Text>
        </View>
      </View>
      {!available ? (
        <View style={styles.empty} testID="outlook-insufficient">
          <Text style={styles.subtitle}>{loading ? "Updating outlook..." : forecast?.status === "unavailable" || !forecast ? "Outlook unavailable" : "Insufficient data for a forecast"}</Text>
          {!loading && (forecast?.reasons || ["A complete historical dataset is required before an estimate can be shown."]).map((reason) => <Text key={reason} style={styles.body}>• {reason}</Text>)}
          {!loading && forecast?.stats && <Text style={styles.body}>Available: {forecast.stats.historyDays} complete days · {forecast.stats.reports} historical submissions · {forecast.stats.reportingDays} reporting days</Text>}
        </View>
      ) : (
        <>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.overline}>EXPECTED SUBMISSIONS</Text>
              <Text style={styles.value} testID="outlook-expected">{forecast.expectedReports}</Text>
              <Text style={styles.body}>{forecast.targetStartDate} to {forecast.targetEndDate} (UTC)</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.overline}>HISTORICAL-ERROR RANGE</Text>
              <Text style={styles.value}>{forecast.range.lower}–{forecast.range.upper}</Text>
              <Text style={styles.body}>Not a calibrated confidence interval</Text>
            </View>
          </View>
          <Text style={styles.body}>Method: {forecast.method === "recent_weekday" ? "Recent weekday pattern" : "Historical average baseline"}. Baseline estimate: {forecast.baselineExpectedReports} submissions.</Text>
          <Text style={styles.body}>Past rolling mean absolute error: {forecast.evaluation.selectedMae} reports/week · baseline: {forecast.evaluation.baselineMae} · {forecast.evaluation.folds} earlier test weeks.</Text>
          <View style={styles.days}>
            {forecast.daily.map((day) => <View key={day.date} style={styles.day} testID="risk-outlook-day"><Text style={styles.body}>{day.date}</Text><Text style={styles.subtitle}>{day.expectedReports}</Text></View>)}
          </View>
        </>
      )}
      <Text style={styles.note}>Estimates concern submitted reports, including unverified and resolved records—not crime probability. Archived/rejected/fake records are excluded. Days without recorded submissions count as zero submissions, not proof of safety. Sentiment does not increase the forecast.</Text>
      <Text style={styles.note}>Synthetic evaluation demonstrates pipeline behaviour only; real-world forecast accuracy and policing effectiveness are not established.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 18, gap: 12, borderRadius: 14, borderWidth: 1, borderColor: "#D9E2F0", backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontFamily: "PoppinsSemiBold", fontSize: 16, color: "#294880" },
  subtitle: { fontFamily: "PoppinsSemiBold", fontSize: 12, color: "#294880" },
  body: { fontFamily: "PoppinsRegular", fontSize: 11, lineHeight: 18, color: "#52667F" },
  note: { fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 16, color: "#718096" },
  overline: { fontFamily: "PoppinsSemiBold", fontSize: 10, color: "#52667F" },
  value: { fontFamily: "PoppinsSemiBold", fontSize: 28, color: "#294880" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { flex: 1, minWidth: 210, padding: 14, borderRadius: 10, backgroundColor: "#F5F8FC", gap: 4 },
  empty: { padding: 14, gap: 6, backgroundColor: "#F5F8FC", borderRadius: 10 },
  days: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  day: { padding: 10, minWidth: 100, flex: 1, gap: 4, backgroundColor: "#F5F8FC", borderRadius: 8 },
});
