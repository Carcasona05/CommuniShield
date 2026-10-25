import React, { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import ThemedView from "../components/ThemedView";
import ThemedText from "../components/ThemedText";
import { restoreAuth } from "../services/auth";
import SessionRetry from "../components/SessionRetry";

const LoadingScreen = () => {
  const [attempt, setAttempt] = useState(0);
  const [connectionError, setConnectionError] = useState(false);
  useEffect(() => {
    let active = true;

    const init = async () => {
      let auth;
      try {
        auth = await restoreAuth();
      } catch (error) {
        if (!active || error.code === "ERR_CANCELED") return;
        if (![401, 403].includes(error.response?.status)) { setConnectionError(true); return; }
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
      if (!auth) {
        router.replace(Platform.OS === "web" ? "/(auth)/Admin_Login" : "/(auth)/User_Login");
        return;
      }
      const { role } = auth;

      if (role === "super_admin") {
        router.replace("/(sadmin)/SAdmin_Dashboard");
      } else if (role === "admin") {
        router.replace("/(admin)/Admin_Dashboard");
      } else {
        router.replace("/(tabs)/User_Home");
      }
    };

    init();

    return () => {
      active = false;
    };
  }, [attempt]);

  if (connectionError) return <SessionRetry onRetry={() => { setConnectionError(false); setAttempt(value => value + 1); }} />;

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
