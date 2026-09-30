import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import { SettingsSkeleton } from "../../components/PageSkeletons";
import apiClient from "../../services/apiClient";
import { getCache, setCache } from "../../services/dataStore";
import {
  digitsOnly,
  isValidEmail,
  isValidPhone,
  joinFullName,
  passwordPolicyError,
} from "../../services/validation";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import ToastProvider, { useToast } from "../../components/Toast";

const COLORS = {
  primary: "#294880",
  primarySoft: "#EAF2FF",
  primaryBorder: "#D9E2F0",
  text: "#2F4267",
  textMuted: "#5D6F92",
  white: "#FFFFFF",
  background: "#F5F8FC",
  surfaceSoft: "#F7F9FD",
  success: "#22A06B",
  danger: "#E45757",
};

const validateNewPassword = (value) => {
  if (!value) return "Password is required.";
  return passwordPolicyError(value);
};

const validateConfirmPassword = (value, newPasswordValue) => {
  if (!value) return "Please confirm your password.";
  if (value !== newPasswordValue) return "Passwords do not match.";
  return "";
};

const validateCurrentPassword = (value) => {
  if (!value) return "Current password is required.";
  return "";
};

function FormSection({ icon, title, description, children }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name={icon} size={18} color={COLORS.primary} />
          </View>

          <View style={styles.sectionTextWrap}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.sectionDescription}>{description}</Text>
          </View>
        </View>
      </View>

      <View style={styles.formContent}>{children}</View>
    </View>
  );
}

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  icon,
  error,
  editable = true,
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>

      <View
        style={[
          styles.inputWrap,
          error && styles.inputWrapError,
          !editable && styles.inputWrapDisabled,
        ]}
      >
        <Ionicons name={icon} size={18} color={COLORS.textMuted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry={secureTextEntry && !showPassword}
          keyboardType={keyboardType}
          editable={editable}
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

export default function Admin_SettingsWrapper() {
  return (
    <ToastProvider>
      <Admin_Settings />
    </ToastProvider>
  );
}

function Admin_Settings() {
  const toast = useToast();
  const [loading, setLoading] = useState(() => getCache("api:/profile") === undefined);

  const [profile, setProfile] = useState(() => {
    const cached = getCache("api:/profile");
    const legacyName = cached?.name || cached?.fullname || "";
    return {
      firstName: cached?.first_name || legacyName,
      middleName: cached?.middle_name || "",
      lastName: cached?.last_name || "",
      username: cached?.user_name || "",
      phone: cached?.phone || "",
      department: cached?.department || "",
    };
  });

  const initialProfileRef = useRef(profile);

  const [emailData, setEmailData] = useState(() => ({
    currentEmail: getCache("api:/profile")?.email || "",
    newEmail: "",
    confirmEmail: "",
  }));

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const updatePasswordField = (key, value) => {
    setPasswordData((prev) => {
      const next = { ...prev, [key]: value };

      if (passwordSubmitted) {
        setCurrentPasswordError(validateCurrentPassword(next.currentPassword));
        setNewPasswordError(validateNewPassword(next.newPassword));
        setConfirmPasswordError(
          validateConfirmPassword(next.newPassword, next.confirmPassword)
        );
      }

      return next;
    });
  };

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadProfile = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/profile");
      if (cached) {
        const legacyName = cached.name || cached.fullname || "";
        const cachedProfile = {
          firstName: cached.first_name || legacyName,
          middleName: cached.middle_name || "",
          lastName: cached.last_name || "",
          username: cached.user_name || "",
          phone: cached.phone || "",
          department: cached.department || "",
        };
        setProfile(cachedProfile);
        initialProfileRef.current = cachedProfile;
        setEmailData((prev) => ({ ...prev, currentEmail: cached.email || "" }));
      }

      const res = await apiClient.get("/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = res.data ?? {};
      setCache("api:/profile", data);

      const legacyName = data.name || data.fullname || "";
      const serverProfile = {
        firstName: data.first_name || legacyName,
        middleName: data.middle_name || "",
        lastName: data.last_name || "",
        username: data.user_name || "",
        phone: data.phone || "",
        department: data.department || "",
      };
      setProfile(serverProfile);
      initialProfileRef.current = serverProfile;

      setEmailData((prev) => ({ ...prev, currentEmail: data.email || "" }));
    } catch {
      // keep empty defaults on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(loadProfile, 60000);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (!fontsLoaded) {
    return null;
  }

  if (loading) {
    return (
      <Admin_Layout>
        <SettingsSkeleton />
      </Admin_Layout>
    );
  }

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

  const profileDirty =
    profile.firstName !== initialProfileRef.current.firstName ||
    profile.middleName !== initialProfileRef.current.middleName ||
    profile.lastName !== initialProfileRef.current.lastName ||
    profile.username !== initialProfileRef.current.username ||
    profile.phone !== initialProfileRef.current.phone ||
    profile.department !== initialProfileRef.current.department;

  const fullName = joinFullName(profile);

  const emailReady = Boolean(
    emailData.currentEmail && emailData.newEmail && emailData.confirmEmail
  );

  const passwordReady = Boolean(
    passwordData.currentPassword &&
      passwordData.newPassword &&
      passwordData.confirmPassword
  );

  const handleProfileSave = async () => {
    if (
      !profile.firstName ||
      !profile.lastName ||
      !profile.username ||
      !profile.phone ||
      !profile.department
    ) {
      showMessage("Missing Details", "Please complete all profile details.");
      return;
    }

    if (!isValidPhone(profile.phone)) {
      showMessage("Invalid Phone Number", "Phone number must be exactly 11 digits.");
      return;
    }

    setSavingProfile(true);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      await apiClient.put(
        "/profile",
        {
          first_name: profile.firstName.trim(),
          middle_name: profile.middleName.trim(),
          last_name: profile.lastName.trim(),
          user_name: profile.username,
          phone: profile.phone,
          department: profile.department,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const cached = getCache("api:/profile");
      setCache("api:/profile", {
        ...(cached || {}),
        name: fullName,
        fullname: fullName,
        first_name: profile.firstName.trim(),
        middle_name: profile.middleName.trim(),
        last_name: profile.lastName.trim(),
        user_name: profile.username,
        phone: profile.phone,
        department: profile.department,
      });

      showMessage(
        "Profile Updated",
        "Your profile details have been updated successfully."
      );
      initialProfileRef.current = { ...profile };
    } catch (error) {
      showMessage(
        "Update Failed",
        error.response?.data?.error || "Could not update your profile."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleEmailSave = async () => {
    if (!emailData.currentEmail || !emailData.newEmail || !emailData.confirmEmail) {
      showMessage("Missing Email", "Please enter and confirm your new email.");
      return;
    }

    if (emailData.newEmail !== emailData.confirmEmail) {
      showMessage(
        "Email Mismatch",
        "New email and confirm email do not match."
      );
      return;
    }

    if (!isValidEmail(emailData.newEmail)) {
      showMessage("Invalid Email", "Please enter a valid email address.");
      return;
    }

    setSavingEmail(true);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      await apiClient.put(
        "/profile/email",
        {
          currentEmail: emailData.currentEmail,
          newEmail: emailData.newEmail,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setEmailData((prev) => ({
        ...prev,
        newEmail: "",
        confirmEmail: "",
      }));

      showMessage(
        "Email Update Requested",
        "Confirm the change from your new email."
      );
    } catch (error) {
      showMessage(
        "Update Failed",
        error.response?.data?.error || "Could not update your email."
      );
    } finally {
      setSavingEmail(false);
    }
  };

  const handlePasswordSave = async () => {
    setPasswordSubmitted(true);

    const currentError = validateCurrentPassword(passwordData.currentPassword);
    const newError = validateNewPassword(passwordData.newPassword);
    const confirmError = validateConfirmPassword(
      passwordData.newPassword,
      passwordData.confirmPassword
    );

    setCurrentPasswordError(currentError);
    setNewPasswordError(newError);
    setConfirmPasswordError(confirmError);

    if (currentError || newError || confirmError) return;

    setSavingPassword(true);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      await apiClient.put(
        "/profile/password",
        {
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      setPasswordSubmitted(false);
      setCurrentPasswordError("");
      setNewPasswordError("");
      setConfirmPasswordError("");

      showMessage(
        "Password Updated",
        "Your password has been changed successfully."
      );
    } catch (error) {
      showMessage(
        "Update Failed",
        error.response?.data?.error || "Could not update your password."
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Admin_Layout>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrap}>
          <FormSection
            icon="person-circle-outline"
            title="Edit Profile Details"
            description="Update the basic information shown on your admin account."
          >
            <View style={styles.inputGrid}>
              <InputField
                label="First Name"
                value={profile.firstName}
                onChangeText={(text) =>
                  setProfile({ ...profile, firstName: text })
                }
                placeholder="Enter first name"
                icon="person-outline"
              />

              <InputField
                label="Middle Name"
                value={profile.middleName}
                onChangeText={(text) =>
                  setProfile({ ...profile, middleName: text })
                }
                placeholder="Enter middle name"
                icon="person-outline"
              />

              <InputField
                label="Last Name"
                value={profile.lastName}
                onChangeText={(text) =>
                  setProfile({ ...profile, lastName: text })
                }
                placeholder="Enter last name"
                icon="person-outline"
              />

              <InputField
                label="Full Name"
                value={fullName}
                placeholder="Auto-generated from name parts"
                icon="badge-outline"
                editable={false}
              />

              <InputField
                label="Username"
                value={profile.username}
                onChangeText={(text) =>
                  setProfile({ ...profile, username: text })
                }
                placeholder="Enter username"
                icon="at-outline"
              />

              <InputField
                label="Phone Number"
                value={profile.phone}
                onChangeText={(text) =>
                  setProfile({ ...profile, phone: digitsOnly(text) })
                }
                placeholder="Enter 11-digit phone number"
                keyboardType="phone-pad"
                icon="call-outline"
              />

              <InputField
                label="Department"
                value={profile.department}
                onChangeText={(text) =>
                  setProfile({ ...profile, department: text })
                }
                placeholder="Enter department"
                icon="business-outline"
              />
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!profileDirty || savingProfile) && styles.saveButtonDisabled,
                ]}
                onPress={handleProfileSave}
                disabled={!profileDirty || savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Ionicons name="save-outline" size={18} color={COLORS.white} />
                )}
                <Text style={styles.saveButtonText}>
                  {savingProfile ? "Saving..." : "Save Profile"}
                </Text>
              </TouchableOpacity>
            </View>
          </FormSection>

          <FormSection
            icon="mail-outline"
            title="Change Email"
            description="Use a valid email address that you can access."
          >
            <View style={styles.inputGrid}>
              <InputField
                label="Current Email"
                value={emailData.currentEmail}
                onChangeText={(text) =>
                  setEmailData({ ...emailData, currentEmail: text })
                }
                placeholder="Current email"
                keyboardType="email-address"
                icon="mail-open-outline"
              />

              <InputField
                label="New Email"
                value={emailData.newEmail}
                onChangeText={(text) =>
                  setEmailData({ ...emailData, newEmail: text })
                }
                placeholder="Enter new email"
                keyboardType="email-address"
                icon="mail-outline"
              />

              <InputField
                label="Confirm New Email"
                value={emailData.confirmEmail}
                onChangeText={(text) =>
                  setEmailData({ ...emailData, confirmEmail: text })
                }
                placeholder="Confirm new email"
                keyboardType="email-address"
                icon="checkmark-circle-outline"
              />
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!emailReady || savingEmail) && styles.saveButtonDisabled,
                ]}
                onPress={handleEmailSave}
                disabled={!emailReady || savingEmail}
              >
                {savingEmail ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Ionicons name="mail-outline" size={18} color={COLORS.white} />
                )}
                <Text style={styles.saveButtonText}>
                  {savingEmail ? "Updating..." : "Update Email"}
                </Text>
              </TouchableOpacity>
            </View>
          </FormSection>

          <FormSection
            icon="lock-closed-outline"
            title="Change Password"
            description="Choose a new password to secure your admin account."
          >
            <View style={styles.inputGrid}>
              <InputField
                label="Current Password"
                value={passwordData.currentPassword}
                onChangeText={(text) =>
                  updatePasswordField("currentPassword", text)
                }
                placeholder="Enter current password"
                secureTextEntry
                icon="key-outline"
                error={currentPasswordError}
              />

              <InputField
                label="New Password"
                value={passwordData.newPassword}
                onChangeText={(text) => updatePasswordField("newPassword", text)}
                placeholder="Enter new password"
                secureTextEntry
                icon="lock-closed-outline"
                error={newPasswordError}
              />

              <InputField
                label="Confirm New Password"
                value={passwordData.confirmPassword}
                onChangeText={(text) =>
                  updatePasswordField("confirmPassword", text)
                }
                placeholder="Confirm new password"
                secureTextEntry
                icon="shield-checkmark-outline"
                error={confirmPasswordError}
              />
            </View>

            <View style={styles.passwordNote}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={COLORS.primary}
              />
              <Text style={styles.passwordNoteText}>
                Password must be 8 to 16 characters with at least one uppercase
                letter, one number, and one special character.
              </Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!passwordReady || savingPassword) && styles.saveButtonDisabled,
                ]}
                onPress={handlePasswordSave}
                disabled={!passwordReady || savingPassword}
              >
                {savingPassword ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={COLORS.white}
                  />
                )}
                <Text style={styles.saveButtonText}>
                  {savingPassword ? "Updating..." : "Update Password"}
                </Text>
              </TouchableOpacity>
            </View>
          </FormSection>
        </View>
      </ScrollView>
    </Admin_Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    paddingBottom: 30,
  },

  contentWrap: {
    width: "100%",
  },

  pageHeader: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 18,
    padding: 22,
    marginBottom: 16,
  },

  pageTitle: {
    fontSize: 24,
    color: COLORS.primary,
    fontFamily: "PoppinsSemiBold",
    marginBottom: 6,
  },

  pageSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontFamily: "PoppinsRegular",
    lineHeight: 21,
  },

  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 16,
  },

  infoCard: {
    flex: 1,
    minWidth: 230,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
  },

  infoIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  infoTextWrap: {
    flex: 1,
  },

  infoTitle: {
    fontSize: 15,
    color: COLORS.text,
    fontFamily: "PoppinsSemiBold",
    marginBottom: 5,
  },

  infoDescription: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: "PoppinsRegular",
    lineHeight: 19,
  },

  sectionCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 16,
  },

  sectionHeader: {
    backgroundColor: COLORS.surfaceSoft,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryBorder,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  sectionTextWrap: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 17,
    fontFamily: "PoppinsSemiBold",
    color: COLORS.primary,
    marginBottom: 4,
  },

  sectionDescription: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: "PoppinsRegular",
    lineHeight: 19,
  },

  formContent: {
    padding: 20,
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
    fontFamily: "PoppinsMedium",
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
    fontFamily: "PoppinsRegular",
    outlineStyle: Platform.OS === "web" ? "none" : undefined,
  },

  eyeButton: {
    marginLeft: 8,
    padding: 4,
  },

  inputWrapError: {
    borderColor: "#C0392B",
  },

  inputWrapDisabled: {
    backgroundColor: "#EDF1F8",
  },

  fieldErrorText: {
    width: "100%",
    color: "#C0392B",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "PoppinsRegular",
    marginTop: 6,
    paddingHorizontal: 2,
  },

  passwordNote: {
    marginTop: 14,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  passwordNoteText: {
    flex: 1,
    marginLeft: 8,
    color: COLORS.primary,
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    lineHeight: 19,
  },

  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 18,
  },

  saveButton: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  saveButtonDisabled: {
    opacity: 0.45,
  },

  saveButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
  },
});