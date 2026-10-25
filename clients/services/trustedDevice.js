import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const storageKey = (email) => `cs.trusted-device.${Array.from(email.trim().toLowerCase()).map((char) => char.codePointAt(0).toString(16).padStart(4, "0")).join("")}`;

export async function getTrustedDevice(email) {
  try {
    const key = storageKey(email);
    if (Platform.OS === "web") return await AsyncStorage.getItem(key);
    // iOS Keychain can survive reinstall; an installation-local marker must too.
    if (!await AsyncStorage.getItem(`${key}.installation`)) {
      await SecureStore.deleteItemAsync(key);
      return null;
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function saveTrustedDevice(email, token) {
  const key = storageKey(email);
  if (Platform.OS === "web") await AsyncStorage.setItem(key, token);
  else {
    await SecureStore.setItemAsync(key, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    await AsyncStorage.setItem(`${key}.installation`, "1");
  }
}
