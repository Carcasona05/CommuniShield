import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BatchFilterDropdown } from "./AdminBatchFilters";
import SentimentTrendChart from "./SentimentTrendChart";
import QueryErrorNotice from "../QueryErrorNotice";
import useRetainedApiQuery from "../../hooks/useRetainedApiQuery";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { DISTRIBUTION_PERIODS, philippineDay } from "../../services/sentimentDistribution";
import { sentimentOverviewMetrics, validSentimentOverview } from "../../services/sentimentOverview";

export default function SentimentOverviewCard() {
  const [period, setPeriod] = useState("today");
  const [day, setDay] = useState(philippineDay);
  useAutoRefresh(() => setDay(philippineDay()), 60000);
  const { data, loading, refreshing, errorMessage, reload } = useRetainedApiQuery({ endpoint: "/admin/sentiment-overview", params: { period, day },
    validate: value => validSentimentOverview(value, period) });
  const summary = data?.summary;
  const overview = sentimentOverviewMetrics(data?.trend);
  const metrics = summary ? [
    { label: "Reports & Comments", value: overview.total.toLocaleString(), hint: "Records in the selected period, excluding unclear results and aggregate tie labels", color: "#2E3F63", id: "overview-total" },
    { label: "AI Analyzed", value: overview.analyzed.toLocaleString(), hint: "Positive, neutral and negative results plotted in the graph", color: "#3DBB74", id: "overview-analyzed" },
    { label: "No Successful Result", value: overview.withoutResult.toLocaleString(), hint: "Pending, failed, unavailable or missing analysis; excludes unclear", color: "#E5A12F", id: "overview-without-result" },
    { label: "Positive Sentiment", value: overview.positiveShare === null ? "—" : `${overview.positiveShare.toFixed(1)}%`, hint: "Positive divided by positive, neutral and negative results", color: "#2F8DE4", id: "overview-positive-share" },
  ] : [];
  return <View testID="sentiment-overview-card">
    <View style={s.header}>
      <View style={s.heading}><Ionicons name="pulse" size={18} color="#294880" />
        <Text style={s.title}>Sentiment Analysis Overview</Text>
      </View>
      {!!summary && <Text style={s.coverage}>{overview.analyzed}/{overview.total} Analyzed</Text>}
      <BatchFilterDropdown label="Overview period" value={period} options={DISTRIBUTION_PERIODS} onChange={setPeriod} width={160}
        testID="sentiment-overview-period" menuTestID="sentiment-overview-period-menu" style={s.filter} menuStyle={s.menu} compact hideLabel />
    </View>
    <View style={s.body}>
      <QueryErrorNotice message={errorMessage || data?.snapshot?.error} onRetry={reload} refreshing={refreshing} hasData={Boolean(data)} />
      {loading ? <View style={s.loading} testID="sentiment-overview-loading"><Text style={s.note}>Loading overview…</Text>{[1, 2, 3].map(row => <View key={row} style={s.skeleton} />)}</View>
        : summary ? <>
          <View style={s.metrics} testID="sentiment-overview-metrics">{metrics.map((metric, index) => <React.Fragment key={metric.id}>
            {index > 0 && <View style={s.divider} />}
            <View style={s.metric} accessibilityLabel={`${metric.label}: ${metric.value}. ${metric.hint}`}>
              <Text style={s.metricLabel}>{metric.label}</Text>
              <Text testID={metric.id} style={[s.value, { color: metric.color }]}>{metric.value}</Text>
            </View>
          </React.Fragment>)}</View>
          <SentimentTrendChart key={period} trend={data.trend} />
        </> : null}
    </View>
  </View>;
}
const s = StyleSheet.create({
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: "#F7F9FD", borderBottomWidth: 1, borderBottomColor: "#D9E2F0", zIndex: 20 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  title: { fontFamily: "PoppinsSemiBold", color: "#294880", fontSize: 15, flexShrink: 1 }, note: { fontFamily: "PoppinsRegular", fontSize: 10, color: "#64748B", lineHeight: 16 },
  coverage: { fontSize: 12, color: "#5D6F92", fontFamily: "PoppinsMedium" },
  filter: { marginLeft: "auto", maxWidth: "100%" }, menu: { minWidth: 0, left: 0, right: 0, top: "100%", marginTop: 6 },
  body: { padding: 16, gap: 16 },
  metrics: { flexDirection: "row", alignItems: "center", backgroundColor: "#F4F7FC", borderWidth: 1, borderColor: "#E1E8F2", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  metric: { flex: 1, minWidth: 0, alignItems: "center" },
  metricLabel: { fontSize: 10, fontFamily: "PoppinsMedium", color: "#5D6F92", marginBottom: 2, textAlign: "center" },
  divider: { width: 1, height: 24, backgroundColor: "#D9E2F0" },
  value: { fontFamily: "PoppinsSemiBold", fontSize: 14 }, loading: { gap: 12 }, skeleton: { height: 62, borderRadius: 12, backgroundColor: "#EAF0F8" },
});
