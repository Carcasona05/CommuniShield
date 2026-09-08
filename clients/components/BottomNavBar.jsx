import React from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scrollToTop } from "../services/scrollToTopBus";

const COMMUNISHIELD_BLUE = "#294880";
const INACTIVE = "#6C7A96";

const BottomNavBar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isTinyScreen = width < 340;
  const isSmallScreen = width >= 340 && width < 390;
  //const isMediumScreen = width >= 390 && width < 430;

  const sideMargin = isTinyScreen ? 10 : 14;
  const navWidth = Math.min(width - sideMargin * 2, 430);

  const navHeight = isTinyScreen ? 62 : isSmallScreen ? 66 : 70;
  const iconSize = isTinyScreen ? 19 : isSmallScreen ? 20 : 22;
  const labelSize = isTinyScreen ? 8 : isSmallScreen ? 9 : 10;

  const plusSize = isTinyScreen ? 48 : isSmallScreen ? 52 : 56;
  const plusIconSize = isTinyScreen ? 27 : isSmallScreen ? 29 : 32;

  const showPlusButton =
    pathname === "/User_Home" ||
    pathname === "/(tabs)/User_Home" ||
    pathname.includes("User_Home");

  const bottomSpace =
    Platform.OS === "ios"
      ? Math.max(insets.bottom, 10) + 6
      : Math.max(insets.bottom, 8) + 8;

  const tabs = [
    {
      name: "HOME",
      label: "HOME",
      route: "/User_Home",
      icon: "home",
    },
    {
      name: "MAP",
      label: "MAP",
      route: "/User_Map",
      icon: "location",
    },
    {
      name: "MY REPORTS",
      label: isTinyScreen ? "REPORTS" : "MY REPORTS",
      route: "/User_MyReports",
      icon: "document-text",
    },
    {
      name: "SETTINGS",
      label: isTinyScreen ? "SET" : "SETTINGS",
      route: "/User_Settings",
      icon: "settings",
    },
  ];

  const isActiveRoute = (route) => {
    if (route === "/User_Settings") {
      return (
        pathname === "/User_Settings" ||
        pathname === "/User_Profile" ||
        pathname === "/User_ProfileSettings" ||
        pathname.includes("User_Settings") ||
        pathname.includes("User_Profile")
      );
    }

    if (route === "/User_MyReports") {
      return (
        pathname === "/User_MyReports" ||
        pathname === "/MyUser_RepPostView" ||
        pathname.includes("User_MyReports") ||
        pathname.includes("MyUser_RepPostView")
      );
    }

    return pathname === route || pathname.startsWith(route + "/");
  };

  const handleTabPress = (tab) => {
    const isActive = isActiveRoute(tab.route);

    if (
      (tab.route === "/User_Home" || tab.route === "/User_MyReports") &&
      isActive
    ) {
      scrollToTop();
      return;
    }

    router.push(tab.route);
  };

  const renderTab = (tab) => {
    const isActive = isActiveRoute(tab.route);

    return (
      <TouchableOpacity
        key={tab.name}
        style={styles.tab}
        activeOpacity={0.75}
        onPress={() => handleTabPress(tab)}
      >
        <Ionicons
          name={isActive ? tab.icon : `${tab.icon}-outline`}
          size={iconSize}
          color={isActive ? COMMUNISHIELD_BLUE : INACTIVE}
        />

        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[
            styles.label,
            {
              fontSize: labelSize,
              color: isActive ? COMMUNISHIELD_BLUE : INACTIVE,
              fontWeight: isActive ? "800" : "700",
              maxWidth: isTinyScreen ? 58 : isSmallScreen ? 70 : 82,
            },
          ]}
        >
          {tab.label}
        </Text>

        {isActive && <View style={styles.activeDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          bottom: bottomSpace,
        },
      ]}
    >
      <View
        style={[
          styles.container,
          {
            width: navWidth,
            height: navHeight,
            borderRadius: navHeight / 2,
            paddingHorizontal: isTinyScreen ? 6 : isSmallScreen ? 8 : 10,
          },
        ]}
      >
        {tabs.map(renderTab)}

        {showPlusButton && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/User_PostReport")}
            style={[
              styles.plusButton,
              {
                width: plusSize,
                height: plusSize,
                borderRadius: plusSize / 2,
                top: -(plusSize * 1.1),
                right: isTinyScreen ? 10 : isSmallScreen ? 12 : 14,
                borderWidth: isTinyScreen ? 4 : 5,
              },
            ]}
          >
            <Ionicons name="add" size={plusIconSize} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
  },

  container: {
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    position: "relative",
    borderWidth: 1,
    borderColor: "#E2E8F2",
    shadowColor: "#8AA9E6",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },

  tab: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 1,
    position: "relative",
  },

  label: {
    marginTop: 3,
    letterSpacing: 0.1,
    textAlign: "center",
  },

  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: COMMUNISHIELD_BLUE,
    marginTop: 3,
  },

  plusButton: {
    position: "absolute",
    backgroundColor: COMMUNISHIELD_BLUE,
    justifyContent: "center",
    alignItems: "center",
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
});

export default BottomNavBar;