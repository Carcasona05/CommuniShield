import React, { useEffect } from "react";
import { Slot, useRouter } from "expo-router";
import { Platform } from "react-native";
import useSessionEpoch from "../../hooks/useSessionEpoch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ROLE_KEY } from "../../services/auth";
import { getLastPage } from "../../services/lastPage";
import BrowserSessionGate from "../../components/BrowserSessionGate";

export default function AdminLayout() {
  return <BrowserSessionGate nonBlocking><AdminLayoutInner /></BrowserSessionGate>;
}

function AdminLayoutInner() {
  const epoch = useSessionEpoch();
  const router = useRouter();

  useEffect(() => {
    const guard = async () => {
      try {
        const role = await AsyncStorage.getItem(ROLE_KEY);

        if (role === "super_admin") {
          const target = await getLastPage("super_admin");
          if (Platform.OS === "web") {
            window.location.href = target;
          } else {
            router.replace(target);
          }
          return;
        }

        if (role !== "admin") {
          const target = role
            ? await getLastPage(role)
            : "/(auth)/Admin_Login";
          if (Platform.OS === "web") {
            window.location.href = target;
          } else {
            router.replace(target);
          }
        }
      } catch {
        if (Platform.OS === "web") {
          window.location.href = "/(auth)/Admin_Login";
        } else {
          router.replace("/(tabs)/User_Home");
        }
      }
    };

    guard();
  }, [epoch, router]);

  return <Slot key={epoch} />;
}
