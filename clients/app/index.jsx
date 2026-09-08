import React, { useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import ThemedView from "../components/ThemedView";
import ThemedText from "../components/ThemedText";
import { getAuth } from "../services/auth";
import { prefetchAllData, hydrateCache } from "../services/dataStore";
import apiClient from "../services/apiClient";

const LoadingScreen = () => {
  useEffect(() => {
    let active = true;

    const timer = setTimeout(async () => {
      await hydrateCache();
      const { token, role } = await getAuth();
      if (!active) return;

      if (!token) {
        if (Platform.OS === "web") {
          router.replace("/(auth)/Admin_Login");
        } else {
          router.replace("/(auth)/User_Login");
        }
        return;
      }

      try {
        await apiClient.get("/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        const { clearAuth } = await import("../services/auth");
        await clearAuth();
        if (Platform.OS === "web") {
          router.replace("/(auth)/Admin_Login");
        } else {
          router.replace("/(auth)/User_Login");
        }
        return;
      }

      if (!active) return;

      prefetchAllData();

      if (role === "super_admin") {
        router.replace("/(sadmin)/SAdmin_Dashboard");
      } else if (role === "admin") {
        router.replace("/(admin)/Admin_Dashboard");
      } else {
        router.replace("/(tabs)/User_Home");
      }
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#007bff" />
        <ThemedText variant="title" style={styles.title}>
          CommuniShield
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Loading your safety companion...
        </ThemedText>
      </View>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.8,
  },
});

export default LoadingScreen;
