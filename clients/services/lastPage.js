import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_PAGE_KEY = "last_visited_page";

const DEFAULTS = {
  admin: "/(admin)/Admin_Dashboard",
  super_admin: "/(sadmin)/SAdmin_Dashboard",
  user: "/(tabs)/User_Home",
};

export const saveLastPage = async (role, pathname) => {
  try {
    await AsyncStorage.setItem(
      LAST_PAGE_KEY,
      JSON.stringify({ role, pathname })
    );
  } catch {}
};

export const getLastPage = async (role) => {
  try {
    const raw = await AsyncStorage.getItem(LAST_PAGE_KEY);
    if (raw) {
      const { role: storedRole, pathname } = JSON.parse(raw);
      if (storedRole === role && pathname) return pathname;
    }
  } catch {}
  return DEFAULTS[role] || DEFAULTS.user;
};
