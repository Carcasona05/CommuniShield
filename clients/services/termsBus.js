import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@terms_accepted";

export const markTermsAccepted = async (version) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: true, version }));
};

export const checkTermsAccepted = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const clearTermsAccepted = async () => {
  await AsyncStorage.removeItem(STORAGE_KEY);
};
