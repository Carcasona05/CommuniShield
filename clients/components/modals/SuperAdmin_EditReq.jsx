import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useToast } from "../Toast";
import { digitsOnly, isValidEmail, isValidPhone } from "../../services/validation";

const COLORS = {
  primary: "#294880",
  primarySoft: "#EAF2FF",
  primaryBorder: "#D9E2F0",
  text: "#2F4267",
  textMuted: "#5D6F92",
  white: "#FFFFFF",
  surfaceSoft: "#F7F9FD",
};

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  keyboardType,
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>

      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={18} color={COLORS.textMuted} />

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          keyboardType={keyboardType}
          style={styles.textInput}
        />
      </View>
    </View>
  );
}

export default function Admin_EditAdminReq({
  visible,
  admin,
  onClose,
  onSave,
}) {
  const toast = useToast();
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    email: "",
    role: "",
    department: "",
    phone: "",
    status: "Active",
  });

  useEffect(() => {
    if (admin) {
      setFormData({
        id: admin.id,
        name: admin.name || "",
        email: admin.email || "",
        role: admin.role || "",
        department: admin.department || "",
        phone: admin.phone || "",
        status: admin.status || "Active",
      });
    }
  }, [admin]);

  const showMessage = (title, message) => {
    const fullMessage = `${title}. ${message}`;
    const lowerTitle = title.toLowerCase();
    if (
      lowerTitle.includes("fail") ||
      lowerTitle.includes("missing") ||
      lowerTitle.includes("mismatch") ||
      lowerTitle.includes("invalid") ||
      lowerTitle.includes("error") ||
      lowerTitle.includes("required")
    ) {
      toast.error(fullMessage);
    } else {
      toast.success(fullMessage);
    }
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (
      !formData.name ||
      !formData.email ||
      !formData.role ||
      !formData.department ||
      !formData.phone
    ) {
      showMessage("Missing Details", "Please complete all required fields.");
      return;
    }

    if (!isValidEmail(formData.email)) {
      showMessage("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (!isValidPhone(formData.phone)) {
      showMessage(
        "Invalid Phone Number",
        "Phone number must be exactly 11 digits."
      );
      return;
    }

    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  if (!admin) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="create-outline" size={22} color={COLORS.primary} />
              </View>

              <View style={styles.headerTextWrap}>
                <Text style={styles.modalTitle}>Admin Edit Request</Text>
                <Text style={styles.modalSubtitle}>
                  Review and update this admin account details.
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <View style={styles.previewAvatar}>
                  <Ionicons name="person-outline" size={24} color={COLORS.primary} />
                </View>

                <View style={styles.previewInfo}>
                  <Text style={styles.previewName}>{admin.name}</Text>
                  <Text style={styles.previewEmail}>{admin.email}</Text>
                </View>
              </View>

              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Current Role</Text>
                  <Text style={styles.detailValue}>{admin.role}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Department</Text>
                  <Text style={styles.detailValue}>{admin.department}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Phone</Text>
                  <Text style={styles.detailValue}>{admin.phone}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={styles.detailValue}>{admin.status}</Text>
                </View>
              </View>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Requested Detail Changes</Text>
              <Text style={styles.formSubtitle}>
                Update the fields below to apply the admin edit request.
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
                  placeholder="Enter admin full name"
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
                  placeholder="Enter admin email"
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
                  placeholder="Enter admin role"
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
                  placeholder="Enter department"
                  icon="business-outline"
                />

                <InputField
                  label="Phone Number"
                  value={formData.phone}
                  onChangeText={(text) =>
                    setFormData({
                      ...formData,
                      phone: digitsOnly(text),
                    })
                  }
                  placeholder="Enter 11-digit phone number"
                  icon="call-outline"
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </ScrollView>

          <View style={styles.footerActions}>
            <TouchableOpacity
              style={[styles.cancelButton, saving && styles.buttonDisabled]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Ionicons name="save-outline" size={18} color={COLORS.white} />
              )}
              <Text style={styles.saveButtonText}>
                {saving ? "Saving..." : "Save Edit Request"}
              </Text>
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
    maxWidth: 760,
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

  previewCard: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },

  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  previewAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  previewInfo: {
    flex: 1,
  },

  previewName: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 4,
  },

  previewEmail: {
    fontSize: 13,
    color: COLORS.textMuted,
  },

  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  detailItem: {
    flex: 1,
    minWidth: 150,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },

  detailLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 5,
  },

  detailValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: "700",
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
    minWidth: 240,
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

  buttonDisabled: {
    opacity: 0.45,
  },

  SaveIcon: {
    color: COLORS.white,
  },
  
});