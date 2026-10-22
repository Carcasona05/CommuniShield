import React from "react";
import { StyleSheet, Text, View } from "react-native";

const LABELS = [
  { key: "negative", title: "Negative", color: "#A63D40", background: "#FFF0F0" },
  { key: "neutral", title: "Neutral", color: "#52667F", background: "#EDF2F7" },
  { key: "positive", title: "Positive", color: "#21764D", background: "#EAF8F1" },
  { key: "mixed", title: "Mixed", color: "#7555A2", background: "#F3EEFA" },
  { key: "unclear", title: "Unclear", color: "#866B35", background: "#FCF6E7" },
];
const percentage = (value) => value == null ? "—" : `${Math.round(value * 100)}%`;
const languageText = (values) => Object.entries(values || {})
  .filter(([, count]) => count > 0)
  .map(([language, count]) => `${language.charAt(0).toUpperCase()}${language.slice(1)} ${count}`)
  .join(" · ") || "No usable language analyses";

function Distribution({ source, balanced = false }) {
  if (!source.usable) return <Text style={styles.empty}>No usable sentiment analysis</Text>;
  return (
    <View style={styles.distribution}>
      {LABELS.filter(({ key }) => key === "negative" || key === "neutral" || key === "positive" || source.counts[key] > 0).map((label) => (
        <View key={label.key} style={[styles.pill, { backgroundColor: label.background }]}>
          <Text style={[styles.pillText, { color: label.color }]}>
            {label.title} {balanced ? percentage(source.shares[label.key]) : `${source.counts[label.key]} (${percentage(source.shares[label.key])})`}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function HotspotSentimentSummary({ evidence, showVerification = true, activityLabel = "current cluster members" }) {
  if (!evidence) return <Text style={styles.empty}>Sentiment context unavailable</Text>;
  const { reports, comments, verification, activity } = evidence;
  const change = activity.negativeShareChangePoints;
  return (
    <View style={styles.container} testID="hotspot-sentiment-summary">
      <View style={styles.source} testID="hotspot-report-sentiment">
        <View style={styles.headingRow}>
          <Text style={styles.heading}>Report sentiment</Text>
          <Text style={styles.coverage}>{reports.usable}/{reports.total} usable</Text>
        </View>
        <Distribution source={reports} />
        <Text style={styles.detail}>{languageText(reports.languages)}</Text>
        {reports.total > reports.usable && <Text style={styles.muted}>{reports.total - reports.usable} excluded analyses (unavailable, low confidence, unknown language or outside window)</Text>}
      </View>

      <View style={styles.source} testID="hotspot-comment-sentiment">
        <View style={styles.headingRow}>
          <Text style={styles.heading}>Comment sentiment</Text>
          <Text style={styles.coverage}>Report-balanced</Text>
        </View>
        <Distribution source={comments} balanced />
        <Text style={styles.detail}>{comments.usable}/{comments.total} usable comments across {comments.reportsWithUsableComments} {comments.reportsWithUsableComments === 1 ? "report" : "reports"}</Text>
        <Text style={styles.detail}>{languageText(comments.languages)}</Text>
        <Text style={styles.muted}>Each report’s comment discussion has equal weight.</Text>
        {comments.total > comments.usable && <Text style={styles.muted}>{comments.total - comments.usable} comment analyses excluded</Text>}
      </View>

      {showVerification && (
        <View style={styles.source} testID="hotspot-verification-context">
          <Text style={styles.heading}>Verification</Text>
          <Text style={styles.detail}>{verification.verified} verified · {verification.pendingReview} pending review · {verification.underVerification} under verification{verification.other ? ` · ${verification.other} other` : ""}</Text>
        </View>
      )}

      <View style={styles.source} testID="hotspot-activity-context">
        <Text style={styles.heading}>Recent activity · {activityLabel}</Text>
        {activity.comparableWindow ? (
          <>
            <Text style={styles.detail}>Last 7 days: {activity.recent.reports} reports · Prior 7 days: {activity.previous.reports}</Text>
            <Text style={styles.detail}>
              {change == null ? "Sentiment trend: insufficient data (needs 3 usable reports in each period)" : `Negative report share: ${change >= 0 ? "+" : ""}${change.toFixed(1)} percentage points`}
            </Text>
          </>
        ) : <Text style={styles.muted}>Trend unavailable: select at least 14 days or Any date.</Text>}
      </View>
      <Text style={styles.note}>Successful analyses only · confidence ≥ {Math.round(evidence.policy.minimumConfidence * 100)}%. Sentiment describes tone, not danger or forecast probability.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E2E8F0", gap: 12 },
  source: { gap: 5 },
  headingRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 4 },
  heading: { fontFamily: "PoppinsSemiBold", fontSize: 11, color: "#294880" },
  coverage: { fontFamily: "PoppinsMedium", fontSize: 10, color: "#52667F" },
  distribution: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  pill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  pillText: { fontFamily: "PoppinsMedium", fontSize: 10 },
  detail: { fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 16, color: "#52667F" },
  muted: { fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 16, color: "#718096" },
  empty: { fontFamily: "PoppinsRegular", fontSize: 10, color: "#718096", marginTop: 4 },
  note: { fontFamily: "PoppinsRegular", fontSize: 10, lineHeight: 16, color: "#718096" },
});
