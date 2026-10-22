import React from "react";
import { StyleSheet, Text, View } from "react-native";
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
          ? "Sentiment trend: insufficient data (needs 3 usable analyses in each 7-day period)"
          : `Negative report share: ${change >= 0 ? "+" : ""}${change.toFixed(1)} percentage points vs prior 7 days`}
      </Text>
    </View>
  );
}

const languageText = (values) => Object.entries(values || {})
  .filter(([, count]) => count > 0)
  .map(([language, count]) => `${language.charAt(0).toUpperCase()}${language.slice(1)} ${count}`)
  .join(" · ");

export default function SentimentEvidenceChart({ evidence, activityLabel = "active reports in scope" }) {
  if (!evidence) return <Text style={styles.empty}>Sentiment context unavailable</Text>;
  const { reports, comments, activity, policy } = evidence;
  return (
    <View style={styles.container} testID="sentiment-evidence-chart">
      <View style={styles.sourceHeader}>
        <Text style={styles.heading}>Report sentiment</Text>
        <Text style={styles.coverage} testID="sentiment-report-coverage">{reports.usable}/{reports.total} usable</Text>
      </View>
      <SentimentBar testID="sentiment-report-bar" source={reports} showCounts />
      {!!languageText(reports.languages) && <Text style={styles.detail}>{languageText(reports.languages)}</Text>}
      {reports.total > reports.usable && (
        <Text style={styles.muted}>{reports.total - reports.usable} analyses excluded (unavailable, low confidence, unknown language or outside window)</Text>
      )}

      <View style={styles.sourceHeader}>
        <Text style={styles.heading}>Comment sentiment</Text>
        <Text style={styles.coverage}>Report-balanced</Text>
      </View>
      <SentimentBar testID="sentiment-comment-bar" source={comments} />
      <Text style={styles.detail}>
        {comments.usable}/{comments.total} usable comments across {comments.reportsWithUsableComments} {comments.reportsWithUsableComments === 1 ? "report" : "reports"}
        {languageText(comments.languages) ? ` · ${languageText(comments.languages)}` : ""}
      </Text>
      {comments.total > comments.usable && (
        <Text style={styles.muted}>{comments.total - comments.usable} comment analyses excluded</Text>
      )}

      <View style={styles.sourceHeader}>
        <Text style={styles.heading}>Activity · {activityLabel}</Text>
      </View>
      <ActivityBars activity={activity} />

      <Text style={styles.note}>
        Successful analyses only · confidence ≥ {Math.round(policy.minimumConfidence * 100)}%. Each report’s comment discussion has equal weight. Bars describe tone, not danger or forecast probability.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  block: { gap: 6 },
  sourceHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 2 },
  heading: { fontFamily: "PoppinsSemiBold", fontSize: 11, color: "#294880" },
  coverage: { fontFamily: "PoppinsMedium", fontSize: 10, color: "#52667F", backgroundColor: "#EDF2F7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  barTrack: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: "#EDF2F7" },
  barSegment: { height: "100%" },
  barEmpty: { flex: 1, backgroundColor: "#E3E9F2" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: "PoppinsMedium", fontSize: 11, color: "#43536A" },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activityLabel: { width: 74, fontFamily: "PoppinsRegular", fontSize: 10, color: "#718096" },
  activityTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#EDF2F7", overflow: "hidden" },
  activityFill: { height: "100%", borderRadius: 4, backgroundColor: "#294880" },
  activityValue: { width: 30, textAlign: "right", fontFamily: "PoppinsSemiBold", fontSize: 11, color: "#294880" },
  trend: { fontFamily: "PoppinsMedium", fontSize: 10, lineHeight: 15, color: "#52667F" },
  detail: { fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 16, color: "#52667F" },
  muted: { fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 16, color: "#718096" },
  empty: { fontFamily: "PoppinsRegular", fontSize: 10, color: "#718096" },
  note: { fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 16, color: "#718096", marginTop: 2 },
});
