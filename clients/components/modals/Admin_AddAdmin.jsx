import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  primary: "#294880",
  primarySoft: "#EAF2FF",
  primaryBorder: "#D9E2F0",
  text: "#2F4267",
  textMuted: "#5D6F92",
  white: "#FFFFFF",
  surfaceSoft: "#F7F9FD",
  danger: "#E45757",
  dangerSoft: "#FFF5F5",
};

const validatePassword = (value) => {
  if (!value) return "Password is required.";
  if (value.length < 6) return "Password must be at least 6 characters.";
  if (!/[A-Z]/.test(value))
    return "Password must contain at least one capital letter.";
  if (!/[0-9\W_]/.test(value))
    return "Password must contain at least one number or symbol.";
  return "";
};

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  keyboardType,
  secureTextEntry,
  error,
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>

      <View style={[styles.inputWrap, error && styles.inputWrapError]}>
        <Ionicons name={icon} size={18} color={COLORS.textMuted} />

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry && !showPassword}
          style={styles.textInput}
        />

        {secureTextEntry ? (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            activeOpacity={0.7}
            style={styles.eyeButton}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={COLORS.textMuted}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
    </View>
  );
}

export default function Admin_AddAdmin({ visible, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "",
    department: "",
    phone: "",
    password: "",
  });

  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const showMessage = (title, message) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
      return;
    }

    Alert.alert(title, message);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      role: "",
      department: "",
      phone: "",
      password: "",
    });
    setPasswordSubmitted(false);
    setPasswordError("");
  };

  const handlePasswordChange = (value) => {
    setFormData((prev) => ({ ...prev, password: value }));
    if (passwordSubmitted) {
      setPasswordError(validatePassword(value));
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = () => {
    setPasswordSubmitted(true);
    const pwError = validatePassword(formData.password);
    setPasswordError(pwError);

    if (pwError) return;

    if (
      !formData.name ||
      !formData.email ||
      !formData.role ||
      !formData.department ||
      !formData.phone
    ) {
      showMessage("Missing Details", "Please complete all fields.");
      return;
    }

    if (!formData.email.includes("@")) {
      showMessage("Invalid Email", "Please enter a valid email address.");
      return;
    }

    onSubmit({
      name: formData.name,
      email: formData.email,
      role: formData.role,
      department: formData.department,
      phone: formData.phone,
      password: formData.password,
    });

    resetForm();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <View style={styles.headerIconWrap}>
                <Ionicons
                  name="person-add-outline"
                  size={22}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.headerTextWrap}>
                <Text style={styles.modalTitle}>Add Admin</Text>
                <Text style={styles.modalSubtitle}>
                  Create a new administrator account for CommuniShield.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Admin Details</Text>
              <Text style={styles.formSubtitle}>
                Fill in the required information for the new admin account.
              </Text>

              <View style={styles.inputGrid}>
                <InputField
                  label="Full Name"
                  value={formData.name}
                  onChangeText={(text) =>
                    setFormData({
                      ...formData,
                      name: text,
                    })
                  }
                  placeholder="Enter full name"
                  icon="person-outline"
                />

                <InputField
                  label="Email Address"
                  value={formData.email}
                  onChangeText={(text) =>
                    setFormData({
                      ...formData,
                      email: text,
                    })
                  }
                  placeholder="Enter email address"
                  icon="mail-outline"
                  keyboardType="email-address"
                />

                <InputField
                  label="Role"
                  value={formData.role}
                  onChangeText={(text) =>
                    setFormData({
                      ...formData,
                      role: text,
                    })
                  }
                  placeholder="Example: Super Admin"
                  icon="shield-checkmark-outline"
                />

                <InputField
                  label="Department"
                  value={formData.department}
                  onChangeText={(text) =>
                    setFormData({
                      ...formData,
                      department: text,
                    })
                  }
                  placeholder="Example: System Management"
                  icon="business-outline"
                />

                <InputField
                  label="Phone Number"
                  value={formData.phone}
                  onChangeText={(text) =>
                    setFormData({
                      ...formData,
                      phone: text,
                    })
                  }
                  placeholder="Enter phone number"
                  icon="call-outline"
                  keyboardType="phone-pad"
                />

                <InputField
                  label="Temporary Password"
                  value={formData.password}
                  onChangeText={handlePasswordChange}
                  placeholder="Enter temporary password"
                  icon="lock-closed-outline"
                  secureTextEntry
                  error={passwordError}
                />
              </View>

              <View style={styles.noteBox}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={COLORS.primary}
                />
                <Text style={styles.noteText}>
                  The new admin can update their account details after logging in.
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.footerActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSubmit}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color={COLORS.white} />
              <Text style={styles.saveButtonText}>Add Admin</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    width: "100%",
    maxWidth: 720,
    maxHeight: "92%",
    backgroundColor: COLORS.white,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 8,
  },

  modalHeader: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryBorder,
    backgroundColor: COLORS.surfaceSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  modalTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  headerTextWrap: {
    flex: 1,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 4,
  },

  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 19,
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },

  scrollContent: {
    padding: 20,
  },

  formCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 16,
    padding: 16,
  },

  formTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 4,
  },

  formSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 19,
    marginBottom: 16,
  },

  inputGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },

  inputGroup: {
    flex: 1,
    minWidth: 250,
  },

  inputLabel: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: "600",
    marginBottom: 8,
  },

  inputWrap: {
    height: 46,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  textInput: {
    flex: 1,
    height: "100%",
    marginLeft: 10,
    color: COLORS.text,
    fontSize: 14,
    outlineStyle: Platform.OS === "web" ? "none" : undefined,
  },

  eyeButton: {
    marginLeft: 8,
    padding: 4,
  },

  inputWrapError: {
    borderColor: "#C0392B",
  },

  fieldErrorText: {
    width: "100%",
    color: "#C0392B",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    paddingHorizontal: 2,
  },

  noteBox: {
    marginTop: 16,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  noteText: {
    flex: 1,
    marginLeft: 8,
    color: COLORS.primary,
    fontSize: 13,
    lineHeight: 19,
  },

  footerActions: {
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.primaryBorder,
    backgroundColor: COLORS.surfaceSoft,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },

  cancelButton: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },

  saveButton: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  saveButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
  },
});