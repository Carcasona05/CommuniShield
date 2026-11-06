import React, { useEffect, useState } from "react";
import { Slot, useRouter } from "expo-router";
import { ActivityIndicator, Platform, View } from "react-native";
import useSessionEpoch from "../../hooks/useSessionEpoch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ROLE_KEY } from "../../services/auth";
import { getLastPage } from "../../services/lastPage";
import BrowserSessionGate from "../../components/BrowserSessionGate";

export default function SAdminLayout() {
  return <BrowserSessionGate><SAdminLayoutInner /></BrowserSessionGate>;
}

function SAdminLayoutInner() {
  const epoch = useSessionEpoch();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const guard = async () => {
      try {
        const role = await AsyncStorage.getItem(ROLE_KEY);

        if (role === "admin") {
          const target = await getLastPage("admin");
          if (Platform.OS === "web") {
            window.location.href = target;
          } else {
            router.replace(target);
          }
          return;
        }

        if (role !== "super_admin") {
          const target = role
            ? await getLastPage(role)
            : "/(auth)/Admin_Login";
          if (Platform.OS === "web") {
            window.location.href = target;
          } else {
            router.replace(target);
          }
          return;
        }

        setChecked(true);
      } catch {
        if (Platform.OS === "web") {
          window.location.href = "/(auth)/Admin_Login";
        } else {
          router.replace("/(tabs)/User_Home");
        }
      }
    };

    guard();
  }, []);

  if (!checked) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color="#294880" /></View>;

  return <Slot key={epoch} />;
}
