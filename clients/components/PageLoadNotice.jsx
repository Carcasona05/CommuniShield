import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import apiClient from "../services/apiClient";
import { getPageFailures, subscribePageFailures } from "../services/pageLoadStatus";
import { sessionData } from "../services/sessionData";

export default function PageLoadNotice() {
  const [failures, setFailures] = useState(getPageFailures);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => subscribePageFailures(setFailures), []);
  const failure = failures[0];
  if (!failure) return null;
  const retry = async () => {
    setRetrying(true);
    try {
      sessionData.invalidate({ paths: [failure.url] });
      await apiClient.get(failure.url, { params: failure.params, cacheMode: "network", timeout: 25000 });
    } catch { /* The shared request status keeps the retry notice visible. */ }
    finally { setRetrying(false); }
  };
  return <View style={s.card}>
    <Text accessibilityRole="alert" style={s.text}>{failure.message}</Text>
    <TouchableOpacity accessibilityRole="button" onPress={retry} disabled={retrying} style={s.button}>
      {retrying ? <ActivityIndicator color="#294880" /> : <Text style={s.link}>Retry</Text>}
    </TouchableOpacity>
  </View>;
}
const s = StyleSheet.create({ card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: "#FFF7ED", borderBottomWidth: 1, borderColor: "#FED7AA" },
  text: { flex: 1, color: "#7C421C", fontSize: 12, lineHeight: 18 }, button: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center" }, link: { color: "#294880", fontWeight: "600" } });
