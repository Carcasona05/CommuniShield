import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Switch,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";

import SAdmin_Layout from "../../components/SAdmin_Compo/SAdmin_Layout";
import { SettingsSkeleton } from "../../components/PageSkeletons";
import { saveAdminInfo } from "../../services/auth";
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
import { useToast } from "../../components/Toast";
import ConfirmModal from "../../components/modals/ConfirmModal";
import QueryErrorNotice from "../../components/QueryErrorNotice";
import useSystemSettingsSave from "../../hooks/useSystemSettingsSave";

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

function StatusBadge({ label, tone = "primary" }) {
  const toneMap = {
    primary: {
      backgroundColor: "#EAF2FF",
      color: "#294880",
    },
    success: {
      backgroundColor: "#EAF8F1",
      color: "#22A06B",
    },
    warning: {
      backgroundColor: "#FFF4E5",
      color: "#C98A2E",
    },
    danger: {
      backgroundColor: "#FFF5F5",
      color: "#E45757",
    },
  };

  const style = toneMap[tone] || toneMap.primary;

  return (
    <View style={[styles.statusBadge, { backgroundColor: style.backgroundColor }]}>
      <Text style={[styles.statusBadgeText, { color: style.color }]}>
        {label}
      </Text>
    </View>
  );
}

function SummaryCard({ icon, title, value, subtext, tone = "primary" }) {
  const iconBg =
    tone === "success"
      ? "#EAF8F1"
      : tone === "warning"
      ? "#FFF4E5"
      : tone === "danger"
      ? "#FFF5F5"
      : "#EAF2FF";

  const iconColor =
    tone === "success"
      ? "#22A06B"
      : tone === "warning"
      ? "#C98A2E"
      : tone === "danger"
      ? "#E45757"
      : "#294880";

  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>

      <View style={styles.summaryTextWrap}>
        <Text style={styles.summaryTitle}>{title}</Text>

        <View style={styles.summaryValueRow}>
          <Text style={styles.summaryValue}>{value}</Text>
          <Text style={[styles.summarySubtext, { color: iconColor }]}>
            {subtext}
          </Text>
        </View>
      </View>
    </View>
  );
}

function SettingRow({ icon, title, description, rightContent, saveState, isLast = false }) {
  return (
    <View style={[styles.settingRow, !isLast && styles.settingRowBorder]}>
      <View style={styles.settingLeft}>
        <View style={styles.settingIconWrap}>
          <Ionicons name={icon} size={18} color="#294880" />
        </View>

        <View style={styles.settingTextWrap}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingDescription}>{description}</Text>
        </View>
      </View>

      <View style={styles.settingRight}>
        {rightContent}
        {!!saveState && <Text accessibilityLiveRegion="polite" style={[styles.saveState, saveState === "error" && styles.saveError]}>
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}
        </Text>}
      </View>
    </View>
  );
}

export default function SAdmin_Settings() {
  return (
    <SAdmin_Layout>
      <SAdmin_SettingsContent />
    </SAdmin_Layout>
  );
}

function SAdmin_SettingsContent() {
  const toast = useToast();
  const [loading, setLoading] = useState(() => getCache("api:/profile") === undefined);

  const [nameParts, setNameParts] = useState(() => {
    const cached = getCache("api:/profile");
    const legacyName = cached?.name || cached?.fullname || "CommuniShield SuperAdmin";
    return {
      firstName: cached?.first_name || legacyName,
      middleName: cached?.middle_name || "",
      lastName: cached?.last_name || "",
    };
  });
  const [emailAddress, setEmailAddress] = useState(
    () => getCache("api:/profile")?.email || ""
  );
  const [phoneNumber, setPhoneNumber] = useState(
    () => getCache("api:/profile")?.phone || ""
  );

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmNewPasswordError, setConfirmNewPasswordError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleCurrentPasswordChange = (value) => {
    setCurrentPassword(value);
    if (passwordSubmitted) {
      setCurrentPasswordError(validateCurrentPassword(value));
    }
  };

  const handleNewPasswordChange = (value) => {
    setNewPassword(value);
    if (passwordSubmitted) {
      setNewPasswordError(validateNewPassword(value));
      setConfirmNewPasswordError(validateConfirmPassword(value, confirmNewPassword));
    }
  };

  const handleConfirmNewPasswordChange = (value) => {
    setConfirmNewPassword(value);
    if (passwordSubmitted) {
      setConfirmNewPasswordError(validateConfirmPassword(newPassword, value));
    }
  };

  const { values, status: saveStates, ready: settingsReady, saveSetting, hydrateSettings, settingsRevision } = useSystemSettingsSave(toast);
  const aiCredibilityEnabled = values.ai_scoring_enabled === "true";
  const localModelEnabled = values.sentiment_local_model_enabled === "true";
  const geminiEnabled = values.sentiment_gemini_enabled === "true";
  const cebuanoMode = values.sentiment_cebuano_mode;
  const [settingsLoadError, setSettingsLoadError] = useState("");
  const [initialEmail, setInitialEmail] = useState(
    () => getCache("api:/profile")?.email || ""
  );

  const initialProfileRef = useRef({
    firstName:
      getCache("api:/profile")?.first_name ||
      getCache("api:/profile")?.name ||
      getCache("api:/profile")?.fullname ||
      "CommuniShield SuperAdmin",
    middleName: getCache("api:/profile")?.middle_name || "",
    lastName: getCache("api:/profile")?.last_name || "",
    email: getCache("api:/profile")?.email || "",
    phone: getCache("api:/profile")?.phone || "",
  });

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadAccountData = useCallback(async () => {
    const revision = settingsRevision();
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cachedProfile = getCache("api:/profile");
      if (cachedProfile) {
        const cachedParts = {
          firstName:
            cachedProfile.first_name ||
            cachedProfile.name ||
            cachedProfile.fullname ||
            "CommuniShield SuperAdmin",
          middleName: cachedProfile.middle_name || "",
          lastName: cachedProfile.last_name || "",
        };
        setNameParts(cachedParts);
        setEmailAddress(cachedProfile.email || "");
        setPhoneNumber(cachedProfile.phone || "");
        setInitialEmail(cachedProfile.email || "");
        initialProfileRef.current = {
          ...cachedParts,
          email: cachedProfile.email || "",
          phone: cachedProfile.phone || "",
        };
      }

      const cachedSettings = getCache("api:/admin/settings");
      if (cachedSettings?.settings) {
        hydrateSettings(cachedSettings.settings, revision);
      }

      const [profileRes, settingsRes] = await Promise.all([
        apiClient.get("/profile", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        apiClient.get("/admin/settings", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const profile = profileRes.data ?? {};
      setCache("api:/profile", profile);
      const serverParts = {
        firstName:
          profile.first_name ||
          profile.name ||
          profile.fullname ||
          "CommuniShield SuperAdmin",
        middleName: profile.middle_name || "",
        lastName: profile.last_name || "",
      };
      setNameParts(serverParts);
      setEmailAddress(profile.email || "");
      setPhoneNumber(profile.phone || "");
      setInitialEmail(profile.email || "");
      initialProfileRef.current = {
        ...serverParts,
        email: profile.email || "",
        phone: profile.phone || "",
      };

      const settingsData = settingsRes.data ?? {};
      const settings = settingsData.settings ?? {};
      if (hydrateSettings(settings, revision)) setCache("api:/admin/settings", settingsData);
      setSettingsLoadError("");
    } catch {
      setSettingsLoadError("Could not refresh account settings. Retry to load the saved configuration.");
    } finally {
      setLoading(false);
    }
  }, [hydrateSettings, settingsRevision]);

  useAutoRefresh(loadAccountData, 60000);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  const confirmToggleOff = useCallback((label, currentValue, key) => {
    if (currentValue) {
      setConfirmData({ label, key });
      setConfirmVisible(true);
    } else {
      void saveSetting(key, true);
    }
  }, [saveSetting]);

  const handleConfirmToggle = () => {
    if (confirmData) {
      void saveSetting(confirmData.key, false);
      setConfirmVisible(false);
      setConfirmData(null);
    }
  };

  if (!fontsLoaded) {
    return null;
  }

  if (loading) {
    return <SettingsSkeleton />;
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

  const fullName = joinFullName(nameParts);

  const profileDirty =
    nameParts.firstName.trim() !== initialProfileRef.current.firstName.trim() ||
    nameParts.middleName.trim() !==
      initialProfileRef.current.middleName.trim() ||
    nameParts.lastName.trim() !== initialProfileRef.current.lastName.trim() ||
    emailAddress.trim().toLowerCase() !==
      initialProfileRef.current.email.trim().toLowerCase() ||
    phoneNumber.trim() !== initialProfileRef.current.phone.trim();

  const passwordReady = Boolean(
    currentPassword && newPassword && confirmNewPassword
  );

  const handleSaveProfile = async () => {
    if (
      !nameParts.firstName.trim() ||
      !nameParts.lastName.trim() ||
      !emailAddress.trim() ||
      !phoneNumber.trim()
    ) {
      showMessage("Missing Information", "Please fill in all profile fields.");
      return;
    }

    if (!isValidEmail(emailAddress)) {
      showMessage("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (!isValidPhone(phoneNumber)) {
      showMessage("Invalid Phone Number", "Phone number must be exactly 11 digits.");
      return;
    }

    setSavingProfile(true);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const changes = [
        apiClient.put(
          "/profile",
          {
            first_name: nameParts.firstName.trim(),
            middle_name: nameParts.middleName.trim(),
            last_name: nameParts.lastName.trim(),
            phone: phoneNumber.trim(),
          },
          { headers: { Authorization: `Bearer ${token}` } }
        ),
      ];

      const cleanEmail = emailAddress.trim().toLowerCase();

      if (initialEmail && cleanEmail !== initialEmail.toLowerCase()) {
        changes.push(
          apiClient.put(
            "/profile/email",
            { currentEmail: initialEmail, newEmail: cleanEmail },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
      }

      await Promise.all(changes);

      const cleanParts = {
        firstName: nameParts.firstName.trim(),
        middleName: nameParts.middleName.trim(),
        lastName: nameParts.lastName.trim(),
      };
      const cachedProfile = getCache("api:/profile");
      setCache("api:/profile", {
        ...(cachedProfile || {}),
        name: joinFullName(cleanParts),
        fullname: joinFullName(cleanParts),
        first_name: cleanParts.firstName,
        middle_name: cleanParts.middleName,
        last_name: cleanParts.lastName,
        phone: phoneNumber.trim(),
      });

      saveAdminInfo({
        ...(globalThis.adminAccount || {}),
        fullName: joinFullName(cleanParts),
        email: cleanEmail,
        phone: phoneNumber.trim(),
        role: "SuperAdmin",
      });

      setInitialEmail(cleanEmail);
      initialProfileRef.current = {
        ...cleanParts,
        email: cleanEmail,
        phone: phoneNumber.trim(),
      };

      showMessage(
        "Profile Updated",
        "Your SuperAdmin profile information has been updated."
      );
    } catch (error) {
      showMessage(
        "Update Failed",
        error.response?.data?.error || "Could not update your profile."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordSubmitted(true);

    const currentError = validateCurrentPassword(currentPassword);
    const newError = validateNewPassword(newPassword);
    const confirmError = validateConfirmPassword(newPassword, confirmNewPassword);

    setCurrentPasswordError(currentError);
    setNewPasswordError(newError);
    setConfirmNewPasswordError(confirmError);

    if (currentError || newError || confirmError) return;

    setSavingPassword(true);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      await apiClient.put(
        "/profile/password",
        { currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      saveAdminInfo({
        ...(globalThis.adminAccount || {}),
        password: newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");

      setPasswordSubmitted(false);
      setCurrentPasswordError("");
      setNewPasswordError("");
      setConfirmNewPasswordError("");

      showMessage("Password Updated", "Your SuperAdmin password has been changed.");
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
    <View style={styles.mainWrapper}>
      <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentWrap}>
            <View style={styles.leftSection}>
              <QueryErrorNotice message={settingsLoadError} onRetry={loadAccountData} hasData={settingsReady} />
              {!settingsReady && !settingsLoadError ? <Text style={styles.saveState}>Loading saved settings…</Text> : null}
              <View style={styles.summaryRow}>
                <SummaryCard
                  icon="person-circle-outline"
                  title="Profile"
                  value="Active"
                  subtext="SuperAdmin"
                />

                <SummaryCard
                  icon="hardware-chip-outline"
                  title="AI Analysis"
                  value={aiCredibilityEnabled ? "Enabled" : "Off"}
                  subtext="Validation"
                  tone={aiCredibilityEnabled ? "success" : "danger"}
                />

                <SummaryCard
                  icon="hardware-chip-outline"
                  title="Local Sentiment"
                  value={localModelEnabled ? "Enabled" : "Off"}
                  subtext="Server"
                />

                <SummaryCard
                  icon="cloud-outline"
                  title="Gemini Sentiment"
                  value={geminiEnabled ? "Enabled" : "Off"}
                  subtext="Cloud"
                />
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>
                      SuperAdmin Profile Settings
                    </Text>
                    <Text style={styles.sectionDescription}>
                      Update your own SuperAdmin name, email address, and phone
                      number.
                    </Text>
                  </View>

                  <StatusBadge label="Account Owner" tone="primary" />
                </View>

                <View style={styles.profileGrid}>
                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>First Name</Text>
                    <TextInput
                      value={nameParts.firstName}
                      onChangeText={(text) =>
                        setNameParts((prev) => ({ ...prev, firstName: text }))
                      }
                      style={styles.textInput}
                      placeholder="First Name"
                      placeholderTextColor="#5D6F92"
                    />
                  </View>

                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Middle Name</Text>
                    <TextInput
                      value={nameParts.middleName}
                      onChangeText={(text) =>
                        setNameParts((prev) => ({ ...prev, middleName: text }))
                      }
                      style={styles.textInput}
                      placeholder="Middle Name"
                      placeholderTextColor="#5D6F92"
                    />
                  </View>

                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Last Name</Text>
                    <TextInput
                      value={nameParts.lastName}
                      onChangeText={(text) =>
                        setNameParts((prev) => ({ ...prev, lastName: text }))
                      }
                      style={styles.textInput}
                      placeholder="Last Name"
                      placeholderTextColor="#5D6F92"
                    />
                  </View>

                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Full Name</Text>
                    <TextInput
                      value={fullName}
                      style={[styles.textInput, styles.textInputDisabled]}
                      placeholder="Auto-generated from name parts"
                      placeholderTextColor="#5D6F92"
                      editable={false}
                    />
                  </View>

                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Email Address</Text>
                    <TextInput
                      value={emailAddress}
                      onChangeText={setEmailAddress}
                      style={styles.textInput}
                      placeholder="Email Address"
                      placeholderTextColor="#5D6F92"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Phone Number</Text>
                    <TextInput
                      value={phoneNumber}
                      onChangeText={(text) => setPhoneNumber(digitsOnly(text))}
                      style={styles.textInput}
                      placeholder="Enter 11-digit phone number"
                      placeholderTextColor="#5D6F92"
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>

                <View style={styles.profileActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.primaryActionButton,
                      (!profileDirty || savingProfile) &&
                        styles.primaryActionButtonDisabled,
                    ]}
                    onPress={handleSaveProfile}
                    disabled={!profileDirty || savingProfile}
                    activeOpacity={0.85}
                  >
                    {savingProfile ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="save-outline" size={17} color="#FFFFFF" />
                    )}
                    <Text style={styles.primaryActionButtonText}>
                      {savingProfile ? "Saving..." : "Save Profile"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>Change Password</Text>
                    <Text style={styles.sectionDescription}>
                      Update your SuperAdmin password for account security.
                    </Text>
                  </View>

                  <StatusBadge label="Secure" tone="success" />
                </View>

                <View style={styles.profileGrid}>
                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Current Password</Text>

                    <View
                      style={[
                        styles.passwordInputWrap,
                        currentPasswordError && styles.passwordInputWrapError,
                      ]}
                    >
                      <TextInput
                        value={currentPassword}
                        onChangeText={handleCurrentPasswordChange}
                        style={styles.passwordInput}
                        placeholder="Current Password"
                        placeholderTextColor="#5D6F92"
                        secureTextEntry
                      />
                    </View>
                    {currentPasswordError ? (
                      <Text style={styles.fieldErrorText}>
                        {currentPasswordError}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>New Password</Text>

                    <View
                      style={[
                        styles.passwordInputWrap,
                        newPasswordError && styles.passwordInputWrapError,
                      ]}
                    >
                      <TextInput
                        value={newPassword}
                        onChangeText={handleNewPasswordChange}
                        style={styles.passwordInput}
                        placeholder="New Password"
                        placeholderTextColor="#5D6F92"
                        secureTextEntry={!showNewPassword}
                      />

                      <TouchableOpacity
                        onPress={() => setShowNewPassword(!showNewPassword)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                          size={20}
                          color="#5D6F92"
                        />
                      </TouchableOpacity>
                    </View>
                    {newPasswordError ? (
                      <Text style={styles.fieldErrorText}>{newPasswordError}</Text>
                    ) : null}
                  </View>

                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Confirm New Password</Text>

                    <View
                      style={[
                        styles.passwordInputWrap,
                        confirmNewPasswordError &&
                          styles.passwordInputWrapError,
                      ]}
                    >
                      <TextInput
                        value={confirmNewPassword}
                        onChangeText={handleConfirmNewPasswordChange}
                        style={styles.passwordInput}
                        placeholder="Confirm New Password"
                        placeholderTextColor="#5D6F92"
                        secureTextEntry={!showConfirmNewPassword}
                      />

                      <TouchableOpacity
                        onPress={() =>
                          setShowConfirmNewPassword(!showConfirmNewPassword)
                        }
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={
                            showConfirmNewPassword
                              ? "eye-off-outline"
                              : "eye-outline"
                          }
                          size={20}
                          color="#5D6F92"
                        />
                      </TouchableOpacity>
                    </View>
                    {confirmNewPasswordError ? (
                      <Text style={styles.fieldErrorText}>
                        {confirmNewPasswordError}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.passwordPolicyHint}>
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color="#294880"
                  />
                  <Text style={styles.passwordPolicyHintText}>
                    Password must be 8 to 16 characters with at least one
                    uppercase letter, one number, and one special character.
                  </Text>
                </View>

                <View style={styles.profileActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.primaryActionButton,
                      (!passwordReady || savingPassword) &&
                        styles.primaryActionButtonDisabled,
                    ]}
                    onPress={handleChangePassword}
                    disabled={!passwordReady || savingPassword}
                    activeOpacity={0.85}
                  >
                    {savingPassword ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons
                        name="lock-closed-outline"
                        size={17}
                        color="#FFFFFF"
                      />
                    )}
                    <Text style={styles.primaryActionButtonText}>
                      {savingPassword ? "Updating..." : "Update Password"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>
                      AI Credibility Analysis
                    </Text>
                    <Text style={styles.sectionDescription}>
                      Control new AI credibility scores and written reviews.
                      Existing results and manual verification are unchanged.
                    </Text>
                  </View>

                  <StatusBadge
                    label={aiCredibilityEnabled ? "AI Enabled" : "AI Disabled"}
                    tone={aiCredibilityEnabled ? "success" : "danger"}
                  />
                </View>

                <SettingRow
                  icon="analytics-outline"
                  title="Enable AI Credibility Analysis"
                  description="Generate both a credibility score and an AI review. Disabling skips new analyses; requests already running may finish."
                  saveState={saveStates.ai_scoring_enabled}
                  isLast
                  rightContent={
                    <Switch
                      value={aiCredibilityEnabled}
                      disabled={!settingsReady || saveStates.ai_scoring_enabled === "saving"}
                      onValueChange={() =>
                        confirmToggleOff(
                          "AI Credibility Analysis",
                          aiCredibilityEnabled,
                          "ai_scoring_enabled"
                        )
                      }
                      trackColor={{ false: "#D9E2F0", true: "#BFD4FF" }}
                      thumbColor={aiCredibilityEnabled ? "#294880" : "#FFFFFF"}
                    />
                  }
                />

              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>
                      Sentiment Analysis
                    </Text>
                    <Text style={styles.sectionDescription}>
                      Control the providers used for report and comment
                      sentiment classification.
                    </Text>
                  </View>

                  <StatusBadge
                    label={
                      localModelEnabled || geminiEnabled
                        ? "Providers Active"
                        : "Providers Disabled"
                    }
                    tone={
                      localModelEnabled || geminiEnabled ? "success" : "danger"
                    }
                  />
                </View>

                <SettingRow
                  icon="hardware-chip-outline"
                  title="Local Sentiment Model"
                  description="Use server-side local sentiment models. Cebuano also follows the handling mode below."
                  saveState={saveStates.sentiment_local_model_enabled}
                  rightContent={
                    <Switch
                      value={localModelEnabled}
                      disabled={!settingsReady || saveStates.sentiment_local_model_enabled === "saving"}
                      onValueChange={() =>
                        confirmToggleOff(
                          "Local Sentiment Model",
                          localModelEnabled,
                          "sentiment_local_model_enabled"
                        )
                      }
                      trackColor={{ false: "#D9E2F0", true: "#BFD4FF" }}
                      thumbColor={localModelEnabled ? "#294880" : "#FFFFFF"}
                    />
                  }
                />

                <SettingRow
                  icon="cloud-outline"
                  title="Gemini Sentiment"
                  description={cebuanoMode === "gemini" && !geminiEnabled
                    ? "Gemini is off. Cebuano is in Gemini-only mode and cannot be analyzed until Gemini is enabled or its handling mode is changed."
                    : "Use Gemini for sentiment when configured. Local and cloud results follow the existing confidence policy."}
                  saveState={saveStates.sentiment_gemini_enabled}
                  rightContent={
                    <Switch
                      value={geminiEnabled}
                      disabled={!settingsReady || saveStates.sentiment_gemini_enabled === "saving"}
                      onValueChange={() =>
                        confirmToggleOff(
                          "Gemini Sentiment",
                          geminiEnabled,
                          "sentiment_gemini_enabled"
                        )
                      }
                      trackColor={{ false: "#D9E2F0", true: "#BFD4FF" }}
                      thumbColor={geminiEnabled ? "#294880" : "#FFFFFF"}
                    />
                  }
                />

                <SettingRow
                  icon="language-outline"
                  title="Cebuano Handling"
                  description={
                    cebuanoMode === "disabled"
                      ? "Cebuano text is marked unavailable instead of analyzed."
                      : cebuanoMode === "local"
                         ? "Use the local Cebuano model when enabled; Gemini may also participate when enabled."
                         : "Gemini only. Requires Gemini Sentiment and a configured API key; the local Cebuano model is not used."
                  }
                  isLast
                  saveState={saveStates.sentiment_cebuano_mode}
                  rightContent={
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      activeOpacity={0.85}
                      disabled={!settingsReady || saveStates.sentiment_cebuano_mode === "saving"}
                      onPress={() => {
                        const next = cebuanoMode === "gemini" ? "local" : cebuanoMode === "local" ? "disabled" : "gemini";
                        void saveSetting("sentiment_cebuano_mode", next);
                      }}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {cebuanoMode === "disabled"
                          ? "Disabled"
                          : cebuanoMode === "local"
                            ? "Local"
                            : "Gemini"}
                      </Text>
                    </TouchableOpacity>
                  }
                />
              </View>

            </View>

            <View style={styles.rightSection}>
              <View style={styles.sideCard}>
                <Text style={styles.sideCardTitle}>Settings Overview</Text>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownText}>Profile Settings</Text>
                  <Text style={styles.breakdownCount}>3</Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownText}>Password Fields</Text>
                  <Text style={styles.breakdownCount}>3</Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownText}>AI Credibility Analysis</Text>
                  <Text style={styles.breakdownCount}>1</Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownText}>Sentiment Controls</Text>
                  <Text style={styles.breakdownCount}>3</Text>
                </View>
              </View>

              <View style={styles.sideCard}>
                <Text style={styles.sideCardTitle}>Configuration Notes</Text>

                <View style={styles.notesContent}>
                  <Text style={styles.notesHeading}>This page is for</Text>
                  <Text style={styles.notesText}>
                    • SuperAdmin own profile{"\n"}
                    • Change own password{"\n"}
                    • Enable or disable AI scores and reviews{"\n"}
                    • Choose sentiment providers{"\n"}
                    • Set Cebuano handling
                  </Text>

                  <Text style={[styles.notesHeading, styles.notesHeadingSpacing]}>
                    Not included here
                  </Text>
                  <Text style={styles.notesText}>
                    Admin account listing, adding, editing, and deleting should be
                    handled in the Admin Accounts page to avoid duplicate sections.
                  </Text>
                </View>
              </View>

              <View style={styles.sideCard}> 
                <Text style={styles.sideCardTitle}>Security Reminder</Text>

                <View style={styles.notesContent}>
                  <Text style={styles.notesText}>
                    Use your current password to authorize a password change.
                    Keep account credentials private.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>

      <ConfirmModal
        visible={confirmVisible}
        onClose={() => {
          setConfirmVisible(false);
          setConfirmData(null);
        }}
        onConfirm={handleConfirmToggle}
        title={`Turn off ${confirmData?.label || ""}?`}
        message={`Are you sure you want to disable ${confirmData?.label || ""}?`}
        confirmLabel="Turn Off"
        icon="power-outline"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  saveState: { fontFamily: "PoppinsRegular", fontSize: 11, color: "#40516F", paddingTop: 3 },
  saveError: { color: "#B93838" },
  mainWrapper: {
    flex: 1,
    backgroundColor: "#F5F8FC",
  },

  container: {
    flex: 1,
    backgroundColor: "#F5F8FC",
  },

  scrollContent: {
    paddingBottom: 30,
  },

  contentWrap: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },

  leftSection: {
    flex: 1,
    minWidth: 0,
  },

  rightSection: {
    width: 300,
    gap: 14,
  },

  pageHeader: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 18,
    padding: 22,
    marginBottom: 16,
  },

  pageTitle: {
    fontSize: 24,
    color: "#294880",
    fontFamily: "PoppinsSemiBold",
    marginBottom: 6,
  },

  pageSubtitle: {
    fontSize: 14,
    color: "#5D6F92",
    fontFamily: "PoppinsRegular",
    lineHeight: 21,
  },

  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 16,
  },

  summaryCard: {
    flex: 1,
    minWidth: 210,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  summaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  summaryTextWrap: {
    flex: 1,
  },

  summaryTitle: {
    fontSize: 14,
    color: "#5D6F92",
    marginBottom: 6,
    fontFamily: "PoppinsMedium",
  },

  summaryValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
  },

  summaryValue: {
    fontSize: 21,
    fontFamily: "PoppinsSemiBold",
    color: "#2F4267",
  },

  summarySubtext: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
  },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },

  sectionHeader: {
    minHeight: 72,
    borderBottomWidth: 1,
    borderBottomColor: "#D9E2F0",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#F7F9FD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  sectionHeaderText: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
    marginBottom: 4,
  },

  sectionDescription: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    lineHeight: 19,
  },

  profileGrid: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
    padding: 20,
    paddingBottom: 10,
  },

  profileActionRow: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "flex-end",
  },

  primaryActionButton: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#294880",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  primaryActionButtonDisabled: {
    opacity: 0.45,
  },

  primaryActionButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "PoppinsMedium",
  },

  passwordPolicyHint: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: "#EAF2FF",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  passwordPolicyHintText: {
    flex: 1,
    marginLeft: 8,
    color: "#294880",
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    lineHeight: 19,
  },

  secondaryButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: "#294880",
    fontSize: 13,
    fontFamily: "PoppinsMedium",
  },

  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    alignSelf: "flex-start",
  },

  statusBadgeText: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
  },

  settingRow: {
    minHeight: 76,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    backgroundColor: "#FFFFFF",
  },

  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#E4EAF3",
  },

  settingLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  settingIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  settingTextWrap: {
    flex: 1,
  },

  settingTitle: {
    fontSize: 14,
    fontFamily: "PoppinsMedium",
    color: "#2F4267",
    marginBottom: 4,
  },

  settingDescription: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    lineHeight: 19,
  },

  settingRight: {
    alignItems: "flex-end",
    justifyContent: "center",
  },

  inputGrid: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
    padding: 20,
  },

  inputCard: {
    flex: 1,
    minWidth: 240,
  },

  inputLabel: {
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: "#2F4267",
    marginBottom: 8,
  },

  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    backgroundColor: "#F7F9FD",
    paddingHorizontal: 14,
    color: "#2F4267",
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    outlineStyle: Platform.OS === "web" ? "none" : undefined,
  },

  textInputDisabled: {
    backgroundColor: "#EDF1F8",
    color: "#5D6F92",
  },

  passwordInputWrap: {
    height: 44,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    backgroundColor: "#F7F9FD",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  passwordInputWrapError: {
    borderColor: "#C0392B",
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

  passwordInput: {
    flex: 1,
    height: "100%",
    color: "#2F4267",
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    outlineStyle: Platform.OS === "web" ? "none" : undefined,
  },

  categoryList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 20,
  },

  categoryTag: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#EAF2FF",
  },

  categoryTagText: {
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: "#294880",
  },

  footerActions: {
    marginTop: 4,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },

  resetButton: {
    height: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  resetButtonText: {
    color: "#2F4267",
    fontSize: 14,
    fontFamily: "PoppinsMedium",
  },

  saveButton: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#294880",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
  },

  sideCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 14,
    overflow: "hidden",
  },

  sideCardTitle: {
    fontSize: 15,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#D9E2F0",
    backgroundColor: "#F7F9FD",
  },

  breakdownRow: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: "#E4EAF3",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  breakdownText: {
    color: "#2F4267",
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    flex: 1,
    marginRight: 12,
  },

  breakdownCount: {
    color: "#294880",
    fontFamily: "PoppinsSemiBold",
    fontSize: 14,
  },

  notesContent: {
    padding: 18,
  },

  notesHeading: {
    color: "#2F4267",
    fontFamily: "PoppinsMedium",
    marginBottom: 8,
  },

  notesHeadingSpacing: {
    marginTop: 14,
  },

  notesText: {
    color: "#5D6F92",
    lineHeight: 21,
    fontSize: 13,
    fontFamily: "PoppinsRegular",
  },
});
