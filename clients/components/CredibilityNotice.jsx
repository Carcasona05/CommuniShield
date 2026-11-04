import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { subscribeCredibilityNotice } from "../services/credibilityEvents";
import { sessionData } from "../services/sessionData";
export default function CredibilityNotice() {
  const [message, setMessage] = useState(null);
  const router = useRouter();
  useEffect(() => subscribeCredibilityNotice(setMessage), []);
  useEffect(() => sessionData.subscribe(event => { if (event.type === "session") setMessage(null); }), []);
  return <Modal transparent visible={Boolean(message)} animationType="fade" onRequestClose={() => setMessage(null)}>
    <View style={s.overlay}><View style={s.card}>
      <Text accessibilityRole="header" style={s.title}>{message?.title || "Your account access"}</Text><Text style={s.body}>{typeof message === "string" ? message : message?.message}</Text>
      <TouchableOpacity accessibilityRole="button" style={s.button} onPress={() => { setMessage(null); router.push("/(tabs)/User_ProfileSettings"); }}><Text style={s.white}>View account access</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={s.close} onPress={() => setMessage(null)}><Text style={s.body}>Close</Text></TouchableOpacity>
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({ overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", padding: 24, alignItems: "center", justifyContent: "center" }, card: { backgroundColor: "white", borderRadius: 18, padding: 24, gap: 16, width: "100%", maxWidth: 420 }, title: { fontSize: 20, fontWeight: "600", color: "#294880" }, body: { color: "#475569", fontSize: 14, lineHeight: 22 }, button: { padding: 14, borderRadius: 10, backgroundColor: "#294880", alignItems: "center" }, white: { color: "white", fontWeight: "600" }, close: { minHeight: 44, alignItems: "center", justifyContent: "center" } });
