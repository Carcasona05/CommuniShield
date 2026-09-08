import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import useScrollToTop from "../../hooks/useScrollToTop";
import { subscribeRefresh } from "../../services/refreshBus";
import { getCache, setCache } from "../../services/dataStore";

const COMMUNISHIELD_BLUE = "#294880";

const formatRelativeTime = (iso) => {
  if (!iso) return "";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatLoginTime = (iso) => {
  if (!iso) return "";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return `${sameDay ? "Today" : "Yesterday"}, ${date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;
};

const mapNotifications = (notifData, loginData) => ({
  userReports: (notifData?.reportStatuses || []).map((item) => ({
    ...item,
    time: formatRelativeTime(item.time),
  })),
  nearbyIncidents: (notifData?.nearbyIncidents || []).map((item) => ({
    ...item,
    time: formatRelativeTime(item.time),
  })),
  loginActivity: (loginData?.activities || []).map((item) => ({
    ...item,
    time: formatLoginTime(item.time),
  })),
});

const ReportStatusCard = ({ item }) => {
  return (
    <TouchableOpacity activeOpacity={0.86} style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.iconTitleWrap}>
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: item.verified ? "#E8F7EE" : "#FFF4CC",
              },
            ]}
          >
            <Ionicons
              name={item.verified ? "shield-checkmark" : "warning"}
              size={18}
              color={item.verified ? "#1E8E5A" : "#9B6A00"}
            />
          </View>

          <View style={styles.cardTitleWrap}>
            <ThemedText style={styles.cardTitle}>{item.title}</ThemedText>
            <ThemedText style={styles.cardTime}>{item.time}</ThemedText>
          </View>
        </View>

        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: item.verified ? "#E8F7EE" : "#FFF4CC",
            },
          ]}
        >
          <ThemedText
            style={[
              styles.statusPillText,
              {
                color: item.verified ? "#1E8E5A" : "#9B6A00",
              },
            ]}
          >
            {item.verified ? "Verified" : "Unverified"}
          </ThemedText>
        </View>
      </View>

      <ThemedText style={styles.cardMessage}>{item.message}</ThemedText>

      <View style={styles.metaRow}>
        <Ionicons name="location" size={14} color="#1E5EFF" />
        <ThemedText style={styles.metaText}>{item.location}</ThemedText>
      </View>
    </TouchableOpacity>
  );
};

const NearbyIncidentCard = ({ item, onViewPost }) => {
  const high = item.level === "High";

  return (
    <TouchableOpacity activeOpacity={0.86} style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.iconTitleWrap}>
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: high ? "#FFE8E8" : "#FFF3DE" },
            ]}
          >
            <Ionicons
              name={high ? "alert-circle" : "notifications"}
              size={18}
              color={high ? "#D64545" : "#F4A62A"}
            />
          </View>

          <View style={styles.cardTitleWrap}>
            <ThemedText style={styles.cardTitle}>{item.type}</ThemedText>
            <ThemedText style={styles.cardTime}>{item.time}</ThemedText>
          </View>
        </View>

        <View
          style={[
            styles.statusPill,
            { backgroundColor: high ? "#FFE8E8" : "#FFF3DE" },
          ]}
        >
          <ThemedText
            style={[
              styles.statusPillText,
              { color: high ? "#C53030" : "#B9770E" },
            ]}
          >
            {item.level}
          </ThemedText>
        </View>
      </View>

      <ThemedText style={styles.cardMessage}>{item.message}</ThemedText>

      <View style={styles.metaRowBetween}>
        <View style={styles.metaRow}>
          <Ionicons name="navigate" size={14} color="#1E5EFF" />
          <ThemedText style={styles.metaText}>{item.distance}</ThemedText>
        </View>

        <TouchableOpacity activeOpacity={0.8} onPress={() => onViewPost(item.reportId)}>
          <ThemedText style={styles.linkText}>View Post</ThemedText>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const LoginCard = ({ item }) => {
  return (
    <TouchableOpacity activeOpacity={0.86} style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.iconTitleWrap}>
          <View style={[styles.iconBadge, { backgroundColor: "#EEF4FF" }]}>
            <Ionicons
              name={
                item.device.toLowerCase().includes("windows")
                  ? "desktop"
                  : "phone-portrait"
              }
              size={18}
              color="#1E5EFF"
            />
          </View>

          <View style={styles.cardTitleWrap}>
            <ThemedText style={styles.cardTitle}>{item.device}</ThemedText>
            <ThemedText style={styles.cardTime}>{item.time}</ThemedText>
          </View>
        </View>

        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: item.current ? "#EAF2FF" : "#F4F7FB",
            },
          ]}
        >
          <ThemedText
            style={[
              styles.statusPillText,
              {
                color: item.current ? "#1E5EFF" : "#68758A",
              },
            ]}
          >
            {item.current ? "Current" : "Recent"}
          </ThemedText>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={14} color="#1E5EFF" />
        <ThemedText style={styles.metaText}>{item.location}</ThemedText>
      </View>
    </TouchableOpacity>
  );
};

const SectionHeader = ({ title, action, onAction }) => {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>

      {action ? (
        <TouchableOpacity activeOpacity={0.8} onPress={onAction}>
          <ThemedText style={styles.sectionAction}>{action}</ThemedText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const User_Notification = () => {
  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [userReports, setUserReports] = useState([]);
  const [nearbyIncidents, setNearbyIncidents] = useState([]);
  const [loginActivity, setLoginActivity] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    reports: false,
    nearby: false,
    login: false,
  });
  const scrollRef = useScrollToTop();
  const router = useRouter();

  const toggleSection = (key) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const openNearbyPost = useCallback(
    async (reportId) => {
      if (!reportId) return;
      try {
        const token = await AsyncStorage.getItem("access_token");
        if (!token) return;
        const res = await apiClient.get("/reports", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const report = (res.data?.reports || []).find(
          (r) => r.id === reportId
        );
        if (report) {
          router.push({
            pathname: "/User_RepPostView",
            params: { post: JSON.stringify(report) },
          });
        }
      } catch {
        // ignore
      }
    },
    [router]
  );

  const LIMIT = 5;
  const sliceItems = (items, expanded) =>
    expanded ? items : items.slice(0, LIMIT);

  const loadNotifications = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cachedNotif = getCache("api:/notifications");
      const cachedLogin = getCache("api:/notifications/login-activity");
      if (cachedNotif !== undefined || cachedLogin !== undefined) {
        const mapped = mapNotifications(cachedNotif, cachedLogin);
        setUserReports(mapped.userReports);
        setNearbyIncidents(mapped.nearbyIncidents);
        setLoginActivity(mapped.loginActivity);
      }

      const [notifRes, loginRes] = await Promise.all([
        apiClient.get("/notifications", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        apiClient.get("/notifications/login-activity", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setCache("api:/notifications", notifRes.data ?? {});
      setCache("api:/notifications/login-activity", loginRes.data ?? {});

      const mapped = mapNotifications(notifRes.data, loginRes.data);
      setUserReports(mapped.userReports);
      setNearbyIncidents(mapped.nearbyIncidents);
      setLoginActivity(mapped.loginActivity);
    } catch {
      // leave lists empty on failure
    } finally {
      setRefreshing(false);
    }
  }, []);

  useAutoRefresh(loadNotifications, 30000);

  useEffect(() => subscribeRefresh(loadNotifications), [loadNotifications]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications();
  }, [loadNotifications]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COMMUNISHIELD_BLUE]}
            tintColor={COMMUNISHIELD_BLUE}
          />
        }
      >
        <View style={styles.sectionBlock}>
          <SectionHeader
            title="Your Reports"
            action={
              userReports.length > LIMIT
                ? expandedSections.reports
                  ? "Show Less"
                  : "See All"
                : null
            }
            onAction={() => toggleSection("reports")}
          />

          {userReports.length === 0 ? (
            <ThemedText style={styles.emptyText}>No report updates yet.</ThemedText>
          ) : (
            sliceItems(userReports, expandedSections.reports).map((item) => (
              <ReportStatusCard key={item.id} item={item} />
            ))
          )}
        </View>

        <View style={styles.sectionBlock}>
          <SectionHeader
            title="Incident Reports Near Your Location"
            action={
              nearbyIncidents.length > LIMIT
                ? expandedSections.nearby
                  ? "Show Less"
                  : "See All"
                : null
            }
            onAction={() => toggleSection("nearby")}
          />

          {nearbyIncidents.length === 0 ? (
            <ThemedText style={styles.emptyText}>No nearby incidents at this time.</ThemedText>
          ) : (
            sliceItems(nearbyIncidents, expandedSections.nearby).map((item) => (
              <NearbyIncidentCard
                key={item.id}
                item={item}
                onViewPost={openNearbyPost}
              />
            ))
          )}
        </View>

        <View style={styles.sectionBlock}>
          <SectionHeader
            title="Recent Account Login"
            action={
              loginActivity.length > LIMIT
                ? expandedSections.login
                  ? "Show Less"
                  : "See All"
                : null
            }
            onAction={() => toggleSection("login")}
          />

          {loginActivity.length === 0 ? (
            <ThemedText style={styles.emptyText}>No login activity found.</ThemedText>
          ) : (
            sliceItems(loginActivity, expandedSections.login).map((item) => (
              <LoginCard key={item.id} item={item} />
            ))
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  scrollContainer: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 28,
  },

  sectionBlock: {
    marginBottom: 16,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 18,
    fontFamily: "PoppinsSemiBold",
    color: "#1F2A37",
  },

  sectionAction: {
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: COMMUNISHIELD_BLUE,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E7ECF3",
  },

  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  iconTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
  },

  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  cardTitleWrap: {
    flex: 1,
  },

  cardTitle: {
    fontSize: 15,
    fontFamily: "PoppinsSemiBold",
    color: "#1F2937",
    marginBottom: 4,
  },

  cardTime: {
    fontSize: 11,
    fontFamily: "PoppinsRegular",
    color: "#6B7280",
  },

  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  statusPillText: {
    fontSize: 11,
    fontFamily: "PoppinsSemiBold",
  },

  cardMessage: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "PoppinsRegular",
    color: "#5F6B7A",
    marginTop: 12,
    marginBottom: 12,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  metaRowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  metaText: {
    marginLeft: 6,
    fontSize: 12,
    fontFamily: "PoppinsRegular",
    color: "#667085",
  },

  linkText: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
    color: "#1E5EFF",
  },

  emptyText: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#9CA3AF",
    textAlign: "center",
    paddingVertical: 16,
  },
});

export default User_Notification;