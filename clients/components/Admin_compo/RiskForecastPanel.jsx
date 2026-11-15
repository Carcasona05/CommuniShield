import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import useRetainedApiQuery from "../../hooks/useRetainedApiQuery";
import QueryErrorNotice from "../QueryErrorNotice";
import { validRiskForecastResponse, formatForecastDate } from "../../services/riskForecast";

function Metric({ label, value, primary = false }) {
  return <View style={[styles.metricItem, primary && styles.primaryMetric]} accessibilityLabel={`${label}: ${value}`}>
    <Text style={[styles.value, primary && styles.primaryValue]}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>;
}

export default function RiskForecastPanel({ scope = "All Barangays" }) {
  const { data, loading, refreshing, errorMessage, reload } = useRetainedApiQuery({
    endpoint: "/admin/risk-outlook",
    params: scope === "All Barangays" ? {} : { barangay: scope },
    validate: response => validRiskForecastResponse(response, scope),
  });
  const forecast = validRiskForecastResponse(data, scope) ? data.forecast : null;
  const number = value => Number.isFinite(value) ? Math.round(value).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";
  return (
    <View style={styles.panel} testID="risk-forecast-panel">
      <View style={styles.header}>
        <View style={styles.heading}>
          <Ionicons name="trending-up-outline" size={15} color="#294880" />
          <Text accessibilityRole="header" style={styles.title}>Experimental Forecast</Text>
        </View>
        <Text numberOfLines={1} style={styles.scope}>{scope}</Text>
      </View>
      {loading ? <Text style={styles.note}>Loading forecast…</Text> : forecast?.status === "available" ? <>
        <Text style={styles.period}>{formatForecastDate(forecast.targetStartDate)} – {formatForecastDate(forecast.targetEndDate)} · UTC</Text>
        <View style={styles.metricRow} testID="forecast-expected-container">
              <Metric primary label="Expected · next 7 days" value={number(forecast.expectedReports)} />
              <Metric label="Daily average estimate" value={`About ${number(forecast.expectedReports / 7)}`} />
              <Metric label="Reports · past 7 days" value={number(forecast.recentReports?.count)} />
        </View>
      </> : <View style={styles.empty}>
        <Text style={styles.label}>{forecast?.status === "insufficient_data" ? "Insufficient data for a forecast" : "Forecast unavailable"}</Text>
        {(forecast?.reasons?.length ? forecast.reasons : ["No usable estimate is available for this barangay scope."]).map((reason, index) => <Text key={index} style={styles.note}>{reason}</Text>)}
        <Text style={styles.note}>No estimate does not mean zero incidents or that the area is safe.</Text>
      </View>}
      <QueryErrorNotice message={errorMessage || data?.snapshot?.error} onRetry={reload} refreshing={refreshing} hasData={Boolean(forecast)} />
      <View style={styles.warningRow}>
        <Ionicons name="information-circle-outline" size={14} color="#94713A" />
        <Text style={styles.warning}>Do not rely on this forecast alone—incidents cannot be predicted with certainty. This feature helps admins plan ahead based on past reports.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 7 },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 10, rowGap: 3 },
  heading: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontFamily: "PoppinsSemiBold", fontSize: 12, color: "#294880" },
  scope: { fontFamily: "PoppinsMedium", fontSize: 10, color: "#64748B", flexShrink: 1 },
  period: { fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 15, color: "#7A889D" },
  note: { fontFamily: "PoppinsRegular", fontSize: 11, lineHeight: 16, color: "#64748B" },
  metricRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricItem: { flex: 1, minWidth: 72, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 9, backgroundColor: "#F8FAFC", gap: 3 },
  primaryMetric: { backgroundColor: "#EFF4FC", borderColor: "#D5E1F2" },
  value: { fontFamily: "PoppinsSemiBold", fontSize: 19, lineHeight: 27, color: "#40516F" },
  primaryValue: { color: "#294880" },
  metricLabel: { fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 14, color: "#64748B" },
  label: { fontFamily: "PoppinsMedium", fontSize: 11, color: "#40516F" },
  warningRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, paddingTop: 2 },
  warning: { flex: 1, fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 15, color: "#8B754F" },
  empty: { gap: 5 },
});
