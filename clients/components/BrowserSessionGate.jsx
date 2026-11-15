import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { clearAuth, restoreAuth } from "../services/auth";
import { isBrowserCacheVerified } from "../services/dataStore";
import useSessionEpoch from "../hooks/useSessionEpoch";
import { disabledSessionNotice } from "../services/disabledSessionNotice";
import AccountDisabledNotice from "./modals/AccountDisabledNotice";

function VerifiedBrowserSession({ children, nonBlocking }) {
  const router = useRouter();
  const epoch = useSessionEpoch();
  const [attempt, setAttempt] = useState(0);
  const [, render] = useState(0);
  const [error, setError] = useState("");
  const disabled = useSyncExternalStore(disabledSessionNotice.subscribe, disabledSessionNotice.snapshot, disabledSessionNotice.snapshot);
  const leaving = useRef(false);
  const verified = isBrowserCacheVerified();
  useEffect(() => {
    if (Platform.OS !== "web" || verified || disabled || leaving.current) return;
    let active = true;
    setError("");
    restoreAuth().then(auth => {
      // A disabled response resets the epoch before restoreAuth resolves. Read
      // the live notice state, not a closure from before the request started.
      if (!active || disabledSessionNotice.snapshot() || leaving.current) return;
      if (!auth) router.replace("/(auth)/Admin_Login");
      else render(value => value + 1);
    }).catch(() => {
      if (active) setError("Could not verify your account. Check your connection and retry.");
    });
    return () => { active = false; };
  }, [epoch, attempt, verified, disabled, router]);
  const returnToSignIn = async () => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      await clearAuth();
      router.replace("/(auth)/Admin_Login");
      // Keep the notice latched through navigation. The next authenticated
      // session clears it, rather than briefly remounting protected children.
    } catch {
      leaving.current = false;
      setError("Could not sign out. Please try again.");
    }
  };
  if (disabled) return <View style={{ flex: 1, backgroundColor: "#F4F7FB" }}>
    <AccountDisabledNotice visible onConfirm={returnToSignIn} signOut />
    {!!error && <Text accessibilityRole="alert" style={{ padding: 16 }}>{error}</Text>}
  </View>;
  if (Platform.OS !== "web") return children;
  // Admin pages already own their loading UI. Verification still runs, and
  // persisted private snapshots are restored only after server verification.
  if (nonBlocking) return <>{children}{!verified && error ? <View accessibilityRole="alert" style={{ padding: 16 }}>
    <Text>{error}</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={{ padding: 16 }}><Text>Retry</Text></TouchableOpacity>
  </View> : null}</>;
  if (verified) return children;
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
    {error ? <><Text>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={{ padding: 16 }}><Text>Retry</Text></TouchableOpacity></>
      : <ActivityIndicator size="large" color="#294880" />}
  </View>;
}

export default function BrowserSessionGate({ children, nonBlocking = false }) {
  return <VerifiedBrowserSession nonBlocking={nonBlocking}>{children}</VerifiedBrowserSession>;
}
