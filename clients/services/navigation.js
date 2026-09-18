import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const smartBack = async (fallbackPath) => {
  try {
    if (fallbackPath) {
      router.replace(fallbackPath);
    } else {
      const token = await AsyncStorage.getItem("access_token");
      if (token) {
        router.replace("/(tabs)/User_Home");
      } else {
        router.replace("/(auth)/User_Login");
      }
    }
  } catch {
    router.replace(fallbackPath || "/(tabs)/User_Home");
  }
};
