import { useEffect, useState } from "react";
import { Slot, useRouter } from "expo-router";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ROLE_KEY } from "../../services/auth";
import { getLastPage } from "../../services/lastPage";

export default function AdminLayout() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

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

  if (!checked) return null;

  return <Slot />;
}
