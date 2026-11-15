import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { reportCommentDisplay } from "../../services/reportCommentDisplay";

export default function ReportCommentCard({ comment }) {
  const { name, initial, body, sentiment } = reportCommentDisplay(comment);
  return (
    <View style={styles.card} testID="report-detail-comment">
      <View style={styles.header}>
        <View style={styles.author}>
          <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={styles.initial}>{initial}</Text>
          </View>
          <Text style={styles.username} selectable>{name}</Text>
        </View>
        <View style={[styles.sentimentBadge, { backgroundColor: sentiment.background }]} accessibilityLabel={`Sentiment: ${sentiment.label}`}>
          <View style={[styles.dot, { backgroundColor: sentiment.color }]} />
          <Text style={[styles.sentimentText, { color: sentiment.color }]}>{sentiment.label}</Text>
        </View>
      </View>
      <Text style={styles.body} selectable>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, marginTop: 9, gap: 10, borderWidth: 1, borderColor: "#DFE6F0", borderRadius: 11, backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  author: { flex: 1, minWidth: 100, flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#EAF0FA", alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: "PoppinsSemiBold", fontSize: 13, color: "#294880" },
  username: { flex: 1, fontFamily: "PoppinsSemiBold", fontSize: 13, lineHeight: 20, color: "#243B5A" },
  sentimentBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  sentimentText: { fontFamily: "PoppinsMedium", fontSize: 12, lineHeight: 18 },
  body: { fontFamily: "PoppinsRegular", fontSize: 13, lineHeight: 21, color: "#334155" },
});
