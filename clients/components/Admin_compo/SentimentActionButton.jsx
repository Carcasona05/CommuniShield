import React, { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function SentimentActionButton({ title, onPress, disabled = false, variant = "secondary", icon, accessibilityLabel }) {
  const [focused, setFocused] = useState(false);
  const primary = variant === "primary";
  const danger = variant === "danger";
  const color = disabled ? "#526174" : primary ? "#FFFFFF" : danger ? "#A22323" : "#203E72";
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [s.button, primary && s.primary, danger && s.danger,
      disabled && s.disabled, focused && !disabled && s.focused, pressed && !disabled && s.pressed]}>
    {icon ? <Ionicons name={icon} size={18} color={color} /> : null}
    <Text style={[s.text, { color }]}>{title}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  button: { minHeight: 46, paddingHorizontal: 17, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5,
    borderColor: "#8EA5C6", backgroundColor: "#FFFFFF", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: "#244982", borderColor: "#193760" },
  danger: { backgroundColor: "#FFF4F3", borderColor: "#CA7772" },
  disabled: { backgroundColor: "#E7ECF2", borderColor: "#C3CDD9" },
  focused: { borderColor: "#087EAA", borderWidth: 3 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  text: { fontFamily: "PoppinsSemiBold", fontSize: 12, textAlign: "center", flexShrink: 1 },
});
