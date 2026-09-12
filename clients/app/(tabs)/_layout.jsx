import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Platform,
} from "react-native";
import { Tabs, usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BottomNavBar from "../../components/BottomNavBar";
import { scrollToTop } from "../../services/scrollToTopBus";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache } from "../../services/dataStore";

const COMMUNISHIELD_BLUE = "#294880";

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme();

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/notifications");
      if (cached) {
        const allItems = [
          ...(cached.reportStatuses || []),
          ...(cached.nearbyIncidents || []),
        ];
        setUnreadCount(allItems.filter((n) => !n.isRead).length);
      }

      const res = await apiClient.get("/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allItems = [
        ...(res.data?.reportStatuses || []),
        ...(res.data?.nearbyIncidents || []),
      ];
      setUnreadCount(allItems.filter((n) => !n.isRead).length);
    } catch {
      // keep last count
    }
  }, []);

  useAutoRefresh(loadNotifications, 30000);

  useEffect(() => {
    if (Platform.OS === "web") {
      const role = window.localStorage.getItem("user_role");
      if (role === "super_admin") {
        window.location.href = "/(sadmin)/SAdmin_Dashboard";
      } else if (role === "admin") {
        window.location.href = "/(admin)/Admin_Dashboard";
      } else {
        window.location.href = "/(auth)/Admin_Login";
      }
    }
  }, []);

  if (Platform.OS === "web") {
    return null;
  }

  if (!fontsLoaded) return null;

  const isDark = colorScheme === "dark";

  const isChildScreen =
    pathname.includes("User_RepPostView") ||
    pathname.includes("MyUser_RepPostView") ||
    pathname.includes("MyUser_RepPostView_Edit") ||
    pathname.includes("User_ProfileSettings") ||
    pathname.includes("User_Notification");

  const showBottomNav = !isChildScreen;

  const getScreenTitle = () => {
    if (pathname.includes("User_ProfileSettings")) return "Account Settings";
    if (pathname.includes("MyUser_RepPostView_Edit")) return "Edit Report";
    if (pathname.includes("User_RepPostView")) return "Post Details";
    if (pathname.includes("MyUser_RepPostView")) return "My Report";
    if (pathname.includes("User_Notification")) return "Notifications";

    if (pathname.includes("User_Home")) return "CommuniShield";
    if (pathname.includes("User_Map")) return "Map";
    if (pathname.includes("User_MyReports")) return "My Reports";
    if (pathname.includes("User_Settings")) return "Settings";
    if (pathname.includes("User_PostReport")) return "Post Report";

    return "CommuniShield";
  };

  const handleNotification = () => {
    router.push("/User_Notification");
  };

  const Header = () => {
    const title = getScreenTitle();

    if (isChildScreen) {
      return (
        <View style={styles.childHeader}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.75}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color={COMMUNISHIELD_BLUE} />
          </TouchableOpacity>

          <View style={styles.childTitleWrap}>
            <Text numberOfLines={1} style={styles.childTitle}>
              {title}
            </Text>
          </View>

          <View style={styles.rightPlaceholder} />
        </View>
      );
    }

    return (
      <View style={styles.majorHeader}>
        <TouchableOpacity
          style={styles.majorTitleWrap}
          activeOpacity={0.7}
          onPress={scrollToTop}
        >
          <Text style={styles.majorTitle}>{title}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.notificationButton}
          activeOpacity={0.75}
          onPress={handleNotification}
        >
          <Ionicons
            name="notifications-outline"
            size={22}
            color={COMMUNISHIELD_BLUE}
          />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.root, isDark && styles.darkRoot]}>
      <Header />

      <View style={styles.content}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              display: "none",
            },
          }}
        >
          <Tabs.Screen
            name="User_Home"
            options={{
              title: "Home",
            }}
          />

          <Tabs.Screen
            name="User_Map"
            options={{
              title: "Map",
            }}
          />

          <Tabs.Screen
            name="User_MyReports"
            options={{
              title: "My Reports",
            }}
          />

          <Tabs.Screen
            name="User_Settings"
            options={{
              title: "Settings",
            }}
          />

          <Tabs.Screen
            name="User_ProfileSettings"
            options={{
              title: "Account Settings",
            }}
          />

          <Tabs.Screen
            name="User_RepPostView"
            options={{
              title: "Post Details",
            }}
          />

          <Tabs.Screen
            name="MyUser_RepPostView"
            options={{
              title: "My Report",
            }}
          />

          <Tabs.Screen
            name="MyUser_RepPostView_Edit"
            options={{
              title: "Edit Report",
            }}
          />

          <Tabs.Screen
            name="User_PostReport"
            options={{
              title: "Post Report",
            }}
          />

          <Tabs.Screen
            name="User_Notification"
            options={{
              title: "Notifications",
            }}
          />
        </Tabs>
      </View>

      {showBottomNav && <BottomNavBar />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  darkRoot: {
    backgroundColor: "#F3F6FB",
  },

  content: {
    flex: 1,
  },

  majorHeader: {
    paddingTop: Platform.OS === "ios" ? 58 : 40,
    paddingHorizontal: 18,
    paddingBottom: 14,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  majorTitleWrap: {
    flex: 1,
    marginRight: 12,
  },

  majorTitle: {
    fontSize: 24,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
    letterSpacing: 0.2,
  },

  childHeader: {
    paddingTop: Platform.OS === "ios" ? 58 : 40,
    paddingHorizontal: 14,
    paddingBottom: 14,
    backgroundColor: "#F3F6FB",
    flexDirection: "row",
    alignItems: "center",
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F2",
    shadowColor: "#8AA9E6",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },

  childTitleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  childTitle: {
    fontSize: 18,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
    textAlign: "center",
  },

  rightPlaceholder: {
    width: 42,
    height: 42,
  },

  notificationButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F2",
    shadowColor: "#8AA9E6",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },

  unreadDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#DC2626",
  },

  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#DC2626",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },

  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "PoppinsSemiBold",
    lineHeight: 20,
  },
});