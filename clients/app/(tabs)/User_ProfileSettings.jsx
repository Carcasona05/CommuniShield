import React, { useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Text,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Dimensions,
  RefreshControl,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, router } from "expo-router";
import { profileDetailsMissing } from "../../services/profileDetailsValidation";
import { requestProfileDeviceLocation } from "../../services/profileDeviceLocation";
import CredibilityAccessPanel from "../../components/CredibilityAccessPanel";

import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import { ProfileFormSkeleton } from "../../components/PageSkeletons";
import Divboxwhite from "../../components/Divboxwhite";
import ThemedHeader from "../../components/ThemedHeader";
import apiClient from "../../services/apiClient";
import { getCache, setCache, clearProfileCache } from "../../services/dataStore";
import ToastProvider, { useToast } from "../../components/Toast";
import {
  digitsOnly,
  passwordPolicyError,
} from "../../services/validation";

const COMMUNISHIELD_BLUE = "#294880";
const MOBILE_FONT = Platform.select({ ios: "System", android: "sans-serif", default: "system-ui" });

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const scale = (size) => {
  const baseWidth = 375;
  return Math.round((Math.min(SCREEN_WIDTH, 430) / baseWidth) * size);
};

const scaleVertical = (size) => {
  const baseHeight = 667;
  return Math.round((SCREEN_HEIGHT / baseHeight) * size);
};

const moderateScale = (size, factor = 0.5) => {
  return Math.round(size + (scale(size) - size) * factor);
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

const credibilityLevels = [
  {
    label: "Suspended",
    color: "#6B7280",
    bg: "#F3F4F6",
  },
  {
    label: "At risk",
    color: "#EF4444",
    bg: "#FEE2E2",
  },
  {
    label: "Very Limited",
    color: "#F59E0B",
    bg: "#FEF3C7",
  },
  {
    label: "Limited",
    color: COMMUNISHIELD_BLUE,
    bg: "#E8EEF9",
  },
  {
    label: "All good",
    color: "#22C55E",
    bg: "#DCFCE7",
  },
];

const formatBirthdate = (date) => {
  if (!date) return "";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
};

const parseBirthdate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateString = (date) => {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const CredibilityScore = ({ statusIndex = 3 }) => {
  const safeIndex = Math.min(
    credibilityLevels.length - 1,
    Math.max(0, Number(statusIndex) || 0)
  );
  const scorePosition = Math.min(1, Math.max(0, safeIndex / (credibilityLevels.length - 1)));
  const lineWidthPercent = scorePosition * 80;
  const currentStatus = credibilityLevels[safeIndex];

  return (
    <Divboxwhite style={styles.credibilityCard}>
      <View style={styles.credibilityTop}>
        <View style={styles.credibilityIconBox}>
          <Ionicons
            name="shield-checkmark-outline"
            size={moderateScale(22)}
            color={COMMUNISHIELD_BLUE}
          />
        </View>

        <View style={styles.credibilityTextWrap}>
          <ThemedHeader style={styles.cardTitle}>
            Credibility Score
          </ThemedHeader>

          <ThemedText style={styles.credibilitySubtitle}>
            Your current account credibility level.
          </ThemedText>
        </View>

        <View
          style={[styles.currentBadge, { backgroundColor: currentStatus.bg }]}
        >
          <ThemedText
            style={[styles.currentBadgeText, { color: currentStatus.color }]}
          >
            {currentStatus.label}
          </ThemedText>
        </View>
      </View>

      <View style={styles.timelineWrapper}>
        <View style={styles.timelineLineBg} />

        <View
          style={[
            styles.timelineLineActive,
            {
              width: `${lineWidthPercent}%`,
              backgroundColor: currentStatus.color,
            },
          ]}
        />

        <View style={styles.timelineRow}>
          {credibilityLevels.map((item, index) => {
            const isActive = index === safeIndex;
            const isPassed = index < safeIndex;

            return (
              <View key={index} style={styles.timelineItem}>
                <View
                  style={[
                    styles.timelineDot,
                    {
                      backgroundColor:
                        isActive || isPassed ? item.color : "#D9E2F0",
                      borderColor:
                        isActive || isPassed ? item.color : "#C9D3E3",
                    },
                    isActive && styles.timelineDotActive,
                  ]}
                >
                  {isActive ? (
                    <Ionicons name="checkmark" size={moderateScale(14)} color="#FFFFFF" />
                  ) : null}
                </View>

                <ThemedText
                  style={[
                    styles.timelineLabel,
                    isActive && {
                      color: item.color,
                      fontFamily: "PoppinsSemiBold",
                    },
                  ]}
                >
                  {item.label}
                </ThemedText>
              </View>
            );
          })}
        </View>
      </View>
    </Divboxwhite>
  );
};

const buildProfileDetails = (profile) => {
  let credibilityStatus = 3;
  const rawStatus = Number(profile.credibility_status);
  if (Number.isFinite(rawStatus) && rawStatus >= 0 && rawStatus <= 4) {
    credibilityStatus = rawStatus;
  } else {
    console.warn(
      "[profile] credibility_status missing/invalid - restart the server so /profile returns it:",
      profile.credibility_status
    );
  }

  let credibilityScore = 60;
  const rawScore = Number(profile.credibility_score);
  if (Number.isFinite(rawScore)) {
    credibilityScore = Math.min(100, Math.max(0, rawScore));
  }

  return {
    firstName: profile.first_name ?? "",
    middleName: profile.middle_name ?? "",
    lastName: profile.last_name ?? "",
    username: profile.user_name ?? profile.name ?? "",
    birthdate: parseBirthdate(profile.birthdate),
    contactNumber: profile.phone ?? "",
    location: profile.location ?? "",
    locationConfirmed: profile.location_confirmed === true,
    email: profile.email ?? "",
    credibilityStatus,
    credibilityScore,
  };
};

const UserProfileSettingsWrapper = () => {
  return (
    <ToastProvider>
      <UserProfileSettings />
    </ToastProvider>
  );
};

const UserProfileSettings = () => {
  const toast = useToast();
  const params = useLocalSearchParams();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [deviceCoordinates, setDeviceCoordinates] = useState(null);
  const [showLocationConsent, setShowLocationConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const locationLock = useRef(false);
  const [loading, setLoading] = useState(() => getCache("api:/profile") === undefined);
  const [profileLoadError, setProfileLoadError] = useState("");

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [editMode, setEditMode] = useState(false);
  const [passwordEditMode, setPasswordEditMode] = useState(false);
  const [showBirthdatePicker, setShowBirthdatePicker] = useState(false);

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [termsStatus, setTermsStatus] = useState({
    hasAcceptedLatest: true,
    acceptedVersion: null,
    latestVersion: "1.0",
    acceptedAt: null,
  });

  const [userDetails, setUserDetails] = useState(() => {
    const defaults = {
      firstName: "",
      middleName: "",
      lastName: "",
      username: "",
      birthdate: null,
      contactNumber: "",
      location: "",
      locationConfirmed: false,
      email: "",
      credibilityStatus: 3,
      credibilityScore: 60,
    };
    const cached = getCache("api:/profile");
    return cached !== undefined
      ? { ...defaults, ...buildProfileDetails(cached) }
      : defaults;
  });

  const [tempDetails, setTempDetails] = useState(userDetails);

  const [passwordDetails, setPasswordDetails] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  const applyProfile = useCallback((profile) => {
    const loaded = buildProfileDetails(profile);

    setUserDetails((prev) => ({
      ...prev,
      ...loaded,
    }));
    setTempDetails((prev) => ({
      ...prev,
      ...loaded,
    }));
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const res = await apiClient.get("/profile", {
        cacheMode: "network",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (token !== await AsyncStorage.getItem("access_token")) return;
      const profile = res.data ?? {};
      setCache("api:/profile", profile);
      applyProfile(profile);
      setProfileLoadError("");

      try {
        const termsRes = await apiClient.get("/terms/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (termsRes.data) {
          setTermsStatus(termsRes.data);
        }
      } catch {
        // terms status fetch is best-effort
      }
    } catch (error) {
      if (error.code !== "ERR_CANCELED") {
        setProfileLoadError(error.response?.data?.error || "Could not load your profile. Please retry to see your registered email and username.");
      }
    } finally {
      setLoading(false);
    }
  }, [applyProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await clearProfileCache();
      await loadProfile();
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const updateTempDetail = useCallback((key, value) => {
    setTempDetails((prev) => ({
      ...prev,
      [key]: key === "contactNumber" ? digitsOnly(value) : value,
    }));
  }, []);

  const handleAccessChange = useCallback(access => {
    if (access?.exempt || !Number.isFinite(Number(access?.score))) return;
    const score = Number(access.score);
    const status = score === 100 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : score >= 20 ? 1 : 0;
    const sync = previous => previous.credibilityScore === score && previous.credibilityStatus === status
      ? previous : { ...previous, credibilityScore: score, credibilityStatus: status };
    setUserDetails(sync);
    setTempDetails(sync);
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  if (loading) {
    return (
      <ThemedView style={{ backgroundColor: "#F8F8F8" }}>
        <ProfileFormSkeleton />
      </ThemedView>
    );
  }

  const hasChanges = () => {
    const fields = [
      "firstName",
      "middleName",
      "lastName",
      "username",
      "birthdate",
      "contactNumber",
      "location",
      "email",
    ];
    return Boolean(deviceCoordinates) || fields.some((field) => tempDetails[field] !== userDetails[field]);
  };

  const handleEdit = () => {
    setTempDetails(userDetails);
    setEditMode(true);
  };

  const handleSave = async () => {
    if (saving || locating) return;
    const missing = profileDetailsMissing({ ...tempDetails, locationConfirmed: Boolean(deviceCoordinates) || tempDetails.locationConfirmed }, toDateString);
    if (missing.length) {
      toast.error(`Please complete: ${missing.join(", ")}.`);
      return;
    }

    setSaving(true);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) {
        console.warn("No access token found; not saving.");
        return;
      }

      if (deviceCoordinates) {
        await apiClient.put("/profile/location", { ...deviceCoordinates, address: tempDetails.location.trim() }, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      await apiClient.put(
        "/profile",
        {
          first_name: tempDetails.firstName,
          middle_name: tempDetails.middleName,
          last_name: tempDetails.lastName,
          user_name: tempDetails.username,
          phone: tempDetails.contactNumber,
          birthdate: toDateString(tempDetails.birthdate) || null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setUserDetails(tempDetails);
      setEditMode(false);
      setShowBirthdatePicker(false);

      const res = await apiClient.get("/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profile = res.data ?? {};
      setCache("api:/profile", profile);
      const synced = {
        ...tempDetails,
        firstName: profile.first_name ?? tempDetails.firstName,
        middleName: profile.middle_name ?? tempDetails.middleName,
        lastName: profile.last_name ?? tempDetails.lastName,
        username: profile.user_name ?? tempDetails.username,
        birthdate: profile.birthdate
          ? parseBirthdate(profile.birthdate)
          : tempDetails.birthdate,
        contactNumber: profile.phone ?? tempDetails.contactNumber,
        location: profile.location ?? tempDetails.location,
        locationConfirmed: profile.location_confirmed === true,
        email: profile.email ?? tempDetails.email,
      };
      setUserDetails(synced);
      setTempDetails(synced);
      setDeviceCoordinates(null);
      toast.success("Profile updated successfully.");
    } catch (error) {
      console.warn(
        "Failed to save profile:",
        error.response?.data?.error || error.message
      );
      toast.error(
        error.response?.data?.error ||
          "Could not save your profile. Please try again."
      );
    } finally { setSaving(false); }
  };

  const handleAddressPress = () => {
    if (!editMode || locationLock.current || saving || deviceCoordinates) return;
    setShowLocationConsent(true);
  };

  const handleAllowLocation = async () => {
    setShowLocationConsent(false);
    if (!editMode || locationLock.current || saving) return;
    if (deviceCoordinates) return;
    locationLock.current = true;
    setLocating(true);
    setLocationError("");
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) throw new Error("Please sign in again.");
      const coordinates = await requestProfileDeviceLocation();
      if (token !== await AsyncStorage.getItem("access_token")) return;
      setDeviceCoordinates(coordinates);
    } catch (error) {
      const message = error.message || "Could not access location. Please try again.";
      setLocationError(message);
      toast.error(message);
    } finally { locationLock.current = false; setLocating(false); }
  };

  const handleCancel = () => {
    setShowLocationConsent(false);
    setDeviceCoordinates(null);
    setLocationError("");
    setTempDetails(userDetails);
    setEditMode(false);
    setShowBirthdatePicker(false);
  };

  const handlePasswordSave = async () => {
    const { currentPassword, newPassword, confirmPassword } = passwordDetails;

    setPasswordSubmitted(true);

    const currentError = validateCurrentPassword(currentPassword);
    const newError = validateNewPassword(newPassword);
    const confirmError = validateConfirmPassword(newPassword, confirmPassword);

    setCurrentPasswordError(currentError);
    setNewPasswordError(newError);
    setConfirmPasswordError(confirmError);

    if (currentError || newError || confirmError) return;

    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) {
        console.warn("No access token found; not saving password.");
        return;
      }

      await apiClient.put(
        "/profile/password",
        {
          currentPassword,
          newPassword,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setPasswordDetails({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setPasswordEditMode(false);

      toast.success("Your access code has been updated successfully.");
    } catch (error) {
      toast.error(
        error.response?.data?.error ||
          "Could not update your access code. Please try again."
      );
    }
  };

  const handlePasswordCancel = () => {
    setPasswordDetails({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });

    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setPasswordEditMode(false);
    setPasswordSubmitted(false);
    setCurrentPasswordError("");
    setNewPasswordError("");
    setConfirmPasswordError("");
  };

  const hasPasswordChanges = () => {
    const { currentPassword, newPassword, confirmPassword } = passwordDetails;
    return !!(currentPassword || newPassword || confirmPassword);
  };

  const updatePasswordDetail = (key, value) => {
    setPasswordDetails((prev) => {
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

  const handleBirthdateChange = (event, selectedDate) => {
    if (Platform.OS === "android") {
      setShowBirthdatePicker(false);
    }

    if (selectedDate) {
      updateTempDetail("birthdate", selectedDate);
    }
  };

  const missingDetails = profileDetailsMissing(editMode ? { ...tempDetails, locationConfirmed: Boolean(deviceCoordinates) || tempDetails.locationConfirmed } : userDetails, toDateString);
  const savedComplete = profileDetailsMissing(userDetails, toDateString).length === 0;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <TouchableWithoutFeedback>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COMMUNISHIELD_BLUE]}
                tintColor={COMMUNISHIELD_BLUE}
              />
            }
          >
            <Divboxwhite testID="profile-details-container" style={styles.detailsCard}>
              {profileLoadError ? <View>
                <Text accessibilityRole="alert" style={styles.missingField}>{profileLoadError}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={loadProfile}>
                  <ThemedText style={styles.editText}>Retry loading profile</ThemedText>
                </TouchableOpacity>
              </View> : null}
              <View style={[styles.cardHeader, styles.profileHeader, editMode && styles.profileHeaderEditing]}>
                <View style={styles.profileHeading}>
                  <ThemedHeader accessibilityRole="header" style={styles.profileTitle}>Profile Details</ThemedHeader>
                  {savedComplete && missingDetails.length === 0 ? <View testID="profile-complete-badge" accessible accessibilityLabel="Profile complete" style={styles.completeBadge}><Ionicons name="checkmark-circle" size={19} color="#278363" /></View> : null}
                </View>

                {editMode ? (
                  <View style={[styles.editButtons, styles.profileActions]}>
                    <TouchableOpacity accessibilityRole="button" style={styles.profileCancelButton} onPress={handleCancel} disabled={locating || saving}>
                      <ThemedText style={[styles.cancelText, styles.profileActionText]}>Cancel</ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleSave}
                      disabled={!hasChanges() || saving || locating}
                      style={[styles.saveButton, styles.profileSaveButton, !hasChanges() && styles.saveButtonDisabled]}
                    >
                      <ThemedText style={[styles.saveText, styles.profileSaveText]}>{saving ? "Saving…" : "Save"}</ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity accessibilityRole="button" style={styles.profileEditButton} onPress={handleEdit}>
                    <Ionicons name="create-outline" size={16} color={COMMUNISHIELD_BLUE} />
                    <ThemedText style={[styles.editText, styles.profileActionText]}>Edit</ThemedText>
                  </TouchableOpacity>
                )}
              </View>

              {editMode ? <Text style={styles.profileSubtitle}>Make your changes, then tap Save.</Text> : null}
              <View style={styles.profileSection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIcon}><Ionicons name="person-outline" size={21} color={COMMUNISHIELD_BLUE} /></View>
                  <View style={styles.sectionHeading}>
                    <Text accessibilityRole="header" style={styles.sectionLabel}>Personal Information</Text>
                    <Text style={styles.sectionHint}>Middle name is optional</Text>
                  </View>
                </View>
                <View style={styles.sectionFields}>
              <DetailRow
                label="First name"
                value={userDetails.firstName}
                editValue={tempDetails.firstName}
                placeholder="Enter firstname"
                fieldKey="firstName"
                required={missingDetails.includes("First name")}
                editMode={editMode}
                updateTempDetail={updateTempDetail}
              />

              <DetailRow
                label="Last name"
                value={userDetails.lastName}
                editValue={tempDetails.lastName}
                placeholder="Enter lastname"
                fieldKey="lastName"
                required={missingDetails.includes("Last name")}
                editMode={editMode}
                updateTempDetail={updateTempDetail}
              />

              <DetailRow
                label="Middle name"
                value={userDetails.middleName}
                editValue={tempDetails.middleName}
                placeholder="Enter middlename"
                fieldKey="middleName"
                editMode={editMode}
                updateTempDetail={updateTempDetail}
              />

              <DetailRow
                label="Username"
                value={userDetails.username}
                editValue={tempDetails.username}
                placeholder="Enter username"
                fieldKey="username"
                required={missingDetails.includes("Username")}
                editMode={editMode}
                updateTempDetail={updateTempDetail}
              />

              <View style={[styles.detailsRow, styles.noBorder]}>
                <View style={styles.detailLabelWrap}>
                  <ThemedText style={styles.label}>Birthdate</ThemedText>
                  {missingDetails.includes("Birthdate") ? <Text accessibilityLabel="Required" style={styles.requiredMark}>*</Text> : null}
                </View>

                {editMode ? (
                  <TouchableOpacity
                    style={styles.dateInput}
                    activeOpacity={0.85}
                    onPress={() => setShowBirthdatePicker(true)}
                  >
                    <ThemedText style={styles.dateInputText}>
                      {formatBirthdate(tempDetails.birthdate) || "Choose your birthdate"}
                    </ThemedText>

                    <Ionicons
                      name="chevron-down"
                      size={moderateScale(16)}
                      color={COMMUNISHIELD_BLUE}
                    />
                  </TouchableOpacity>
                ) : (
                    <ThemedText style={[styles.value, missingDetails.includes("Birthdate") && styles.requiredValue]}>
                      {formatBirthdate(userDetails.birthdate) || "Required"}
                  </ThemedText>
                )}
              </View>

              {showBirthdatePicker && editMode ? (
                Platform.OS === "web" ? <input aria-label="Birthdate" type="date" min="1900-01-01"
                  max={toDateString(new Date())} value={toDateString(tempDetails.birthdate)}
                  onChange={event => updateTempDetail("birthdate", parseBirthdate(event.target.value))}
                  style={{ padding: 12, borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, width: "100%", boxSizing: "border-box" }} /> : <DateTimePicker
                  value={tempDetails.birthdate || new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  maximumDate={new Date()}
                  onChange={handleBirthdateChange}
                />
              ) : null}

                </View>
              </View>
              <View style={[styles.profileSection, styles.contactSection]}>
                <View style={[styles.sectionHeader, styles.contactSectionHeader]}>
                  <View style={[styles.sectionIcon, styles.contactSectionIcon]}><Ionicons name="location-outline" size={21} color="#21675D" /></View>
                  <View style={styles.sectionHeading}>
                    <Text accessibilityRole="header" style={styles.sectionLabel}>Contact & Address</Text>
                  </View>
                </View>
                <View style={styles.sectionFields}>
              <DetailRow
                label="Contact no."
                value={userDetails.contactNumber}
                editValue={tempDetails.contactNumber}
                placeholder="Enter contact number"
                fieldKey="contactNumber"
                required={missingDetails.includes("Contact number (11 digits)")}
                keyboardType="phone-pad"
                editMode={editMode}
                updateTempDetail={updateTempDetail}
              />

              <View style={styles.addressRow}>
              <View style={styles.detailsRow}>
                <View style={styles.detailLabelWrap}><Text style={styles.label}>Address</Text>{missingDetails.includes("Address & location permission") ? <Text accessibilityLabel="Required" style={styles.requiredMark}>*</Text> : null}</View>
                {!editMode ? <Text style={[styles.value, missingDetails.includes("Address & location permission") && styles.requiredValue]}>{userDetails.location || "Required"}</Text> : deviceCoordinates ? <TextInput accessibilityLabel="Address" autoFocus multiline maxLength={500} style={[styles.input, styles.addressInput]} value={tempDetails.location} onChangeText={value => updateTempDetail("location", value)} placeholder="Street, barangay, city / municipality" placeholderTextColor="#94A3B8" /> :
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Address" disabled={locating || saving} style={styles.addressBox} onPress={handleAddressPress}>
                    <Text style={tempDetails.location ? styles.addressValue : styles.addressPlaceholder}>{locating ? "Requesting location access…" : (editMode ? tempDetails.location : userDetails.location) || "Tap to allow location & enter address"}</Text>
                    <Ionicons name="create-outline" size={18} color={COMMUNISHIELD_BLUE} />
                  </TouchableOpacity>}
              </View>
                {deviceCoordinates ? <Text style={styles.completionNote}>Location allowed. Enter your address above and save.</Text> : null}
                {locationError ? <Text accessibilityRole="alert" style={styles.missingField}>{locationError}</Text> : null}
              </View>

              <DetailRow
                label="Email"
                value={userDetails.email}
                editValue={tempDetails.email}
                placeholder="Enter email"
                fieldKey="email"
                required={missingDetails.includes("Email")}
                keyboardType="email-address"
                autoCapitalize="none"
                isLast
                editMode={false}
                updateTempDetail={updateTempDetail}
              />
                </View>
              </View>
              {savedComplete && params.completeProfile === "1" ? <TouchableOpacity accessibilityRole="button" style={styles.locationButton} onPress={() => {
                if (router.canGoBack()) router.back(); else router.replace("/(tabs)/User_Home");
              }}><Text style={styles.locationButtonText}>Continue to your previous page</Text></TouchableOpacity> : null}
            </Divboxwhite>

            <CredibilityScore
              statusIndex={userDetails.credibilityStatus}
              score={userDetails.credibilityScore}
            />
            <CredibilityAccessPanel onAccessChange={handleAccessChange} />

            <Divboxwhite style={styles.termsCard}>
              <View style={styles.termsRow}>
                <View style={styles.termsIconBox}>
                  <Ionicons
                    name="document-text-outline"
                    size={moderateScale(22)}
                    color={COMMUNISHIELD_BLUE}
                  />
                </View>

                <View style={styles.termsTextWrap}>
                  <ThemedHeader style={styles.cardTitle}>
                    Terms & Conditions
                  </ThemedHeader>

                  <ThemedText style={styles.termsSubtitle}>
                    {termsStatus.hasAcceptedLatest
                      ? `Accepted version ${termsStatus.acceptedVersion || termsStatus.latestVersion}`
                      : `Version ${termsStatus.latestVersion} requires your acceptance`}
                  </ThemedText>

                  {termsStatus.acceptedAt ? (
                    <ThemedText style={styles.termsDate}>
                      Accepted on {new Date(termsStatus.acceptedAt).toLocaleDateString("en-US", {
                        month: "long",
                        day: "2-digit",
                        year: "numeric",
                      })}
                    </ThemedText>
                  ) : null}
                </View>

                  <TouchableOpacity
                  style={styles.termsButton}
                  onPress={() => router.push({ pathname: "/(auth)/TermsAndConditions", params: { viewOnly: "1" } })}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.termsButtonText}>
                    Review
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </Divboxwhite>

            <Divboxwhite style={styles.passwordCard}>
              <View style={styles.cardHeader}>
                <ThemedHeader style={styles.cardTitle}>
                  Password & Security
                </ThemedHeader>

                {passwordEditMode ? (
                  <View style={styles.editButtons}>
                    <TouchableOpacity onPress={handlePasswordCancel}>
                      <ThemedText style={styles.cancelText}>Cancel</ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handlePasswordSave} disabled={!hasPasswordChanges()} style={[styles.saveButton, !hasPasswordChanges() && styles.saveButtonDisabled]}>
                      <ThemedText style={[styles.saveText, !hasPasswordChanges() && styles.saveTextDisabled]}>Save</ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setPasswordEditMode(true)}>
                    <ThemedText style={styles.editText}>Change</ThemedText>
                  </TouchableOpacity>
                )}
              </View>

              {passwordEditMode ? (
                <View>
                  <View
                    style={[
                      styles.passwordInputWrap,
                      currentPasswordError && styles.passwordInputWrapError,
                    ]}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={COMMUNISHIELD_BLUE}
                    />

                    <TextInput
                      style={styles.passwordInput}
                      value={passwordDetails.currentPassword}
                      onChangeText={(value) =>
                        updatePasswordDetail("currentPassword", value)
                      }
                      secureTextEntry={!showCurrentPassword}
                      placeholder="Current access code"
                      placeholderTextColor="#9CA3AF"
                    />

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      <Ionicons
                        name={
                          showCurrentPassword
                            ? "eye-off-outline"
                            : "eye-outline"
                        }
                        size={20}
                        color="#6B7280"
                      />
                    </TouchableOpacity>
                  </View>
                  {currentPasswordError ? (
                    <Text style={styles.errorText}>
                      {currentPasswordError}
                    </Text>
                  ) : null}

                  <View
                    style={[
                      styles.passwordInputWrap,
                      newPasswordError && styles.passwordInputWrapError,
                    ]}
                  >
                    <Ionicons
                      name="key-outline"
                      size={18}
                      color={COMMUNISHIELD_BLUE}
                    />

                    <TextInput
                      style={styles.passwordInput}
                      value={passwordDetails.newPassword}
                      onChangeText={(value) =>
                        updatePasswordDetail("newPassword", value)
                      }
                      secureTextEntry={!showNewPassword}
                      placeholder="New access code"
                      placeholderTextColor="#9CA3AF"
                    />

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setShowNewPassword(!showNewPassword)}
                    >
                      <Ionicons
                        name={
                          showNewPassword ? "eye-off-outline" : "eye-outline"
                        }
                        size={20}
                        color="#6B7280"
                      />
                    </TouchableOpacity>
                  </View>
                  {newPasswordError ? (
                    <Text style={styles.errorText}>{newPasswordError}</Text>
                  ) : null}

                  <View
                    style={[
                      styles.passwordInputWrap,
                      confirmPasswordError && styles.passwordInputWrapError,
                    ]}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={18}
                      color={COMMUNISHIELD_BLUE}
                    />

                    <TextInput
                      style={styles.passwordInput}
                      value={passwordDetails.confirmPassword}
                      onChangeText={(value) =>
                        updatePasswordDetail("confirmPassword", value)
                      }
                      secureTextEntry={!showConfirmPassword}
                      placeholder="Confirm new access code"
                      placeholderTextColor="#9CA3AF"
                    />

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                    >
                      <Ionicons
                        name={
                          showConfirmPassword
                            ? "eye-off-outline"
                            : "eye-outline"
                        }
                        size={20}
                        color="#6B7280"
                      />
                    </TouchableOpacity>
                  </View>
                  {confirmPasswordError ? (
                    <Text style={styles.errorText}>
                      {confirmPasswordError}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={styles.securityPreview}>
                  <View style={styles.securityIconWrap}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={20}
                      color={COMMUNISHIELD_BLUE}
                    />
                  </View>

                  <View style={styles.securityTextWrap}>
                    <ThemedText style={styles.securityTitle}>
                      Account protected
                    </ThemedText>

                    <ThemedText style={styles.securitySubtitle}>
                      Update your sign-in access anytime to keep your account
                      secure.
                    </ThemedText>
                  </View>
                </View>
              )}
            </Divboxwhite>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      <Modal transparent visible={showLocationConsent && editMode} animationType="fade" onRequestClose={() => setShowLocationConsent(false)}>
        <View style={styles.consentOverlay}>
          <View style={styles.consentCard} accessibilityViewIsModal>
            <View style={styles.summaryIcon}><Ionicons name="shield-checkmark-outline" size={24} color={COMMUNISHIELD_BLUE} /></View>
            <Text style={styles.consentTitle}>Allow location access?</Text>
            <Text style={styles.consentBody}>To complete your address, we need your permission to access your device location. You’ll then type your address yourself.</Text>
            <Text style={styles.consentBody}>Your location is stored privately only when you save. It isn’t shared on reports or tracked in the background.</Text>
            <Text style={styles.consentBody}>Without location access, you can’t complete a new address. A previously saved address won’t be changed.</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.locationButton} onPress={handleAllowLocation}>
              <Text style={styles.locationButtonText}>Continue to permission</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.consentCancel} onPress={() => setShowLocationConsent(false)}>
              <Text style={styles.requirementsText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  summaryIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#E7EEF8", alignItems: "center", justifyContent: "center" },
  requirementsText: { fontFamily: "PoppinsMedium", color: "#294880", fontSize: 12 },
  profileHeader: { width: "100%", gap: 10, paddingHorizontal: 2, paddingTop: 4, marginBottom: 0 },
  profileHeaderEditing: { flexWrap: "wrap" },
  profileActions: { flexShrink: 0, marginLeft: "auto" },
  profileHeading: { flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 110, flexDirection: "row", alignItems: "center", gap: 5 },
  profileTitle: { flexShrink: 1, fontFamily: MOBILE_FONT, fontWeight: "700", fontSize: 20, lineHeight: 26, color: "#20385F" },
  completeBadge: { flexShrink: 0, justifyContent: "center" },
  requiredMark: { color: "#B65F35", fontSize: 12, fontWeight: "600", marginLeft: 3 },
  requiredValue: { color: "#A76A46", fontSize: 12, fontWeight: "400" },
  profileSubtitle: { fontFamily: MOBILE_FONT, fontSize: 12, lineHeight: 18, color: "#64748B", marginTop: 2, marginBottom: 8, paddingHorizontal: 2 },
  profileActionText: { fontFamily: MOBILE_FONT, fontWeight: "600", fontSize: 13 },
  profileEditButton: { flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: "#E7EEF8" },
  profileCancelButton: { minHeight: 44, justifyContent: "center" },
  profileSaveButton: { minHeight: 44, borderRadius: 22, backgroundColor: "#294880", paddingHorizontal: 20, justifyContent: "center" },
  profileSaveText: { color: "#FFFFFF", fontFamily: MOBILE_FONT, fontWeight: "600", fontSize: 13 },
  profileSection: { marginBottom: 0 },
  contactSection: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5EAF2", marginTop: 6, paddingTop: 4 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 6, paddingBottom: 4 },
  contactSectionHeader: { paddingTop: 8 },
  sectionIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#EAF0FA", alignItems: "center", justifyContent: "center" },
  contactSectionIcon: { backgroundColor: "#E8F3EE" },
  sectionHeading: { flex: 1 },
  sectionLabel: { fontFamily: MOBILE_FONT, fontWeight: "600", fontSize: 14, lineHeight: 21, color: "#20385F" },
  sectionHint: { fontFamily: MOBILE_FONT, fontSize: 11, lineHeight: 16, color: "#52657D", marginTop: 1 },
  sectionFields: { paddingBottom: 2 },
  addressRow: { gap: 6 },
  addressBox: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  addressValue: { flex: 1, color: "#1E293B", fontFamily: MOBILE_FONT, fontWeight: "500", fontSize: 13, lineHeight: 20, textAlign: "right" },
  addressPlaceholder: { flex: 1, color: "#718096", fontFamily: MOBILE_FONT, fontSize: 12, lineHeight: 18, textAlign: "right" },
  addressInput: { minHeight: 48, textAlignVertical: "center" },
  consentOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", padding: 24, alignItems: "center", justifyContent: "center" },
  consentCard: { width: "100%", maxWidth: 420, padding: 24, borderRadius: 20, backgroundColor: "#FFFFFF", gap: 14 },
  consentTitle: { fontFamily: "PoppinsSemiBold", fontSize: 20, color: "#294880" },
  consentBody: { fontFamily: "PoppinsRegular", fontSize: 13, lineHeight: 21, color: "#64748B" },
  consentCancel: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  completionNote: { color: "#475569", fontSize: 12, lineHeight: 19 },
  missingField: { color: "#9A3B25", fontSize: 12, lineHeight: 18 },
  locationButton: { backgroundColor: "#294880", borderRadius: 9, padding: 13, minHeight: 46, alignItems: "center", justifyContent: "center" },
  locationButtonText: { fontFamily: "PoppinsMedium", color: "#FFFFFF", fontSize: 13 },
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  keyboardAvoid: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },

  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: moderateScale(16),
    paddingTop: 10,
    paddingBottom: scaleVertical(40),
  },

  detailsCard: {
    padding: 14,
    margin: 0,
    marginBottom: 16,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5EAF2",
    shadowOpacity: 0,
    elevation: 0,
  },

  passwordCard: {
    padding: moderateScale(16),
    borderRadius: moderateScale(18),
    marginTop: moderateScale(14),
    marginBottom: moderateScale(24),
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: moderateScale(14),
  },

  cardTitle: {
    fontSize: moderateScale(17),
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  editButtons: {
    flexDirection: "row",
    alignItems: "center",
  },

  editText: {
    fontSize: moderateScale(14),
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  cancelText: {
    fontSize: moderateScale(14),
    fontFamily: "PoppinsMedium",
    color: "#7A7A7A",
    marginRight: moderateScale(14),
  },

  saveText: {
    fontSize: moderateScale(14),
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  saveTextDisabled: {
    color: "#9CA3AF",
  },

  saveButtonDisabled: {
    opacity: 0.5,
  },

  saveButton: {
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(8),
    borderRadius: moderateScale(8),
    backgroundColor: "transparent",
  },

  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingVertical: 5,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EDF0F5",
  },

  noBorder: {
    borderBottomWidth: 0,
  },

  detailLabelWrap: {
    flexBasis: 120,
    flexShrink: 1,
    maxWidth: "48%",
    flexDirection: "row",
    alignItems: "center",
  },

  label: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: MOBILE_FONT,
    color: "#6B7280",
    marginLeft: moderateScale(8),
  },

  value: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: MOBILE_FONT,
    fontWeight: "500",
    color: "#111827",
    textAlign: "right",
    paddingVertical: 3,
  },

  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontFamily: MOBILE_FONT,
    fontWeight: "500",
    color: "#111827",
    textAlign: "right",
    backgroundColor: "#F3F6FB",
    borderRadius: 8,
    minHeight: 48,
    padding: 8,
  },

  dateInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#F3F6FB",
    borderRadius: 8,
    minHeight: 48,
    padding: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  dateInputText: {
    flex: 1,
    fontSize: 13,
    fontFamily: MOBILE_FONT,
    fontWeight: "500",
    color: "#111827",
    marginRight: moderateScale(4),
    textAlign: "right",
  },

  credibilityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: moderateScale(18),
    paddingHorizontal: moderateScale(14),
    paddingTop: moderateScale(16),
    paddingBottom: moderateScale(18),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DDE7F5",
  },

  credibilityTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: moderateScale(26),
  },

  credibilityIconBox: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: moderateScale(12),
  },

  credibilityTextWrap: {
    flex: 1,
  },

  credibilitySubtitle: {
    fontSize: moderateScale(12),
    lineHeight: moderateScale(17),
    fontFamily: "PoppinsRegular",
    color: "#6B7280",
    marginTop: moderateScale(3),
  },

  currentBadge: {
    borderRadius: 999,
    paddingHorizontal: moderateScale(10),
    paddingVertical: moderateScale(6),
  },

  currentBadgeText: {
    fontSize: moderateScale(10),
    fontFamily: "PoppinsSemiBold",
  },

  timelineWrapper: {
    position: "relative",
    paddingTop: moderateScale(5),
  },

  timelineLineBg: {
    position: "absolute",
    top: moderateScale(12),
    left: "10%",
    right: "10%",
    height: moderateScale(4),
    borderRadius: 999,
    backgroundColor: "#D9E2F0",
  },

  timelineLineActive: {
    position: "absolute",
    top: moderateScale(12),
    left: "10%",
    height: moderateScale(4),
    borderRadius: 999,
  },

  timelineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  timelineItem: {
    width: "20%",
    alignItems: "center",
  },

  timelineDot: {
    width: moderateScale(14),
    height: moderateScale(14),
    borderRadius: moderateScale(7),
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: moderateScale(10),
  },

  timelineDotActive: {
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: moderateScale(12),
    marginTop: moderateScale(-5),
    marginBottom: moderateScale(5),
  },

  timelineLabel: {
    fontSize: moderateScale(10),
    fontFamily: "PoppinsRegular",
    color: "#7A8699",
    textAlign: "center",
    lineHeight: moderateScale(14),
  },

  passwordInputWrap: {
    minHeight: moderateScale(48),
    borderRadius: moderateScale(14),
    backgroundColor: "#F8FAFC",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8EDF5",
    paddingHorizontal: moderateScale(12),
    marginBottom: moderateScale(10),
    flexDirection: "row",
    alignItems: "center",
  },

  passwordInput: {
    flex: 1,
    marginLeft: moderateScale(10),
    marginRight: moderateScale(8),
    fontSize: moderateScale(14),
    fontFamily: "PoppinsRegular",
    color: "#111827",
  },

  passwordInputWrapError: {
    borderColor: "#C0392B",
  },

  errorText: {
    width: "100%",
    color: "#C0392B",
    fontSize: moderateScale(13),
    lineHeight: moderateScale(18),
    fontFamily: "PoppinsRegular",
    marginTop: moderateScale(-4),
    marginBottom: moderateScale(8),
    paddingHorizontal: moderateScale(2),
  },

  securityPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: moderateScale(16),
    padding: moderateScale(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8EDF5",
  },

  securityIconWrap: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(21),
    backgroundColor: "#EEF3FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: moderateScale(12),
  },

  securityTextWrap: {
    flex: 1,
  },

  securityTitle: {
    fontSize: moderateScale(14),
    fontFamily: "PoppinsSemiBold",
    color: "#1F2A37",
    marginBottom: moderateScale(3),
  },

  securitySubtitle: {
    fontSize: moderateScale(12),
    lineHeight: moderateScale(18),
    fontFamily: "PoppinsRegular",
    color: "#6B7280",
  },

  termsCard: {
    padding: moderateScale(16),
    borderRadius: moderateScale(18),
    marginTop: moderateScale(14),
    marginBottom: moderateScale(14),
  },

  termsRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  termsIconBox: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: moderateScale(12),
  },

  termsTextWrap: {
    flex: 1,
  },

  termsSubtitle: {
    fontSize: moderateScale(12),
    lineHeight: moderateScale(17),
    fontFamily: "PoppinsRegular",
    color: "#6B7280",
    marginTop: moderateScale(3),
  },

  termsDate: {
    fontSize: moderateScale(10),
    fontFamily: "PoppinsRegular",
    color: "#9CA3AF",
    marginTop: moderateScale(2),
  },

  termsButton: {
    paddingHorizontal: moderateScale(14),
    paddingVertical: moderateScale(8),
    borderRadius: moderateScale(8),
    backgroundColor: "#F0F2F7",
    borderWidth: 1,
    borderColor: "#C8CFE0",
  },

  termsButtonText: {
    fontSize: moderateScale(12),
    fontFamily: "PoppinsSemiBold",
    color: "#5A6F9E",
  },
});

const DetailRow = React.memo(function DetailRow({ label, value, editValue, placeholder, fieldKey, keyboardType = "default", autoCapitalize = "sentences", isLast = false, editMode, updateTempDetail, required = false }) {
  return (
    <View testID={`profile-field-${fieldKey}`} style={[styles.detailsRow, isLast && styles.noBorder]}>
      <View style={styles.detailLabelWrap}>
        <ThemedText style={styles.label}>{label}</ThemedText>
        {required ? <Text accessibilityLabel="Required" style={styles.requiredMark}>*</Text> : null}
      </View>

      {editMode ? (
        <TextInput
          accessibilityLabel={label}
          style={styles.input}
          value={editValue}
          onChangeText={(text) => updateTempDetail(fieldKey, text)}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          blurOnSubmit={false}
        />
      ) : (
        <ThemedText style={[styles.value, required && styles.requiredValue]}>{value || (required ? "Required" : "Not provided")}</ThemedText>
      )}
    </View>
  );
});

export default UserProfileSettingsWrapper;
