import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SentimentActionButton from "./SentimentActionButton";

const PAGE_SIZE = 20;
export default function SentimentManualTable({ rows, busy, editingId, onEdit, onRemove }) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(1);
  const previousCount = useRef(rows.length);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  useEffect(() => {
    if (rows.length > previousCount.current) setPage(pages);
    else setPage(current => Math.min(current, pages));
    previousCount.current = rows.length;
  }, [rows.length, pages]);
  const compact = width < 640;
  const actions = (row, index) => <View style={s.actions}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit added example ${index + 1}`} disabled={busy} onPress={() => onEdit(row.draftId)} style={[s.action, busy && s.disabled]}><Ionicons name="create-outline" size={16} color="#294880" /><Text style={s.edit}>Edit</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Remove added example ${index + 1}`} disabled={busy} onPress={() => onRemove(row.draftId)} style={[s.action, busy && s.disabled]}><Ionicons name="trash-outline" size={16} color="#B93838" /><Text style={s.remove}>Remove</Text></Pressable>
  </View>;
  return <View style={s.stack} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={s.summary}><Text style={s.title}>Examples added: {rows.length}</Text><Text style={s.draftLabel}>Draft · not submitted</Text></View>
    {!rows.length ? <View style={s.empty}><View style={s.emptyIcon}><Ionicons name="list-outline" size={22} color="#7387A3" /></View><View style={s.emptyText}><Text style={s.emptyTitle}>Your examples will appear here</Text><Text style={s.note}>Complete the form above and select Add to dataset.</Text></View></View> : <View style={s.table}>
      {!compact ? <View style={s.header}><Text style={[s.columnTitle, s.textColumn]}>Text / phrase</Text><Text style={[s.columnTitle, s.languageColumn]}>Language</Text><Text style={[s.columnTitle, s.labelColumn]}>Sentiment</Text><Text style={[s.columnTitle, s.actionColumn]}>Actions</Text></View> : null}
      {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((row, offset) => {
        const index = (page - 1) * PAGE_SIZE + offset;
        return <View key={row.draftId} style={[s.row, compact && s.mobileRow, editingId === row.draftId && s.editing]}>
          {compact ? <>
            <Text style={s.columnTitle}>Example {index + 1}{editingId === row.draftId ? " · Editing" : ""}</Text>
            <Text selectable style={s.body}>{row.text}</Text>
            <View style={s.tags}><Text style={s.tag}>{row.language}</Text><Text style={s.tag}>{row.label}</Text></View>
            {actions(row, index)}
          </> : <>
            <Text selectable style={[s.body, s.textColumn]}>{row.text}</Text>
            <Text style={[s.body, s.languageColumn, s.capitalize]}>{row.language}</Text>
            <Text style={[s.body, s.labelColumn, s.capitalize]}>{row.label}</Text>
            <View style={s.actionColumn}>{actions(row, index)}</View>
          </>}
        </View>;
      })}
    </View>}
    {pages > 1 ? <View style={s.pagination}><SentimentActionButton title="Previous examples" variant="secondary" disabled={busy || page === 1} onPress={() => setPage(page - 1)} /><Text style={s.note}>{page} / {pages}</Text><SentimentActionButton title="Next examples" variant="secondary" disabled={busy || page === pages} onPress={() => setPage(page + 1)} /></View> : null}
  </View>;
}

const s = StyleSheet.create({
  stack: { gap: 10 }, title: { fontSize: 14, fontFamily: "PoppinsSemiBold", color: "#203B66" },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" },
  draftLabel: { fontFamily: "PoppinsRegular", fontSize: 11, color: "#718096" },
  empty: { padding: 22, borderRadius: 10, backgroundColor: "#FAFBFD", borderWidth: 1, borderColor: "#E2E8F0", flexDirection: "row", alignItems: "center", gap: 14 },
  emptyIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: "#EEF2F7", alignItems: "center", justifyContent: "center" },
  emptyText: { flex: 1, minWidth: 0, gap: 4 },
  emptyTitle: { fontFamily: "PoppinsMedium", fontSize: 13, lineHeight: 21, color: "#475569" },
  note: { fontSize: 12, lineHeight: 20, fontFamily: "PoppinsRegular", color: "#475569" },
  table: { borderWidth: 1, borderColor: "#DCE4EF", borderRadius: 10, overflow: "hidden" },
  header: { flexDirection: "row", gap: 12, padding: 12, backgroundColor: "#F6F8FB" },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 12, borderTopWidth: 1, borderTopColor: "#E6ECF5" },
  mobileRow: { flexDirection: "column", gap: 8 }, editing: { backgroundColor: "#F0F5FF" },
  textColumn: { flex: 3, minWidth: 0 }, languageColumn: { flex: 1, minWidth: 0 }, labelColumn: { flex: 1, minWidth: 0 }, actionColumn: { width: 150 },
  columnTitle: { fontSize: 12, lineHeight: 20, fontFamily: "PoppinsSemiBold", color: "#294880" },
  body: { fontSize: 13, lineHeight: 21, fontFamily: "PoppinsRegular", color: "#334155" }, capitalize: { textTransform: "capitalize" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, tag: { textTransform: "capitalize", backgroundColor: "#EEF2F8", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, color: "#334155", fontSize: 12, fontFamily: "PoppinsMedium" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, action: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 40, paddingHorizontal: 5 },
  edit: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#294880" }, remove: { fontFamily: "PoppinsMedium", fontSize: 12, color: "#B93838" }, disabled: { opacity: .45 },
  pagination: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" },
});
