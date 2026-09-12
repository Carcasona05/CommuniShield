import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearAuth } from "../../services/auth";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache } from "../../services/dataStore";
import { IMAGES } from "../../constants/assets";
import ToastProvider, { useToast } from "../../components/Toast";

const COMMUNISHIELD_BLUE = "#294880";

const formatRelativeTime = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

export default function SAdmin_LayoutWrapper({ children }) {
  return (
    <ToastProvider>
      <SAdmin_Layout>{children}</SAdmin_Layout>
    </ToastProvider>
  );
}

function SAdmin_Layout({ children }) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadNotifications = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const applyNotifications = (list) =>
        setNotifications(
          list.map((item) => ({
            ...item,
            time: formatRelativeTime(item.time),
          }))
        );

      const cached = getCache("api:/admin/notifications");
      if (cached && Array.isArray(cached.notifications)) {
        applyNotifications(cached.notifications);
      }

      const res = await apiClient.get("/admin/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCache("api:/admin/notifications", res.data ?? {});
      applyNotifications(res.data?.notifications || []);
    } catch {
      // keep last loaded data on failure
    }
  }, []);

  useAutoRefresh(loadNotifications, 30000);

  if (!fontsLoaded) {
    return null;
  }

  const navItems = [
    {
      label: "Dashboard",
      route: "/(sadmin)/SAdmin_Dashboard",
      path: "/SAdmin_Dashboard",
      icon: "grid",
      iconType: "Feather",
      description: "Overview of reports, admin activity, and system status",
    },
    {
      label: "Validation",
      route: "/(sadmin)/SAdmin_Validation",
      path: "/SAdmin_Validation",
      icon: "shield-checkmark-outline",
      iconType: "Ionicons",
      description: "Review report validation and AI credibility results",
    },
    {
      label: "Audit Logs",
      route: "/(sadmin)/SAdmin_AuditLogs",
      path: "/SAdmin_AuditLogs",
      icon: "list-outline",
      iconType: "Ionicons",
      description: "View audit trail, deleted reports, and admin actions",
    },
    {
      label: "Admin Accounts",
      route: "/(sadmin)/SAdmin_AdminAccounts",
      path: "/SAdmin_AdminAccounts",
      icon: "people-outline",
      iconType: "Ionicons",
      description: "Manage admin accounts, roles, and admin requests",
    },
  ];

  const unreadCount = notifications.filter((item) => item.unread).length;

  const isRouteActive = (item) => {
    return (
      pathname === item.path ||
      pathname === item.route ||
      pathname.includes(item.path.replace("/", ""))
    );
  };

  const getCurrentPage = () => {
    const found = navItems.find((item) => isRouteActive(item));

    if (found) {
      return found;
    }

    if (pathname.includes("SAdmin_Settings")) {
      return {
        label: "Settings",
        description:
          "Configure AI thresholds, map settings, and system preferences",
      };
    }

    if (pathname.includes("Admin_ViewReport")) {
      return {
        label: "View Report",
        description: "Review complete incident report details",
      };
    }

    if (pathname.includes("Admin_ViewValidation")) {
      return {
        label: "View Validation",
        description: "Review AI validation and report credibility details",
      };
    }

    if (pathname.includes("SuperAdmin_EditReq")) {
      return {
        label: "Edit Request",
        description: "Review and manage admin edit requests",
      };
    }

    if (pathname.includes("Admin_AddAdmin")) {
      return {
        label: "Add Admin",
        description: "Create or register a new admin account",
      };
    }

    return {
      label: "SuperAdmin",
      description: "SuperAdmin panel",
    };
  };

  const currentPage = getCurrentPage();

  const getIcon = (item, isActive) => {
    const color = isActive ? COMMUNISHIELD_BLUE : "#5F6F8C";

    if (item.iconType === "Feather") {
      return <Feather name={item.icon} size={21} color={color} />;
    }

    return <Ionicons name={item.icon} size={22} color={color} />;
  };

  const getNotificationIcon = (type) => {
    if (type === "report") {
      return <Ionicons name="document-text-outline" size={20} color={COMMUNISHIELD_BLUE} />;
    }

    if (type === "ai") {
      return <Ionicons name="sparkles-outline" size={20} color="#7C3AED" />;
    }

    if (type === "admin") {
      return <Ionicons name="people-outline" size={20} color={COMMUNISHIELD_BLUE} />;
    }

    if (type === "log") {
      return <Ionicons name="list-outline" size={20} color="#7C3AED" />;
    }

    if (type === "system") {
      return <Ionicons name="server-outline" size={20} color="#F59E0B" />;
    }

    return (
      <Ionicons name="notifications-outline" size={20} color={COMMUNISHIELD_BLUE} />
    );
  };

  const getPriorityStyle = (priority) => {
    if (priority === "High") {
      return {
        backgroundColor: "#FDECEC",
        color: "#DC2626",
      };
    }

    if (priority === "Medium") {
      return {
        backgroundColor: "#FFF7E6",
        color: "#D97706",
      };
    }

    return {
      backgroundColor: "#E8EEF9",
      color: COMMUNISHIELD_BLUE,
    };
  };

  const handleNavPress = (route) => {
    setShowNotifications(false);
    setShowProfileDropdown(false);
    router.push(route);
  };

  const handleNotificationPress = async (item) => {
    setShowNotifications(false);
    setShowProfileDropdown(false);

    if (item.unread) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, unread: false } : n))
      );

      try {
        const token = await AsyncStorage.getItem("access_token");
        if (token) {
          await apiClient.patch(
            `/admin/notifications/${item.id}/read`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }
      } catch {
        // keep local read state even if the call fails
      }
    }

    router.push(item.route);
  };

  const handleSettingsPress = () => {
    setShowNotifications(false);
    setShowProfileDropdown(false);
    router.push("/(sadmin)/SAdmin_Settings");
  };

  const handleLogout = async () => {
    setShowNotifications(false);
    setShowProfileDropdown(false);
    await clearAuth();
    toast.success("You have been logged out successfully.");
    setTimeout(() => {
      router.replace("/(auth)/Admin_Login");
    }, 800);
  };

  const closeDropdowns = () => {
    setShowNotifications(false);
    setShowProfileDropdown(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.sidebar}>
        <View style={styles.logoSection}>
          <Image
            source={IMAGES.logoNoText}
            style={styles.logoTextImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.sidebarDivider} />

        <View style={styles.navSection}>
          <Text style={styles.navSectionTitle}>MAIN MENU</Text>

          <View style={styles.navList}>
            {navItems.map((item, index) => {
              const isActive = isRouteActive(item);

              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.navItem, isActive && styles.activeNavItem]}
                  onPress={() => handleNavPress(item.route)}
                  activeOpacity={0.75}
                >
                  <View style={styles.navIcon}>{getIcon(item, isActive)}</View>

                  <Text
                    style={[styles.navText, isActive && styles.activeNavText]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.topHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.headerTitleDivider} />

            <View>
              <Text style={styles.pageTitle}>{currentPage.label}</Text>
              <Text style={styles.pageDesc}>{currentPage.description}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <View style={styles.notificationWrapper}>
              <TouchableOpacity
                style={[
                  styles.headerIconButton,
                  showNotifications && styles.activeHeaderButton,
                ]}
                onPress={() => {
                  setShowNotifications(!showNotifications);
                  setShowProfileDropdown(false);
                }}
                activeOpacity={0.75}
              >
                <Ionicons
                  name="notifications-outline"
                  size={23}
                  color={COMMUNISHIELD_BLUE}
                />

                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {showNotifications && (
                <View style={styles.notificationDropdown}>
                  <View style={styles.notificationHeader}>
                    <View>
                      <Text style={styles.notificationTitle}>Notifications</Text>
                      <Text style={styles.notificationSubtitle}>
                        {unreadCount} unread alerts
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.closeNotificationButton}
                      onPress={() => setShowNotifications(false)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="close-outline" size={22} color="#4B5D7A" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    style={styles.notificationList}
                    showsVerticalScrollIndicator={false}
                  >
                    {notifications.map((item) => {
                      const priorityStyle = getPriorityStyle(item.priority);

                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.notificationItem,
                            item.unread && styles.unreadNotificationItem,
                          ]}
                          onPress={() => handleNotificationPress(item)}
                          activeOpacity={0.75}
                        >
                          <View style={styles.notificationIconBox}>
                            {getNotificationIcon(item.type)}
                          </View>

                          <View style={styles.notificationContent}>
                            <View style={styles.notificationItemHeader}>
                              <Text style={styles.notificationItemTitle}>
                                {item.title}
                              </Text>

                              {item.unread && <View style={styles.unreadDot} />}
                            </View>

                            <Text style={styles.notificationMessage}>
                              {item.message}
                            </Text>

                            <View style={styles.notificationMeta}>
                              <Text style={styles.notificationTime}>
                                {item.time}
                              </Text>

                              <View
                                style={[
                                  styles.priorityBadge,
                                  {
                                    backgroundColor:
                                      priorityStyle.backgroundColor,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.priorityText,
                                    { color: priorityStyle.color },
                                  ]}
                                >
                                  {item.priority}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <TouchableOpacity
                    style={styles.viewAllButton}
                    onPress={() => {
                      setShowNotifications(false);
                      setShowProfileDropdown(false);
                      router.push("/(sadmin)/SAdmin_AuditLogs");
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.viewAllText}>View all notifications</Text>
                    <Ionicons
                      name="arrow-forward-outline"
                      size={16}
                      color={COMMUNISHIELD_BLUE}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.headerIconButton,
                pathname.includes("SAdmin_Settings") &&
                  styles.activeHeaderButton,
              ]}
              onPress={handleSettingsPress}
              activeOpacity={0.75}
            >
              <Ionicons name="settings-outline" size={23} color={COMMUNISHIELD_BLUE} />
            </TouchableOpacity>

            <View style={styles.profileWrapper}>
              <TouchableOpacity
                style={[
                  styles.profileSection,
                  showProfileDropdown && styles.activeHeaderButton,
                ]}
                onPress={() => {
                  setShowProfileDropdown(!showProfileDropdown);
                  setShowNotifications(false);
                }}
                activeOpacity={0.75}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>S</Text>
                </View>

                <View style={styles.profileInfo}>
                  <Text style={styles.profileText}>SuperAdmin</Text>
                  <Text style={styles.profileRole}>System Owner</Text>
                </View>

                <Ionicons
                  name={
                    showProfileDropdown
                      ? "chevron-up-outline"
                      : "chevron-down-outline"
                  }
                  size={17}
                  color="#6B7A99"
                />
              </TouchableOpacity>

              {showProfileDropdown && (
                <View style={styles.profileDropdown}>
                  <TouchableOpacity
                    style={styles.profileDropdownItem}
                    onPress={() => {
                      setShowProfileDropdown(false);
                      setShowLogoutModal(true);
                    }}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.profileDropdownIconBox,
                        styles.logoutIconBox,
                      ]}
                    >
                      <Ionicons
                        name="log-out-outline"
                        size={20}
                        color="#DC2626"
                      />
                    </View>

                    <View style={styles.profileDropdownTextBox}>
                      <Text
                        style={[styles.profileDropdownTitle, styles.logoutText]}
                      >
                        Logout
                      </Text>

                      <Text style={styles.profileDropdownSubtitle}>
                        Back to admin login
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={1}
          style={styles.pageContent}
          onPress={closeDropdowns}
        >
          {children}
        </TouchableOpacity>
      </View>

      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="log-out-outline" size={28} color="#DC2626" />
            </View>

            <Text style={styles.modalTitle}>Confirm Logout</Text>

            <Text style={styles.modalSubtitle}>
              Are you sure you want to sign out of the admin panel?
            </Text>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowLogoutModal(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={() => {
                  setShowLogoutModal(false);
                  handleLogout();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modalConfirmText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = {
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#F4F7FB",
  },

  sidebar: {
    width: 260,
    minHeight: "100vh",
    backgroundColor: "#FFFFFF",
    paddingTop: 22,
    paddingBottom: 22,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: "#DCE5F2",
    shadowColor: "#294880",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: {
      width: 4,
      height: 0,
    },
    elevation: 6,
  },

  logoSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginBottom: 8,
  },

  logoTextImage: {
    width: 150,
    height: 150,
  },

  sidebarDivider: {
    height: 1,
    backgroundColor: "#E1E8F4",
    marginHorizontal: 8,
    marginBottom: 22,
  },

  navSection: {
    flex: 1,
  },

  navSectionTitle: {
    fontSize: 13,
    color: "#8A98B3",
    marginLeft: 14,
    marginBottom: 12,
    letterSpacing: 1,
    fontFamily: "PoppinsSemiBold",
  },

  navList: {
    gap: 8,
  },

  navItem: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    borderRadius: 15,
  },

  activeNavItem: {
    backgroundColor: "#E8EEF9",
    borderWidth: 1,
    borderColor: "#D6E0F0",
  },

  navIcon: {
    width: 29,
    alignItems: "center",
    marginRight: 13,
  },

  navText: {
    fontSize: 17,
    fontFamily: "PoppinsMedium",
    color: "#5F6F8C",
  },

  activeNavText: {
    color: COMMUNISHIELD_BLUE,
    fontFamily: "PoppinsSemiBold",
  },

  mainContent: {
    flex: 1,
  },

  topHeader: {
    height: 98,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#DCE5F2",
    shadowColor: COMMUNISHIELD_BLUE,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 3,
  },

  headerLeft: {
    flex: 1,
    marginRight: 20,
    flexDirection: "row",
    alignItems: "center",
  },

  headerTitleDivider: {
    width: 5,
    height: 54,
    borderRadius: 999,
    backgroundColor: COMMUNISHIELD_BLUE,
    marginRight: 16,
  },

  pageTitle: {
    fontSize: 34,
    color: "#16233A",
    fontFamily: "PoppinsSemiBold",
    marginBottom: 4,
  },

  pageDesc: {
    fontSize: 17,
    color: "#5F6F8C",
    fontFamily: "PoppinsMedium",
  },

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    position: "relative",
  },

  headerIconButton: {
    width: 48,
    height: 48,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE5F2",
  },

  activeHeaderButton: {
    backgroundColor: "#E8EEF9",
    borderColor: "#D6E0F0",
  },

  notificationWrapper: {
    position: "relative",
    zIndex: 50,
  },

  badge: {
    position: "absolute",
    top: -5,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DC2626",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "PoppinsSemiBold",
  },

  notificationDropdown: {
    position: "absolute",
    top: 58,
    right: -60,
    width: 385,
    maxHeight: 500,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E1E8F4",
    shadowColor: COMMUNISHIELD_BLUE,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 12,
    zIndex: 100,
    overflow: "hidden",
  },

  notificationHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF3FA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  notificationTitle: {
    fontSize: 18,
    fontFamily: "PoppinsSemiBold",
    color: "#16233A",
  },

  notificationSubtitle: {
    fontSize: 13,
    color: "#6B7A99",
    fontFamily: "PoppinsRegular",
    marginTop: 3,
  },

  closeNotificationButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F4F7FB",
    alignItems: "center",
    justifyContent: "center",
  },

  notificationList: {
    maxHeight: 355,
  },

  notificationItem: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F4FA",
    backgroundColor: "#FFFFFF",
  },

  unreadNotificationItem: {
    backgroundColor: "#F8FAFD",
  },

  notificationIconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#E8EEF9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  notificationContent: {
    flex: 1,
  },

  notificationItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  notificationItemTitle: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#16233A",
    flex: 1,
  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#DC2626",
    marginLeft: 8,
  },

  notificationMessage: {
    fontSize: 13,
    color: "#5F6F8C",
    fontFamily: "PoppinsRegular",
    lineHeight: 18,
    marginTop: 4,
  },

  notificationMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },

  notificationTime: {
    fontSize: 12,
    color: "#8A98B3",
    fontFamily: "PoppinsRegular",
  },

  priorityBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },

  priorityText: {
    fontSize: 11,
    fontFamily: "PoppinsSemiBold",
  },

  viewAllButton: {
    height: 48,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: "#EEF3FA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F8FAFD",
  },

  viewAllText: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  profileWrapper: {
    position: "relative",
    zIndex: 60,
  },

  profileSection: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE5F2",
  },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COMMUNISHIELD_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
  },

  profileInfo: {
    minWidth: 105,
  },

  profileText: {
    fontSize: 15,
    fontFamily: "PoppinsSemiBold",
    color: "#16233A",
  },

  profileRole: {
    fontSize: 12,
    color: "#6B7A99",
    fontFamily: "PoppinsRegular",
    marginTop: 1,
  },

  profileDropdown: {
    position: "absolute",
    top: 58,
    right: 0,
    width: 260,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E1E8F4",
    shadowColor: COMMUNISHIELD_BLUE,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 12,
    zIndex: 120,
    overflow: "hidden",
    paddingVertical: 6,
  },

  profileDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },

  profileDropdownIconBox: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  logoutIconBox: {
    backgroundColor: "#FDECEC",
  },

  profileDropdownTextBox: {
    flex: 1,
  },

  profileDropdownTitle: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#16233A",
  },

  profileDropdownSubtitle: {
    fontSize: 12,
    color: "#6B7A99",
    fontFamily: "PoppinsRegular",
    marginTop: 2,
  },

  logoutText: {
    color: "#DC2626",
  },

  pageContent: {
    flex: 1,
    paddingHorizontal: 26,
    paddingBottom: 26,
    paddingTop: 24,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E7ECF3",
  },

  modalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FDEBEC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  modalTitle: {
    fontSize: 20,
    fontFamily: "PoppinsSemiBold",
    color: "#16233A",
    marginBottom: 8,
    textAlign: "center",
  },

  modalSubtitle: {
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },

  modalButtonRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },

  modalCancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  modalCancelText: {
    fontSize: 14,
    fontFamily: "PoppinsMedium",
    color: "#475467",
  },

  modalConfirmButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },

  modalConfirmText: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#FFFFFF",
  },
};