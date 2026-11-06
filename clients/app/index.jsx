import React, { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import ThemedView from "../components/ThemedView";
import ThemedText from "../components/ThemedText";
import { restoreAuth } from "../services/auth";

const LoadingScreen = () => {
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;

    const init = async () => {
      let auth;
      setError("");
      try { auth = await restoreAuth(); }
      catch (error) {
        if (active) setError("Could not check your account. Check your connection and try again.");
        return;
      }
      if (!active) return;

      if (!auth) {
        if (Platform.OS === "web") {
          router.replace("/(auth)/Admin_Login");
        } else {
          router.replace("/(auth)/User_Login");
        }
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

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        {!error ? <ActivityIndicator size="large" color="#294880" /> : null}
        <ThemedText variant="title" style={styles.title}>
          CommuniShield
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          {error || "Loading your safety companion..."}
        </ThemedText>
        {error ? <TouchableOpacity accessibilityRole="button" style={{ padding: 16 }} onPress={() => setAttempt(value => value + 1)}><ThemedText>Retry</ThemedText></TouchableOpacity> : null}
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
