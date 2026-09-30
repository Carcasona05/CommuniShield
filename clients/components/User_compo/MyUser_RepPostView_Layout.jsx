import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../../services/apiClient";
import formatRelativeTime from "../../services/formatRelativeTime";
import formatDisplayLocation from "../../services/formatDisplayLocation";
import censorText from "../../services/censorText";
import { patchCachedReports } from "../../services/dataStore";
import { triggerRefresh } from "../../services/refreshBus";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "../Toast";

const PRIMARY = "#294880";

const FONT = {
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semiBold: "Poppins-SemiBold",
};

const COMMENT_WINDOW = 10;

const MyUser_RepPostView_Layout = ({ report }) => {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState([]);
  const [sending, setSending] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeState, setLikeState] = useState({
    liked: report?.isLiked ?? false,
    count: report?.likes ?? 0,
  });
  const [visibleCommentCount, setVisibleCommentCount] = useState(COMMENT_WINDOW);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [fontsLoaded] = useFonts({
    "Poppins-Regular": require("../../assets/fonts/Poppins-Regular.ttf"),
    "Poppins-Medium": require("../../assets/fonts/Poppins-Medium.ttf"),
    "Poppins-SemiBold": require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  useEffect(() => {
    let active = true;
    const loadComments = async () => {
      if (!report?.id) {
        setComments([]);
        return;
      }
      try {
        const token = await AsyncStorage.getItem("access_token");
        if (!token) return;
        const response = await apiClient.get(`/reports/${report.id}/comments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (active) setComments(response.data?.comments || []);
      } catch {
        if (active) setComments([]);
      }
    };
    loadComments();
    return () => {
      active = false;
    };
  }, [report?.id]);

  useEffect(() => {
    setLikeState({
      liked: report?.isLiked ?? false,
      count: report?.likes ?? 0,
    });
  }, [report?.isLiked, report?.likes]);

  useEffect(() => {
    setVisibleCommentCount(COMMENT_WINDOW);
  }, [report?.id]);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={PRIMARY} />
      </View>
    );
  }

  const getImageSource = (image) => {
    if (!image) return null;
    return typeof image === "string" ? { uri: image } : image;
  };

  const normalizeStatus = (value) => {
    const current = String(value || "").toLowerCase();

    if (current.includes("under")) return "Under Verification";
    if (current.includes("resolved")) return "Resolved";
    if (current.includes("reject")) return "Rejected";
    if (current.includes("archive")) return "Archived";
    if (current.includes("verified")) return "Resolved";
    if (current.includes("pending")) return "Pending Review";

    return report?.verified ? "Resolved" : "Pending Review";
  };

  const getStatusData = () => {
    const currentStatus = normalizeStatus(report?.status);

    switch (currentStatus) {
      case "Under Verification":
        return {
          label: "Under Verification",
          icon: "search-circle-outline",
          color: PRIMARY,
        };

      case "Resolved":
        return {
          label: "Resolved",
          icon: "checkmark-circle-outline",
          color: "#237A4B",
        };

      case "Rejected":
        return {
          label: "Rejected",
          icon: "close-circle-outline",
          color: "#C0392B",
        };

      case "Archived":
        return {
          label: "Archived",
          icon: "archive-outline",
          color: "#64748B",
        };

      default:
        return {
          label: "Pending Review",
          icon: "time-outline",
          color: "#9A6A00",
        };
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || !report?.id || sending) return;
    setSending(true);

    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) {
        toast.error("Please sign in to comment.");
        return;
      }
      await apiClient.post(
        `/reports/${report.id}/comments`,
        { content: commentText.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const response = await apiClient.get(`/reports/${report.id}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setComments(response.data?.comments || []);
      setCommentText("");
      triggerRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || "Could not add comment.");
    } finally {
      setSending(false);
    }
  };

  const handleLikeToggle = async () => {
    if (likeBusy || !report?.id) return;

    const token = await AsyncStorage.getItem("access_token");
    if (!token) {
      toast.error("Please sign in to like this post.");
      return;
    }

    setLikeBusy(true);
    try {
      const res = await apiClient.post(
        `/reports/${report.id}/like`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const liked = res.data?.liked ?? false;
      const serverLikes =
        typeof res.data?.likes === "number" ? res.data.likes : null;
      setLikeState((prev) => ({
        liked,
        count: serverLikes ?? Math.max(0, prev.count + (liked ? 1 : -1)),
      }));
      patchCachedReports(report.id, (r) => ({
        ...r,
        is_liked: liked,
        likes: serverLikes ?? (r.likes ?? 0) + (liked ? 1 : -1),
      }));
      triggerRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || "Could not update like.");
    } finally {
      setLikeBusy(false);
    }
  };

  if (!report) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="alert-circle-outline" size={38} color={PRIMARY} />
        <Text style={styles.emptyText}>No report data found.</Text>
      </View>
    );
  }

  const statusData = getStatusData();

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
<View style={styles.header}>
            <View style={styles.userSection}>
              {report.userAvatar ? (
                <Image
                  source={getImageSource(report.userAvatar)}
                  style={styles.avatarImage}
                  cachePolicy="memory-disk"
                  transition={200}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person-outline" size={23} color={PRIMARY} />
                </View>
              )}

          

              <View style={styles.userTextWrap}>
                <Text style={styles.userName} numberOfLines={1}>
                  {report.userName || "You"}
                </Text>

              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={13} color="#7B8794" />
                <Text style={styles.locationText} numberOfLines={1}>
                  {formatDisplayLocation(report.location) || "No location provided"}
                </Text>
              </View>
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={13} color="#7B8794" />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {report.location || "No location provided"}
                  </Text>
                </View>

              <View style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={12} color="#9CA3AF" />
              <Text style={styles.dateText} numberOfLines={1}>
                {formatRelativeTime(report.datePosted || report.createdAt) ||
                  "Just now"}
              </Text>
              </View>
            </View>
          </View>

            <View style={styles.statusWrap}>
            <Ionicons
              name={statusData.icon}
              size={14}
              color={statusData.color}
            />
            <Text style={[styles.statusText, { color: statusData.color }]}>
              {statusData.label}
            </Text>
          </View>
        </View>

        <View style={styles.contentBox}>
          <Text style={styles.categoryText}>
            {report.incidentCategory || "No category"}
          </Text>

          <Text style={styles.typeText} numberOfLines={2}>
            {report.incidentType || "No incident type"}
          </Text>

          <Text style={styles.detailsText}>
            {censorText(report.details) || "No report details provided."}
          </Text>

          {report.images?.length > 0 ? (
            <View style={styles.imageSection}>
              {report.images.length === 1 ? (
                <Image
                  source={getImageSource(report.images[0])}
                  style={styles.singleImage}
                  cachePolicy="memory-disk"
                  priority="high"
                  transition={300}
                />
              ) : (
                <View style={styles.imageRow}>
                  {report.images.slice(0, 2).map((image, index) => (
                    <Image
                      key={index}
                      source={getImageSource(image)}
                      style={styles.doubleImage}
                      cachePolicy="memory-disk"
                      priority="high"
                      transition={300}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.singleImagePlaceholder}>
              <Ionicons name="image-outline" size={24} color="#9CA3AF" />
              <Text style={styles.placeholderText}>No image attached</Text>
            </View>
          )}
        </View>

        <View style={styles.summaryRow}>
          <TouchableOpacity
            style={styles.summaryItem}
            activeOpacity={0.7}
            onPress={handleLikeToggle}
            disabled={likeBusy}
          >
            <Ionicons
              name={likeState.liked ? "thumbs-up" : "thumbs-up-outline"}
              size={18}
              color={PRIMARY}
            />
            <Text style={styles.summaryText}>{likeState.count} Likes</Text>
          </TouchableOpacity>

          <View style={styles.summaryItem}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={18}
              color={PRIMARY}
            />
            <Text style={styles.summaryText}>{comments.length} Comments</Text>
          </View>
        </View>
      </View>

      <View style={styles.commentsCard}>
        <View style={styles.commentsHeader}>
          <Text style={styles.commentsTitle}>Comments</Text>
          <Text style={styles.commentsCount}>{comments.length}</Text>
        </View>

        {comments.length > visibleCommentCount ? (
          <TouchableOpacity
            style={styles.viewMoreComments}
            activeOpacity={0.7}
            onPress={() =>
              setVisibleCommentCount((count) => count + COMMENT_WINDOW)
            }
          >
            <Text style={styles.viewMoreCommentsText}>
              View more comments ({comments.length - visibleCommentCount} more)
            </Text>
          </TouchableOpacity>
        ) : null}

        {comments.length === 0 ? (
          <View style={styles.noCommentsBox}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={22}
              color="#9CA3AF"
            />
            <Text style={styles.noCommentsText}>No comments yet.</Text>
          </View>
        ) : (
          comments.slice(-visibleCommentCount).map((comment) => (
            <View key={comment.id} style={styles.commentItem}>
              <View style={styles.commentAvatar}>
                <Ionicons name="person-outline" size={15} color={PRIMARY} />
              </View>

              <View style={styles.commentContent}>
                <View style={styles.commentBubble}>
                  <Text style={styles.commentUser}>
                    {comment.user || "CommuniShield User"}
                  </Text>

                  <Text style={styles.commentText}>{censorText(comment.text)}</Text>
                </View>

                <Text style={styles.commentDate}>
                  {formatRelativeTime(comment.datePosted) || "Just now"}
                </Text>
              </View>
            </View>
          ))
        )}

      </View>
    </ScrollView>

    <View
      style={[
        styles.commentFooter,
        {
          paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 20 : 12),
        },
        keyboardHeight > 0 ? { marginBottom: keyboardHeight } : null,
      ]}
    >
      <View style={styles.commentInputRow}>
        <TextInput
          style={styles.commentInput}
          value={commentText}
          onChangeText={setCommentText}
          placeholder="Write a comment..."
          placeholderTextColor="#9CA3AF"
          multiline
        />

        <TouchableOpacity
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          activeOpacity={0.8}
          onPress={handleAddComment}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="send" size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F3F6FB",
    alignItems: "center",
    justifyContent: "center",
  },

  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  content: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 130,
  },

  emptyContainer: {
    flex: 1,
    backgroundColor: "#F3F6FB",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  emptyText: {
    fontFamily: FONT.regular,
    marginTop: 10,
    fontSize: 14,
    color: "#6B7280",
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E4EBF7",
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 14,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  userSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
  },

  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },

  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F8FAFD",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E8EEF9",
  },

  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
  },

  userTextWrap: {
    flex: 1,
    marginLeft: 11,
  },

  userName: {
    fontFamily: FONT.semiBold,
    fontSize: 15,
    color: "#1F2A37",
  },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },

  locationText: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 11.5,
    color: "#7B8794",
    marginLeft: 4,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },

  dateText: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 11,
    color: "#9CA3AF",
    marginLeft: 4,
  },

  statusWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 2,
  },

  statusText: {
    fontFamily: FONT.medium,
    marginLeft: 4,
    fontSize: 11,
  },

  contentBox: {
    paddingTop: 2,
  },

  categoryText: {
    fontFamily: FONT.regular,
    fontSize: 12,
    color: "#7B8794",
    marginBottom: 2,
  },

  typeText: {
    fontFamily: FONT.semiBold,
    fontSize: 16,
    color: "#1F2A37",
    marginBottom: 8,
  },

  detailsText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: "#3E4B61",
    lineHeight: 21,
    marginBottom: 13,
  },

  imageSection: {
    width: "100%",
  },

  singleImage: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    resizeMode: "cover",
    backgroundColor: "#E4EBF7",
  },

  imageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  doubleImage: {
    width: "48.5%",
    height: 165,
    borderRadius: 16,
    resizeMode: "cover",
    backgroundColor: "#E4EBF7",
  },

  singleImagePlaceholder: {
    width: "100%",
    height: 150,
    borderRadius: 16,
    backgroundColor: "#F3F6FB",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D7E0F0",
    alignItems: "center",
    justifyContent: "center",
  },

  placeholderText: {
    fontFamily: FONT.regular,
    marginTop: 5,
    fontSize: 12,
    color: "#9CA3AF",
  },

  summaryRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E4EBF7",
    marginTop: 13,
    paddingTop: 14,
  },

  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 18,
  },

  summaryText: {
    fontFamily: FONT.medium,
    marginLeft: 6,
    fontSize: 13,
    color: PRIMARY,
  },

  commentsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E4EBF7",
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },

  commentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  commentsTitle: {
    fontFamily: FONT.semiBold,
    fontSize: 16,
    color: "#1F2A37",
  },

  commentsCount: {
    fontFamily: FONT.medium,
    marginLeft: 8,
    fontSize: 12,
    color: PRIMARY,
    backgroundColor: "#E8EEF9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },

  noCommentsBox: {
    minHeight: 70,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  noCommentsText: {
    fontFamily: FONT.regular,
    marginTop: 5,
    fontSize: 12,
    color: "#9CA3AF",
  },

  commentItem: {
    flexDirection: "row",
    marginBottom: 12,
  },

  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  commentContent: {
    flex: 1,
  },

  commentBubble: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },

  commentUser: {
    fontFamily: FONT.semiBold,
    fontSize: 12,
    color: "#1F2A37",
    marginBottom: 3,
  },

  commentText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
  },

  commentDate: {
    fontFamily: FONT.regular,
    fontSize: 10.5,
    color: "#9CA3AF",
    marginTop: 4,
    marginLeft: 6,
  },

  commentInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },

  commentFooter: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
    paddingHorizontal: 14,
    paddingTop: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },

  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 90,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E1E8F2",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: FONT.regular,
    fontSize: 13,
    color: "#111827",
  },

  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  sendButtonDisabled: {
    opacity: 0.6,
  },

  viewMoreComments: {
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 4,
  },

  viewMoreCommentsText: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: PRIMARY,
  },

  keyboardView: {
    flex: 1,
  },
});

export default MyUser_RepPostView_Layout;