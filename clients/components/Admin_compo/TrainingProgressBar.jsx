import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { trainingProgress } from "../../services/trainingProgress";

export default function TrainingProgressBar({ job, now }) {
  const progress = trainingProgress(job, now);
  const color = progress.stopped ? "#B23831" : progress.disconnected ? "#8A5A12" : progress.percent === 100 ? "#16754C" : "#285CA0";
  return <View style={[s.card, progress.stopped && s.stopped, progress.disconnected && s.disconnected]} testID="training-work-progress">
    <View style={s.heading}><Text style={s.caption}>COMPLETED WORK</Text>
      <Text style={[s.percent, { color }]}>{progress.percent === null ? "—" : `${progress.percent}%`}</Text></View>
    <View accessibilityRole="progressbar" accessibilityLabel="Training completed work"
      accessibilityValue={{ min: 0, max: 100, ...(progress.percent === null ? {} : { now: progress.percent }), text: progress.label }}
      style={s.track}>
      {progress.percent !== null ? <View style={[s.fill, { width: `${progress.percent}%`, backgroundColor: color }]} /> : null}
    </View>
    <View style={s.statusRow}>
      {progress.percent === null && !progress.stopped && !progress.disconnected ? <ActivityIndicator size="small" color={color} /> : null}
      <Text style={[s.label, { color }]}>{progress.label}{progress.language ? ` · ${progress.language}` : ""}</Text>
    </View>
    <Text style={s.note}>{progress.percent === 100 ? "Run completed. This is not an accuracy score and does not enable the model."
      : progress.stopped ? "Progress is frozen at the last completed step. No model is automatically enabled."
      : progress.disconnected ? "The worker or its connection may be offline. Showing last reported work, not confirmed ongoing training. A valid heartbeat can restore the connection status."
      : "Based on completed steps, not time remaining. A fitting step may take several minutes."}</Text>
    {progress.updatedAt ? <Text style={s.timestamp}>Worker update · {new Date(progress.updatedAt).toLocaleTimeString()}</Text> : null}
    {progress.lastHeartbeatAt ? <Text style={s.timestamp}>Last heartbeat · {new Date(progress.lastHeartbeatAt).toLocaleTimeString()}</Text> : null}
  </View>;
}

const s = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, backgroundColor: "#F0F5FD", borderWidth: 1, borderColor: "#C5D6EE", gap: 10 },
  stopped: { backgroundColor: "#FFF5F2", borderColor: "#E5B3AA" },
  disconnected: { backgroundColor: "#FFF8EA", borderColor: "#DDC58C" },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  caption: { fontFamily: "PoppinsSemiBold", fontSize: 10, letterSpacing: 1, color: "#425877" },
  percent: { fontFamily: "PoppinsSemiBold", fontSize: 30 },
  track: { height: 12, backgroundColor: "#DBE4F0", borderRadius: 8, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontFamily: "PoppinsSemiBold", fontSize: 12, flexShrink: 1, textTransform: "none" },
  note: { fontFamily: "PoppinsRegular", fontSize: 11, lineHeight: 18, color: "#475B75" },
  timestamp: { fontFamily: "PoppinsRegular", fontSize: 10, color: "#5B6F88" },
});
