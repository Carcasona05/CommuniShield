import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function AccountDisabledNotice({ visible, onConfirm, email, signOut = false }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={signOut ? () => {} : onConfirm}>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.icon}><Ionicons name="lock-closed-outline" size={30} color="#B45309" /></View>
          <Text style={styles.eyebrow}>ACCOUNT ACCESS</Text>
          <Text style={styles.title}>Account Disabled</Text>
          <Text style={styles.description}>Your account is currently disabled. You cannot access the admin portal until it is reactivated.</Text>
          {!!email && <View style={styles.account}><Ionicons name="person-circle-outline" size={24} color="#294880" /><Text style={styles.email} selectable>{email}</Text></View>}
          <View style={styles.help}>
            <Ionicons name="information-circle-outline" size={21} color="#294880" />
            <View style={styles.helpBody}>
              <Text style={styles.helpTitle}>Need access restored?</Text>
              <Text style={styles.helpText}>Contact your supervisor or system administrator to reactivate your account.</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.button} onPress={onConfirm} activeOpacity={0.85} accessibilityRole="button">
            <Text style={styles.buttonText}>{signOut ? "Return to sign in" : "Back to sign in"}</Text>
            <Ionicons name="arrow-forward-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", justifyContent: "center", alignItems: "center", padding: 20 },
  card: { width: "100%", maxWidth: 440, padding: 26, borderRadius: 22, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#0F172A", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  icon: { width: 64, height: 64, borderRadius: 20, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  eyebrow: { fontFamily: "PoppinsMedium", fontSize: 10, letterSpacing: 1.5, color: "#8A641D", textAlign: "center" },
  title: { fontFamily: "PoppinsSemiBold", fontSize: 23, color: "#203456", textAlign: "center", marginTop: 5 },
  description: { fontFamily: "PoppinsRegular", fontSize: 13, lineHeight: 21, color: "#52627A", textAlign: "center", marginTop: 10 },
  account: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 12, backgroundColor: "#F6F8FC", marginTop: 16 },
  email: { flex: 1, fontFamily: "PoppinsMedium", fontSize: 13, color: "#294880" },
  help: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, backgroundColor: "#EEF4FF", marginTop: 18 },
  helpBody: { flex: 1 },
  helpTitle: { fontFamily: "PoppinsSemiBold", fontSize: 12, color: "#294880", marginBottom: 4 },
  helpText: { fontFamily: "PoppinsRegular", fontSize: 12, lineHeight: 19, color: "#405677" },
  button: { marginTop: 22, paddingVertical: 14, borderRadius: 12, backgroundColor: "#294880", flexDirection: "row", gap: 10, justifyContent: "center", alignItems: "center" },
  buttonText: { fontFamily: "PoppinsMedium", fontSize: 13, color: "#FFFFFF" },
});
