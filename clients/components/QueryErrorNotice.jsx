import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export default function QueryErrorNotice({ message, onRetry, refreshing = false, hasData = false }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={{ padding: 16, gap: 8 }}>
      <Text style={{ color: "#B93838" }}>{hasData ? "Showing previously loaded data. " : "Data could not be loaded. "}{message}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry loading data" disabled={refreshing} onPress={onRetry}>
        <Text style={{ color: "#294880", fontWeight: "600" }}>{refreshing ? "Retrying…" : "Retry"}</Text>
      </TouchableOpacity>
    </View>
  );
}
