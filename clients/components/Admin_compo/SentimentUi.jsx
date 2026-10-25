import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const STATUS = {
  pending: { label: "Pending review", color: "#946212", background: "#FFF4DF" },
  approved: { label: "Approved", color: "#16794B", background: "#E9F7EF" },
  rejected: { label: "Rejected", color: "#B93838", background: "#FDEEEE" },
  archived: { label: "Archived", color: "#64748B", background: "#EEF2F6" },
  queued: { label: "Queued", color: "#946212", background: "#FFF4DF" },
  training: { label: "Training", color: "#294880", background: "#EAF0FD" },
  evaluating: { label: "Evaluating", color: "#7353A3", background: "#F2EDFC" },
  ready: { label: "Ready to activate", color: "#16794B", background: "#E9F7EF" },
  active: { label: "Active", color: "#16794B", background: "#E9F7EF" },
  failed: { label: "Failed", color: "#B93838", background: "#FDEEEE" },
  outdated: { label: "Outdated", color: "#64748B", background: "#EEF2F6" },
  positive: { label: "Positive", color: "#16794B", background: "#E9F7EF" },
  neutral: { label: "Neutral", color: "#294880", background: "#EAF0FD" },
  negative: { label: "Negative", color: "#B93838", background: "#FDEEEE" },
  valid: { label: "Valid", color: "#16794B", background: "#E9F7EF" },
  invalid: { label: "Invalid", color: "#B93838", background: "#FDEEEE" },
  conflict: { label: "Conflicting label", color: "#B93838", background: "#FDEEEE" },
  duplicate: { label: "Duplicate", color: "#64748B", background: "#EEF2F6" },
};

export function StatusBadge({ status, label }) {
  const theme = STATUS[status] || STATUS.archived;
  return <View style={[styles.badge, { backgroundColor: theme.background }]}>
    <View style={[styles.dot, { backgroundColor: theme.color }]} />
    <Text style={[styles.badgeText, { color: theme.color }]}>{label || theme.label}</Text>
  </View>;
}

export function SectionTabs({ options, value, onChange, disabled }) {
  return <View style={styles.tabs} accessibilityRole="tablist">
    {options.map((option) => <Pressable key={option.key} accessibilityRole="tab" accessibilityLabel={option.label} aria-selected={value === option.key} accessibilityState={{ selected: value === option.key, disabled }} disabled={disabled} onPress={() => onChange(option.key)} style={[styles.tab, value === option.key && styles.tabActive]}>
      {option.icon ? <Ionicons name={option.icon} size={16} color={value === option.key ? "#294880" : "#78869D"} /> : null}
      <Text numberOfLines={1} style={[styles.tabText, value === option.key && styles.tabTextActive]}>{option.label}</Text>
    </Pressable>)}
  </View>;
}

export function Disclosure({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return <View style={styles.disclosure}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.disclosureTrigger}>
      <Text style={styles.disclosureTitle}>{title}</Text>
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color="#718096" />
    </Pressable>
    {open ? <View style={styles.disclosureBody}>{children}</View> : null}
  </View>;
}

export function EmptyState({ icon = "folder-open-outline", title, message }) {
  return <View style={styles.empty}>
    <View style={styles.emptyIcon}><Ionicons name={icon} size={25} color="#7C90B2" /></View>
    <Text style={styles.emptyTitle}>{title}</Text>
    {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontFamily: "PoppinsMedium", fontSize: 10 },
  tabs: { flexDirection: "row", gap: 3, backgroundColor: "#F0F3F8", padding: 4, borderRadius: 11 },
  tab: { flex: 1, minWidth: 0, minHeight: 39, flexDirection: "row", gap: 6, paddingHorizontal: 8, paddingVertical: 9, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  tabActive: { backgroundColor: "#FFFFFF", shadowColor: "#294880", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  tabText: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#78869D", flexShrink: 1 },
  tabTextActive: { color: "#294880" },
  disclosure: { borderTopWidth: 1, borderTopColor: "#E9EEF5" },
  disclosureTrigger: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  disclosureTitle: { fontFamily: "PoppinsMedium", fontSize: 11, color: "#64748B", flexShrink: 1 },
  disclosureBody: { gap: 10, paddingBottom: 10 },
  empty: { paddingVertical: 30, paddingHorizontal: 12, alignItems: "center", gap: 8 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#F0F4FA", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontFamily: "PoppinsMedium", fontSize: 13, color: "#405575" },
  emptyMessage: { fontFamily: "PoppinsRegular", fontSize: 11, lineHeight: 18, color: "#7D8CA2", textAlign: "center", maxWidth: 320 },
});
