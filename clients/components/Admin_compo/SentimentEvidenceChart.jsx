import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { sentimentSegments } from "../../services/sentimentChart";

function SentimentBar({ testID, source, showCounts }) {
  const segments = sentimentSegments(source);
  return (
    <View style={styles.block} testID={testID}>
      <View style={styles.barTrack}>
        {segments.length ? (
          segments.map((segment) => (
            <View
              key={segment.key}
              testID={`${testID}-segment-${segment.key}`}
              accessibilityLabel={`${segment.title}: ${Math.round(segment.share * 100)} percent`}
              style={[styles.barSegment, { backgroundColor: segment.color, width: `${segment.widthPercent}%` }]}
            />
          ))
        ) : (
          <View style={styles.barEmpty} />
        )}
      </View>
      {segments.length ? (
        <View style={styles.legend}>
          {segments.map((segment) => (
            <View key={segment.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: segment.color }]} />
              <Text style={styles.legendText}>
                {segment.title}{showCounts ? ` ${segment.count}` : ""} · {Math.round(segment.share * 100)}%
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No usable sentiment analysis</Text>
      )}
    </View>
  );
}

function ActivityBars({ activity }) {
  const recent = activity?.recent?.reports || 0;
  const previous = activity?.previous?.reports || 0;
  const scale = Math.max(recent, previous, 1);
  const change = activity?.negativeShareChangePoints;
  return (
    <View style={styles.block} testID="sentiment-activity-chart">
      {[{ label: "Last 7 days", value: recent }, { label: "Prior 7 days", value: previous }].map((row) => (
        <View key={row.label} style={styles.activityRow}>
          <Text style={styles.activityLabel}>{row.label}</Text>
          <View style={styles.activityTrack}>
            <View style={[styles.activityFill, { width: `${Math.round((row.value / scale) * 100)}%` }]} />
          </View>
          <Text style={styles.activityValue}>{row.value}</Text>
        </View>
      ))}
      <Text style={styles.trend}>
        {change == null
          ? "Not enough data for a sentiment trend"
          : `Negative report share: ${change >= 0 ? "+" : ""}${change.toFixed(1)} percentage points`}
      </Text>
    </View>
  );
}

const languageText = (values) => Object.entries(values || {})
  .filter(([, count]) => count > 0)
  .map(([language, count]) => `${language.charAt(0).toUpperCase()}${language.slice(1)} ${count}`)
  .join(" · ");

export default function SentimentEvidenceChart({ evidence, activityLabel = "active reports in scope" }) {
  const [showDetails, setShowDetails] = useState(false);
  if (!evidence) return <Text style={styles.empty}>Sentiment context unavailable</Text>;
  const { reports, comments, activity, policy } = evidence;
  return (
    <View style={styles.container} testID="sentiment-evidence-chart">
      <View style={styles.sourceHeader}>
        <Text style={styles.heading}>Reports</Text>
        <Text style={styles.coverage} testID="sentiment-report-coverage">{reports.usable} of {reports.total} analyzed</Text>
      </View>
      <SentimentBar testID="sentiment-report-bar" source={reports} showCounts />

      <View style={styles.sourceHeader}>
        <Text style={styles.heading}>Comments</Text>
        <Text style={styles.coverage}>{comments.usable} of {comments.total} analyzed</Text>
      </View>
      <SentimentBar testID="sentiment-comment-bar" source={comments} />
      <Text style={styles.detail}>
        {comments.reportsWithUsableComments} {comments.reportsWithUsableComments === 1 ? "report" : "reports"} · Equal weight per report
      </Text>

      <View style={styles.sourceHeader}>
        <Text style={styles.heading}>Report activity</Text>
      </View>
      <ActivityBars activity={activity} />

      <TouchableOpacity
        style={styles.detailsToggle}
        onPress={() => setShowDetails(value => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
      >
        <Text style={styles.detailsToggleText}>{showDetails ? "Hide analysis details −" : "Analysis details +"}</Text>
      </TouchableOpacity>
      {showDetails && <View style={styles.detailsPanel} testID="sentiment-analysis-details">
        <Text style={styles.detail}>Successful analyses only · confidence ≥ {Math.round(policy.minimumConfidence * 100)}%.</Text>
        <Text style={styles.detail}>Reports: {languageText(reports.languages) || "No language data"}</Text>
        <Text style={styles.detail}>Comments: {languageText(comments.languages) || "No language data"}</Text>
        <Text style={styles.detail}>Excluded: {reports.total - reports.usable} report analyses · {comments.total - comments.usable} comment analyses. Unavailable, low-confidence, unknown-language or out-of-window results are not charted.</Text>
        <Text style={styles.detail}>Comments are report-balanced: each report’s discussion has equal weight.</Text>
        <Text style={styles.detail}>Activity counts {activityLabel}. Trend compares negative report share with the prior 7 days; at least 3 usable analyses are needed in each period.</Text>
        <Text style={styles.detail}>Bars show tone, not danger or forecast probability.</Text>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 9 },
  block: { gap: 6 },
  sourceHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 6 },
  heading: { fontFamily: "PoppinsSemiBold", fontSize: 13, color: "#243B5A" },
  coverage: { fontFamily: "PoppinsMedium", fontSize: 11, color: "#354B68", backgroundColor: "#EDF2F7", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  barTrack: { flexDirection: "row", height: 16, borderRadius: 5, overflow: "hidden", backgroundColor: "#EDF2F7" },
  barSegment: { height: "100%" },
  barEmpty: { flex: 1, backgroundColor: "#E3E9F2" },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#334155" },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activityLabel: { width: 90, fontFamily: "PoppinsRegular", fontSize: 12, color: "#40516F" },
  activityTrack: { flex: 1, height: 10, borderRadius: 4, backgroundColor: "#EDF2F7", overflow: "hidden" },
  activityFill: { height: "100%", borderRadius: 4, backgroundColor: "#294880" },
  activityValue: { minWidth: 30, textAlign: "right", fontFamily: "PoppinsSemiBold", fontSize: 13, color: "#294880" },
  trend: { fontFamily: "PoppinsMedium", fontSize: 12, lineHeight: 18, color: "#40516F" },
  detail: { fontFamily: "PoppinsRegular", fontSize: 12, lineHeight: 19, color: "#40516F" },
  empty: { fontFamily: "PoppinsRegular", fontSize: 12, color: "#52627A" },
  detailsToggle: { alignSelf: "flex-start", minHeight: 36, justifyContent: "center", paddingHorizontal: 2 },
  detailsToggleText: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#294880" },
  detailsPanel: { borderTopWidth: 1, borderTopColor: "#DFE6F0", paddingTop: 10, gap: 7 },
});
