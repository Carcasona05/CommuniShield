import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { restoreAuth } from "../services/auth";
import { isBrowserCacheVerified } from "../services/dataStore";
import useSessionEpoch from "../hooks/useSessionEpoch";

function VerifiedBrowserSession({ children }) {
  const router = useRouter();
  const epoch = useSessionEpoch();
  const [attempt, setAttempt] = useState(0);
  const [, render] = useState(0);
  const [error, setError] = useState("");
  const verified = isBrowserCacheVerified();
  useEffect(() => {
    if (verified) return;
    let active = true;
    setError("");
    restoreAuth().then(auth => {
      if (!active) return;
      if (!auth) router.replace("/(auth)/Admin_Login");
      else render(value => value + 1);
    }).catch(() => {
      if (active) setError("Could not verify your account. Check your connection and retry.");
    });
    return () => { active = false; };
  }, [epoch, attempt, verified, router]);
  if (verified) return children;
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
    {error ? <><Text>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={{ padding: 16 }}><Text>Retry</Text></TouchableOpacity></>
      : <ActivityIndicator size="large" color="#294880" />}
  </View>;
}

export default function BrowserSessionGate({ children }) {
  return Platform.OS === "web" ? <VerifiedBrowserSession>{children}</VerifiedBrowserSession> : children;
}
