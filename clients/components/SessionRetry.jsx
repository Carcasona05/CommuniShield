import React from "react";
import { View, Text, Pressable } from "react-native";

export default function SessionRetry({ onRetry }) {
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#f5f7fb" }}>
    <Text style={{ color: "#294880", fontSize: 20, fontWeight: "600", marginBottom: 12 }}>Connection temporarily unavailable</Text>
    <Text style={{ color: "#52627a", textAlign: "center", maxWidth: 420, marginBottom: 20 }}>
      We could not verify your session. Your saved overview is hidden until verification succeeds. Check your connection and try again.
    </Text>
    <Pressable accessibilityRole="button" onPress={onRetry} style={{ backgroundColor: "#294880", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}>
      <Text style={{ color: "#fff", fontWeight: "600" }}>Try again</Text>
    </Pressable>
  </View>;
}
