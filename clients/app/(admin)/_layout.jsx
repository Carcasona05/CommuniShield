import React, { useEffect, useState } from "react";
import { Slot, useRouter } from "expo-router";
import { Platform } from "react-native";
import { restoreAuth } from "../../services/auth";
import { getLastPage } from "../../services/lastPage";
import SessionRetry from "../../components/SessionRetry";

export default function AdminLayout() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    const guard = async () => {
      try {
        const role = (await restoreAuth())?.role;

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
          return;
        }

        setChecked(true);
      } catch (error) {
        if (error.code === "ERR_CANCELED") return;
        if (![401, 403].includes(error.response?.status)) { setConnectionError(true); return; }
        if (Platform.OS === "web") {
          window.location.href = "/(auth)/Admin_Login";
        } else {
          router.replace("/(tabs)/User_Home");
        }
      }
    };

    guard();
  }, [attempt]);

  if (connectionError) return <SessionRetry onRetry={() => { setConnectionError(false); setAttempt(value => value + 1); }} />;

  if (!checked) return null;

  return <Slot />;
}
