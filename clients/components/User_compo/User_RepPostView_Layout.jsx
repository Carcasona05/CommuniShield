import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../../services/apiClient";
import formatRelativeTime from "../../services/formatRelativeTime";
import formatDisplayLocation from "../../services/formatDisplayLocation";

const PRIMARY = "#294880";

const FONT = {
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semiBold: "Poppins-SemiBold",
};

const User_RepPostView_Layout = ({ post }) => {
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState([]);

  useEffect(() => {
    const loadComments = async () => {
      if (!post?.id) return;
      try {
        const token = await AsyncStorage.getItem("access_token");
        if (!token) return;

        const res = await apiClient.get(`/reports/${post.id}/comments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setComments(res.data?.comments || []);
      } catch {
        setComments(post?.commentList || []);
      }
    };

    loadComments();
  }, [post?.id]);

  const [fontsLoaded] = useFonts({
    "Poppins-Regular": require("../../assets/fonts/Poppins-Regular.ttf"),
    "Poppins-Medium": require("../../assets/fonts/Poppins-Medium.ttf"),
    "Poppins-SemiBold": require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={PRIMARY} />
      </View>
    );
  }

  const getImageSource = (img) => {
    if (!img) return null;
    return typeof img === "string" ? { uri: img } : img;
  };

  const normalizeStatus = (value) => {
    const current = String(value || "").toLowerCase();

    if (current.includes("under")) return "Under Verification";
    if (current.includes("resolved")) return "Resolved";
    if (current.includes("reject")) return "Rejected";
    if (current.includes("archive")) return "Archived";
    if (current.includes("verified")) return "Resolved";
    if (current.includes("pending")) return "Pending Review";

    return post?.verified ? "Resolved" : "Pending Review";
  };

  const getStatusData = () => {
    const currentStatus = normalizeStatus(post?.status);

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
    if (!commentText.trim()) return;

    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) {
        Alert.alert("Not Signed In", "Please sign in to comment.");
        return;
      }

      await apiClient.post(
        `/reports/${post.id}/comments`,
        { content: commentText.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const res = await apiClient.get(`/reports/${post.id}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setComments(res.data?.comments || []);
      setCommentText("");
    } catch (error) {
      Alert.alert(
        "Comment Failed",
        error.response?.data?.error || "Could not add comment."
      );
    }
  };

  if (!post) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="alert-circle-outline" size={38} color={PRIMARY} />
        <Text style={styles.emptyText}>No post data found.</Text>
      </View>
    );
  }

  const statusData = getStatusData();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.userSection}>
            {post.userAvatar ? (
              <Image
                source={getImageSource(post.userAvatar)}
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
                {post.userName || "CommuniShield User"}
              </Text>

              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={13} color="#7B8794" />
                <Text style={styles.locationText} numberOfLines={1}>
                  {formatDisplayLocation(post.location) || "Location not specified"}
                </Text>
              </View>

              <View style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={12} color="#9CA3AF" />
                <Text style={styles.dateText} numberOfLines={1}>
                  {formatRelativeTime(post.datePosted) || "Just now"}
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
            {post.incidentCategory || "Not specified"}
          </Text>

          <Text style={styles.typeText} numberOfLines={2}>
            {post.incidentType || "Not specified"}
          </Text>

          <Text style={styles.detailsText}>
            {post.details || "No details provided."}
          </Text>

          {post.images?.length > 0 ? (
            <View style={styles.imageSection}>
              {post.images.length === 1 ? (
                <Image
                  source={getImageSource(post.images[0])}
                  style={styles.singleImage}
                  cachePolicy="memory-disk"
                  priority="high"
                  transition={300}
                />
              ) : (
                <View style={styles.imageRow}>
                  {post.images.slice(0, 2).map((image, index) => (
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
          <View style={styles.summaryItem}>
            <Ionicons name="thumbs-up-outline" size={18} color={PRIMARY} />
            <Text style={styles.summaryText}>{post.likes || 0} Likes</Text>
          </View>

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
          comments.map((comment) => (
            <View key={comment.id} style={styles.commentItem}>
              <View style={styles.commentAvatar}>
                <Ionicons name="person-outline" size={15} color={PRIMARY} />
              </View>

              <View style={styles.commentContent}>
                <View style={styles.commentBubble}>
                  <Text style={styles.commentUser}>
                    {comment.user || "CommuniShield User"}
                  </Text>

                  <Text style={styles.commentText}>{comment.text}</Text>
                </View>

                <Text style={styles.commentDate}>
                  {formatRelativeTime(comment.datePosted) || "Just now"}
                </Text>
              </View>
            </View>
          ))
        )}

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
            style={styles.sendButton}
            activeOpacity={0.8}
            onPress={handleAddComment}
          >
            <Ionicons name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
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
    paddingBottom: 34,
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
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
    paddingTop: 12,
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
});

export default User_RepPostView_Layout;