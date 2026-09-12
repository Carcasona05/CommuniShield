import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";

import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import { SettingsSkeleton } from "../../components/PageSkeletons";
import apiClient from "../../services/apiClient";
import { clearAuth } from "../../services/auth";
import { getCache, setCache } from "../../services/dataStore";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import ToastProvider, { useToast } from "../../components/Toast";

const COMMUNISHIELD_BLUE = "#294880";

const UserSettingsWrapper = () => {
  return (
    <ToastProvider>
      <UserSettings />
    </ToastProvider>
  );
};

const UserSettings = () => {
  const toast = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(() => getCache("api:/profile") === undefined);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [notifications, setNotifications] = useState(true);
  const [crimeAlerts, setCrimeAlerts] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [displayEmail, setDisplayEmail] = useState("");

  const loadProfile = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/profile");
      if (cached !== undefined) {
        setDisplayName(
          cached.user_name || cached.name || cached.email || "SafeZone User"
        );
        setDisplayEmail(cached.email || "youraccount@email.com");
      }

      const res = await apiClient.get("/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const profile = res.data ?? {};
      setCache("api:/profile", profile);
      setDisplayName(
        profile.user_name || profile.name || profile.email || "SafeZone User"
      );
      setDisplayEmail(profile.email || "youraccount@email.com");
    } catch {
      setDisplayName("SafeZone User");
      setDisplayEmail("youraccount@email.com");
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(loadProfile, 30000);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (!fontsLoaded) {
    return null;
  }

  if (loading) {
    return (
      <ThemedView style={{ backgroundColor: "#F8F8F8" }}>
        <SettingsSkeleton />
      </ThemedView>
    );
  }

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = async () => {
    await clearAuth();
    toast.success("You have been logged out successfully.");
    setTimeout(() => {
      router.replace("/(auth)/User_Login");
    }, 800);
  };

  const SettingItem = ({
    icon,
    iconBg,
    iconColor,
    title,
    subtitle,
    onPress,
    rightComponent,
    showBorder = true,
  }) => (
    <TouchableOpacity
      style={[styles.settingItem, !showBorder && styles.noBorder]}
      activeOpacity={0.88}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>

      <View style={styles.settingTextWrap}>
        <ThemedText style={styles.settingTitle}>{title}</ThemedText>

        {subtitle ? (
          <ThemedText style={styles.settingSubtitle}>{subtitle}</ThemedText>
        ) : null}
      </View>

      {rightComponent}
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={24} color={COMMUNISHIELD_BLUE} />
          </View>

          <View style={styles.profileInfo}>
            <ThemedText style={styles.profileName}>{displayName}</ThemedText>
            <ThemedText style={styles.profileEmail}>
              {displayEmail}
            </ThemedText>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <ThemedText style={styles.sectionTitle}>Account</ThemedText>

          <SettingItem
            icon="shield-checkmark-outline"
            iconBg="#EEF3FF"
            iconColor={COMMUNISHIELD_BLUE}
            title="Account Settings"
            subtitle="Manage personal information, password, and security"
            onPress={() => router.push("/User_ProfileSettings")}
            rightComponent={
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            }
            showBorder={false}
          />
        </View>

        <View style={styles.sectionCard}>
          <ThemedText style={styles.sectionTitle}>Preferences</ThemedText>

          <SettingItem
            icon="notifications-outline"
            iconBg="#FFF4DD"
            iconColor="#E7A11A"
            title="Notifications"
            subtitle="Receive app updates and important reminders"
            rightComponent={
              <Switch
                trackColor={{ false: "#D1D5DB", true: "#BFD2FF" }}
                thumbColor={notifications ? COMMUNISHIELD_BLUE : "#F9FAFB"}
                onValueChange={setNotifications}
                value={notifications}
              />
            }
          />

          <SettingItem
            icon="warning-outline"
            iconBg="#FFEAEA"
            iconColor="#D64545"
            title="Crime Alert Settings"
            subtitle="Enable alerts for incidents near your location"
            rightComponent={
              <Switch
                trackColor={{ false: "#D1D5DB", true: "#FFD2D2" }}
                thumbColor={crimeAlerts ? "#D64545" : "#F9FAFB"}
                onValueChange={setCrimeAlerts}
                value={crimeAlerts}
              />
            }
          />

        </View>

        <View style={styles.dangerCard}>
          <View style={styles.dangerTop}>
            <View style={styles.dangerIconWrap}>
              <Ionicons name="log-out-outline" size={20} color="#D64545" />
            </View>

            <View style={styles.dangerTextWrap}>
              <ThemedText style={styles.dangerTitle}>Logout</ThemedText>
              <ThemedText style={styles.dangerSubtitle}>
                Sign out of your account on this device.
              </ThemedText>
            </View>
          </View>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => setShowLogoutModal(true)}
            activeOpacity={0.88}
          >
            <ThemedText style={styles.logoutText}>Logout</ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="log-out-outline" size={28} color="#D64545" />
            </View>

            <ThemedText style={styles.modalTitle}>Confirm Logout</ThemedText>

            <ThemedText style={styles.modalSubtitle}>
              Are you sure you want to sign out of your account?
            </ThemedText>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowLogoutModal(false)}
                activeOpacity={0.85}
              >
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={() => {
                  setShowLogoutModal(false);
                  handleLogout();
                }}
                activeOpacity={0.85}
              >
                <ThemedText style={styles.modalConfirmText}>Logout</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  scrollContainer: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 120,
  },

  profileCard: {
    alignItems: "center",
    marginBottom: 8,
  },

  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EEF3FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  profileInfo: {
    alignItems: "center",
  },

  profileName: {
    fontSize: 17,
    fontFamily: "PoppinsSemiBold",
    color: "#1F2A37",
    marginBottom: 3,
    textAlign: "center",
  },

  profileEmail: {
    fontSize: 12,
    fontFamily: "PoppinsRegular",
    color: "#6B7280",
    textAlign: "center",
  },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 4,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    marginBottom: 8,
  },

  sectionTitle: {
    fontSize: 18,
    fontFamily: "PoppinsSemiBold",
    color: "#1F2A37",
    marginBottom: 8,
  },

  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },

  noBorder: {
    borderBottomWidth: 0,
  },

  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  settingTextWrap: {
    flex: 1,
    marginRight: 10,
  },

  settingTitle: {
    fontSize: 14,
    fontFamily: "PoppinsMedium",
    color: "#1F2A37",
    marginBottom: 3,
  },

  settingSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "PoppinsRegular",
    color: "#6B7280",
  },

  dangerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F6D8D8",
  },

  dangerTop: {
    flexDirection: "row",
    marginBottom: 14,
  },

  dangerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FDEBEC",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  dangerTextWrap: {
    flex: 1,
  },

  dangerTitle: {
    fontSize: 17,
    fontFamily: "PoppinsSemiBold",
    color: "#C0392B",
    marginBottom: 4,
  },

  dangerSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "PoppinsRegular",
    color: "#5F6B7A",
  },

  logoutButton: {
    backgroundColor: "#D64545",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  logoutText: {
    fontSize: 13,
    color: "#FFFFFF",
    fontFamily: "PoppinsSemiBold",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E7ECF3",
  },

  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FDEBEC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  modalTitle: {
    fontSize: 18,
    fontFamily: "PoppinsSemiBold",
    color: "#1F2A37",
    marginBottom: 8,
    textAlign: "center",
  },

  modalSubtitle: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#5F6B7A",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },

  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },

  modalCancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8E0EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  modalCancelText: {
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: "#475467",
  },

  modalConfirmButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#D64545",
    alignItems: "center",
    justifyContent: "center",
  },

  modalConfirmText: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
    color: "#FFFFFF",
  },
});

export default UserSettingsWrapper;