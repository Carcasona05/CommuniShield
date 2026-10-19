import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function LoginVerificationModal({ challenge, onVerify, onResend, onCancel }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const inflight = useRef(false);
  useEffect(() => {
    setCode("");
    setError("");
    setResendAfter(challenge?.resend_after || 0);
  }, [challenge]);
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setResendAfter((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  const perform = async (action) => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (err) {
      if (err.response?.status === 429) setResendAfter(60);
      setError(err.response?.data?.error || err.message || "Please try again.");
    } finally { inflight.current = false; setBusy(false); }
  };
  return (
    <Modal visible={!!challenge} transparent animationType="fade" onRequestClose={() => { if (!inflight.current) onCancel(); }}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.card}>
          <Ionicons name="mail-open-outline" size={36} color="#294880" />
          <Text style={styles.title}>Verify this device</Text>
          <Text style={styles.description}>Enter the six-digit code sent to {challenge?.masked_email}. It expires in 10 minutes.</Text>
          <TextInput
            style={styles.input} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" autoComplete="one-time-code"
            placeholder="000000" accessibilityLabel="Six-digit sign-in code" editable={!busy}
            onSubmitEditing={() => { if (code.length === 6) perform(() => onVerify(code)); }}
          />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Text style={styles.description}>After verification, this device is remembered for 30 days. Only continue on a device you trust.</Text>
          <TouchableOpacity style={[styles.button, (busy || code.length !== 6) && styles.disabled]} disabled={busy || code.length !== 6} onPress={() => perform(() => onVerify(code))}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Verify and sign in</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.link} disabled={busy || resendAfter > 0} onPress={() => perform(onResend)}>
            <Text style={styles.linkText}>{resendAfter > 0 ? `Resend code in ${resendAfter}s` : "Resend code"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.link} disabled={busy} onPress={onCancel}><Text style={styles.linkText}>Back to sign in</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.5)", padding: 20 },
  card: { width: "100%", maxWidth: 420, backgroundColor: "#FFFFFF", borderRadius: 22, padding: 24, alignItems: "center" },
  title: { fontSize: 21, fontWeight: "700", color: "#16233A", marginTop: 12, marginBottom: 10 },
  description: { fontSize: 13, lineHeight: 20, textAlign: "center", color: "#5D6F92", marginBottom: 14 },
  input: { width: "100%", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, padding: 14, fontSize: 25, letterSpacing: 7, textAlign: "center", color: "#294880", marginBottom: 14 },
  button: { width: "100%", minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: "#294880", borderRadius: 12 },
  buttonText: { color: "#FFFFFF", fontWeight: "600" },
  disabled: { opacity: 0.5 },
  link: { padding: 12 },
  linkText: { color: "#294880", fontSize: 13 },
  error: { color: "#B91C1C", marginBottom: 12, textAlign: "center" },
});
