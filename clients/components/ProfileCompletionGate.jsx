import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { subscribeProfileRequirement } from "../services/profileRequirementEvents";
import { sessionData } from "../services/sessionData";

export default function ProfileCompletionGate() {
  const [missing, setMissing] = useState(null);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => subscribeProfileRequirement(setMissing), []);
  useEffect(() => sessionData.subscribe(event => { if (event.type === "session") setMissing(null); }), []);
  return <Modal transparent visible={missing !== null} animationType="fade" onRequestClose={() => setMissing(null)}>
    <View style={s.overlay}><View style={s.card}>
      <Text accessibilityRole="header" style={s.title}>Personal Details required</Text>
      <ScrollView style={s.details} contentContainerStyle={s.detailsContent}>
        <Text style={s.body}>Please fill in all required Personal Details before you can post reports or add comments.</Text>
        <Text style={s.body}>These details help keep community reports accountable, allow follow-up when more information is needed, and associate reports with the correct area.</Text>
        {(missing || []).length ? <Text style={s.requiredLabel}>Still needed:</Text> : null}
        {(missing || []).map(field => <Text key={field} style={s.field}>• {field}</Text>)}
        <Text style={s.body}>Open Profile Details, tap Edit, complete the required fields, and Save. Enter your full home or permanent address, including barangay, city/municipality and province. Addresses outside Argao are accepted. No location permission is needed. Middle name and house number are optional.</Text>
        <Text style={s.body}>You can still browse reports and safety information.</Text>
      </ScrollView>
      <Pressable accessibilityRole="button" style={s.primary} onPress={() => {
        setMissing(null);
        if (!pathname.includes("User_ProfileSettings")) router.push({ pathname: "/(tabs)/User_ProfileSettings", params: { completeProfile: "1", returnTo: pathname } });
      }}><Text style={s.primaryText}>Fill in Personal Details</Text></Pressable>
      <Pressable accessibilityRole="button" style={s.secondary} onPress={() => setMissing(null)}><Text style={s.body}>Not now</Text></Pressable>
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, padding: 24, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "center", alignItems: "center" },
  card: { width: "100%", maxWidth: 460, maxHeight: "90%", backgroundColor: "#FFFFFF", padding: 24, borderRadius: 16, gap: 12 },
  details: { flexShrink: 1 }, detailsContent: { gap: 10 }, requiredLabel: { fontSize: 13, fontWeight: "600", color: "#334155" },
  title: { fontFamily: "PoppinsSemiBold", fontSize: 20, color: "#294880" }, body: { fontSize: 13, lineHeight: 20, color: "#475569" },
  field: { fontSize: 13, color: "#9A3B25" }, primary: { minHeight: 46, borderRadius: 9, padding: 13, alignItems: "center", backgroundColor: "#294880" },
  primaryText: { fontSize: 14, color: "#FFFFFF", fontFamily: "PoppinsSemiBold" }, secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
