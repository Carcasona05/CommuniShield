import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function MapLoadingOverlay({ visible, error, onRetry, loadingData = false }) {
  if (!visible && !error) return null;
  return <View style={s.overlay} testID="map-loading-overlay">
    {error ? <>
      <Text accessibilityRole="alert" style={s.text}>{error}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onRetry} style={s.retry}><Text style={s.link}>Retry map</Text></TouchableOpacity>
    </> : <><ActivityIndicator size="large" color="#294880" /><Text accessibilityRole="progressbar" style={s.text}>{loadingData ? "Loading map data…" : "Loading map…"}</Text></>}
  </View>;
}
const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 5, backgroundColor: "#EEF3FA", alignItems: "center", justifyContent: "center", padding: 20, gap: 12 },
  text: { color: "#475569", fontSize: 13, textAlign: "center", lineHeight: 20 },
  retry: { paddingHorizontal: 20, minHeight: 44, justifyContent: "center" },
  link: { color: "#294880", fontWeight: "600" },
});
