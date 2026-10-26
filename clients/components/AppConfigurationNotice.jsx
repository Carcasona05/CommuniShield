import React from "react";
import { View, Text } from "react-native";

export default function AppConfigurationNotice({ message }) {
  return <View style={{ flex: 1, backgroundColor: "#f5f7fb", padding: 28, justifyContent: "center", alignItems: "center" }}>
    <Text style={{ color: "#294880", fontSize: 26, fontWeight: "700", marginBottom: 16 }}>CommuniShield</Text>
    <Text accessibilityRole="alert" style={{ color: "#294880", fontSize: 20, fontWeight: "600", marginBottom: 12 }}>App setup required</Text>
    <Text style={{ color: "#52627a", fontSize: 15, textAlign: "center", maxWidth: 440 }}>{message}</Text>
    <Text style={{ color: "#52627a", textAlign: "center", marginTop: 20 }}>Please install a corrected build from your administrator. Reopening this same APK will not change its build configuration.</Text>
  </View>;
}
