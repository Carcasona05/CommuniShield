import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import apiClient from "../services/apiClient";

const date = value => new Date(value).toLocaleString();
const MOBILE_FONT = Platform.select({ ios: "System", android: "sans-serif", default: "system-ui" });
export default function CredibilityAccessPanel({ onAccessChange }) {
  const [access, setAccess] = useState(null);
  const [error, setError] = useState("");
  const [showScoring, setShowScoring] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const { data } = await apiClient.get("/credibility/access", { cacheMode: "network" });
      if (request !== generation.current) return;
      setAccess(data); setError(""); onAccessChange?.(data);
    } catch (e) { if (e.code !== "ERR_CANCELED" && request === generation.current) setError(e.response?.data?.error || "Could not load account access. Please retry."); }
  }, [onAccessChange]);
  useFocusEffect(useCallback(() => { load(); return () => { generation.current++; }; }, [load]));
  useEffect(() => {
    if (!access?.suspended || !access.suspension?.endsAt) return;
    const remaining = new Date(access.suspension.endsAt).getTime() - Date.now();
    if (!Number.isFinite(remaining)) return;
    const timer = setTimeout(load, Math.max(1000, Math.min(60000, remaining)));
    return () => clearTimeout(timer);
  }, [access, load]);
  if (access?.exempt) return null;
  return (
    <View style={s.card} testID="credibility-access-panel">
      <View style={s.header}>
        <View style={s.headerIcon}><Ionicons name="key-outline" size={21} color="#294880" /></View>
        <View style={s.heading}>
          <Text style={s.title}>Your access</Text>
          <Text style={s.note}>{access?.unlimited && !access.suspended ? "Unlimited reports and comments" : "Your daily activity allowance"}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh account access" style={s.refresh} onPress={load}>
          <Ionicons name="refresh-outline" size={20} color="#294880" />
        </TouchableOpacity>
      </View>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {access ? <>
        <View style={s.statusRow}>
          <View style={[s.badge, access.suspended && s.suspendedBadge]}>
            <View style={[s.statusDot, access.suspended && s.suspendedDot]} />
            <Text style={[s.badgeText, access.suspended && s.suspendedText]}>{access.suspended ? "Suspended" : "Available access"}</Text>
          </View>
        </View>
        <View style={s.allowances}>
          <AllowanceRow label="Reports" limit={access.reportLimit} used={access.reportsUsed} unlimited={access.unlimited === true && !access.suspended} />
          <AllowanceRow label="Comments" limit={access.commentLimit} used={access.commentsUsed} unlimited={access.unlimited === true && !access.suspended} />
        </View>
        {!access.unlimited || access.suspended ? <View style={s.resetRow}><Ionicons name="time-outline" size={14} color="#7D899B" /><Text style={s.caption}>Resets at midnight · Philippine time</Text></View> : null}
        {access.suspended ? <View style={s.suspension} testID="timed-suspension-details">
          <View style={s.noticeHeading}><Ionicons name="pause-circle-outline" size={21} color="#A75B2B" /><Text style={s.suspensionTitle}>Temporary suspension</Text></View>
          <Text style={s.note}>Posting and commenting are paused. Browsing and safety information remain available.</Text>
          {access.suspension ? <>
            <Text style={s.suspensionTitle}>{access.suspension.durationDays}-day suspension · Occurrence {access.suspension.occurrence}</Text>
            <Text style={s.note}>Ends: {date(access.suspension.endsAt)}</Text>
            <Text style={s.note}>Reason: {access.suspension.reason}</Text>
          </> : <Text style={s.note}>Refresh to load your suspension end date.</Text>}
          <Text style={s.note}>Access returns automatically at expiry, with a score of at least 20. Daily limits still apply.</Text>
        </View> : access.commentLimit === 0 ? <View style={s.info}><Ionicons name="lock-closed-outline" size={16} color="#63748B" /><Text style={s.infoText}>Commenting unlocks at 40 points. Verified reports help rebuild your score.</Text></View> : null}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showScoring }} style={s.disclosure} onPress={() => setShowScoring(value => !value)}>
          <Ionicons name="information-circle-outline" size={18} color="#6A7B94" /><Text style={s.disclosureText}>How points work</Text><Ionicons name={showScoring ? "chevron-up" : "chevron-forward"} size={16} color="#8A97AA" />
        </TouchableOpacity>
        {showScoring ? <Text style={s.scoringNote}>Verified by an Admin or Super Admin: +15 once per report. Rejected: −10. Fake: −30. Submitting reports or images earns no points. Suspensions increase from 1 to 3, 7, 14, then 30 days; escalation resets after 90 suspension-free days.</Text> : null}
      </> : <Text style={s.note}>Loading account access…</Text>}
    </View>
  );
}

function AllowanceRow({ label, limit = 0, used = 0, unlimited = false }) {
  return <View accessible accessibilityLabel={unlimited ? `${label}: Unlimited` : `${label}: ${used} of ${limit} used today`} style={s.allowance}>
    <Text style={[s.amount, !unlimited && used >= limit && s.zeroAmount]}>{unlimited ? "∞" : `${used}/${limit}`}</Text>
    <Text style={s.activityLabel}>{label}</Text>
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", padding: 14, borderRadius: 22, marginTop: 12, gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  headerIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#EAF0FA", alignItems: "center", justifyContent: "center" },
  heading: { flex: 1, minWidth: 0 },
  title: { color: "#20385F", fontFamily: MOBILE_FONT, fontWeight: "600", fontSize: 16 },
  note: { color: "#64748B", fontFamily: MOBILE_FONT, fontSize: 12, lineHeight: 19 },
  caption: { color: "#7D899B", fontFamily: MOBILE_FONT, fontSize: 11, lineHeight: 17, flexShrink: 1 },
  refresh: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#F5F7FB" },
  statusRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, justifyContent: "space-between", paddingVertical: 6 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#EAF4EF" },
  badgeText: { color: "#267358", fontFamily: MOBILE_FONT, fontWeight: "500", fontSize: 12 },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#3A9572" },
  suspendedBadge: { backgroundColor: "#FFF0E6" },
  suspendedText: { color: "#A75B2B" },
  suspendedDot: { backgroundColor: "#B26B35" },
  allowances: { flexDirection: "row", gap: 12, paddingVertical: 6 },
  allowance: { flex: 1, minWidth: 0, alignItems: "center", gap: 4, paddingVertical: 12, borderRadius: 14, backgroundColor: "#F5F7FB" },
  activityLabel: { fontFamily: MOBILE_FONT, fontWeight: "500", fontSize: 14, color: "#334155" },
  amount: { color: "#294880", fontFamily: MOBILE_FONT, fontWeight: "600", fontSize: 22, lineHeight: 28 },
  zeroAmount: { color: "#8A97AA" },
  resetRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", paddingVertical: 6 },
  suspension: { borderRadius: 16, padding: 14, backgroundColor: "#FFF8F2", gap: 10, marginVertical: 4 },
  noticeHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  suspensionTitle: { fontFamily: MOBILE_FONT, fontWeight: "500", color: "#334155", fontSize: 14, lineHeight: 21, flexShrink: 1 },
  info: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, backgroundColor: "#F2F5FA" },
  infoText: { flex: 1, color: "#63748B", fontFamily: MOBILE_FONT, fontSize: 13, lineHeight: 20 },
  disclosure: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  disclosureText: { flex: 1, color: "#52657D", fontFamily: MOBILE_FONT, fontWeight: "500", fontSize: 13 },
  scoringNote: { color: "#64748B", fontFamily: MOBILE_FONT, fontSize: 13, lineHeight: 21, paddingHorizontal: 28, paddingBottom: 8 },
  error: { color: "#B42318", fontFamily: MOBILE_FONT, fontSize: 14, lineHeight: 21 },
});
