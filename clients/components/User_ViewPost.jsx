import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  SafeAreaView,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFonts } from "expo-font";

const PRIMARY = "#294880";

const FONT = {
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semiBold: "Poppins-SemiBold",
};

const User_ViewPost = ({ post, onBack }) => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 360;

  const [fontsLoaded] = useFonts({
    "Poppins-Regular": require("../assets/fonts/Poppins-Regular.ttf"),
    "Poppins-Medium": require("../assets/fonts/Poppins-Medium.ttf"),
    "Poppins-SemiBold": require("../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const safePost = post || {
    id: "report_001",
    userName: "ARGUS User",
    userAvatar: null,
    location: "Mabini Street, Manila",
    incidentCategory: "Suspicious Activities",
    incidentType: "Loitering / Suspicious Presence",
    details:
      "A suspicious person was seen loitering near the gate around 9:30 PM.",
    verified: true,
    likes: 12,
    comments: 2,
    images: [],
    commentList: [],
  };

  const [comments, setComments] = useState(safePost.commentList || []);
  const [newComment, setNewComment] = useState("");

  const avatarSize = isSmallScreen ? 42 : 46;
  const iconSize = isSmallScreen ? 18 : 20;

  if (!fontsLoaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  const getImageSource = (img) => {
    if (!img) return null;
    return typeof img === "string" ? { uri: img } : img;
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    router.push("/User_Home");
  };

  const handleNotification = () => {
    router.push("/User_Notification");
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;

    const commentToAdd = {
      id: Date.now().toString(),
      user: "ARGUS User",
      text: newComment.trim(),
    };

    setComments((prev) => [...prev, commentToAdd]);
    setNewComment("");
  };

  const renderImages = () => {
    const images = safePost.images || [];
    const firstImage = getImageSource(images[0]);
    const secondImage = getImageSource(images[1]);

    if (!firstImage && !secondImage) return null;

    if (firstImage && !secondImage) {
      return <Image source={firstImage} style={styles.singleImage} cachePolicy="memory-disk" priority="high" transition={300} />;
    }

    return (
      <View style={styles.imageRow}>
        {firstImage ? <Image source={firstImage} style={styles.doubleImage} cachePolicy="memory-disk" priority="high" transition={300} /> : null}
        {secondImage ? <Image source={secondImage} style={styles.doubleImage} cachePolicy="memory-disk" priority="normal" transition={300} /> : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.headerIconButton}
            onPress={handleBack}
          >
            <Ionicons name="arrow-back" size={23} color={PRIMARY} />
          </TouchableOpacity>

          <Text style={styles.topBarTitle}>View Post</Text>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.headerIconButton}
            onPress={handleNotification}
          >
            <Ionicons name="notifications-outline" size={22} color={PRIMARY} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.postWrapper}>
            <View style={styles.headerRow}>
              <View style={styles.userSection}>
                {safePost.userAvatar ? (
                  <Image
                    source={getImageSource(safePost.userAvatar)}
                    style={[
                      styles.avatar,
                      {
                        width: avatarSize,
                        height: avatarSize,
                        borderRadius: avatarSize / 2,
                      },
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatarPlaceholder,
                      {
                        width: avatarSize,
                        height: avatarSize,
                        borderRadius: avatarSize / 2,
                      },
                    ]}
                  >
                    <Ionicons
                      name="person-outline"
                      size={avatarSize * 0.5}
                      color={PRIMARY}
                    />
                  </View>
                )}

                <View style={styles.userTextWrap}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {safePost.userName || "ARGUS User"}
                  </Text>

                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={13} color="#7B8794" />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {safePost.location}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.statusWrap}>
                <Ionicons
                  name={
                    safePost.verified
                      ? "shield-checkmark-outline"
                      : "time-outline"
                  }
                  size={14}
                  color={safePost.verified ? "#237A4B" : "#9A6A00"}
                />

                <Text
                  style={[
                    styles.statusText,
                    {
                      color: safePost.verified ? "#237A4B" : "#9A6A00",
                    },
                  ]}
                >
                  {safePost.verified ? "Verified" : "Pending"}
                </Text>
              </View>
            </View>

            <View style={styles.postContent}>
              <Text style={styles.categoryText}>
                {safePost.incidentCategory}
              </Text>

              <Text style={styles.typeText}>
                {safePost.incidentType}
              </Text>

              <Text style={styles.detailsText}>
                {safePost.details}
              </Text>

              {renderImages()}
            </View>

            <View style={styles.actionBar}>
              <View style={styles.actionButton}>
                <Ionicons
                  name="thumbs-up-outline"
                  size={iconSize}
                  color={PRIMARY}
                />
                <Text style={styles.actionText}>Like</Text>
                <Text style={styles.actionCount}>{safePost.likes}</Text>
              </View>

              <View style={styles.actionButton}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={iconSize}
                  color={PRIMARY}
                />
                <Text style={styles.actionText}>Comment</Text>
                <Text style={styles.actionCount}>{comments.length}</Text>
              </View>
            </View>
          </View>

          <View style={styles.commentSection}>
            <Text style={styles.commentSectionTitle}>Comments</Text>

            {comments.length > 0 ? (
              comments.map((comment) => (
                <View key={comment.id} style={styles.commentCard}>
                  <View style={styles.commentHeader}>
                    <View style={styles.commentAvatar}>
                      <Ionicons name="person-outline" size={16} color={PRIMARY} />
                    </View>

                    <Text style={styles.commentUser}>
                      {comment.user || "ARGUS User"}
                    </Text>
                  </View>

                  <Text style={styles.commentText}>{comment.text}</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyStateCard}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={30}
                  color="#8AA0C8"
                />

                <Text style={styles.emptyStateText}>
                  No comments yet. Be the first to comment.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Write a comment..."
            placeholderTextColor="#8A94A6"
            value={newComment}
            onChangeText={setNewComment}
            multiline
          />

          <TouchableOpacity
            style={styles.sendButton}
            activeOpacity={0.85}
            onPress={handleAddComment}
          >
            <Ionicons name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default User_ViewPost;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  topBar: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#F3F6FB",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F2",
  },

  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F2",
  },

  topBarTitle: {
    position: "absolute",
    left: 70,
    right: 70,
    textAlign: "center",
    fontFamily: FONT.semiBold,
    fontSize: 18,
    color: PRIMARY,
  },

  scrollContainer: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 20,
  },

  postWrapper: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 14,
    marginVertical: 8,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E4EBF7",
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  userSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
  },

  avatar: {
    backgroundColor: "#E8EEF9",
  },

  avatarPlaceholder: {
    backgroundColor: "#E8EEF9",
    justifyContent: "center",
    alignItems: "center",
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
    marginLeft: 4,
    fontSize: 11.5,
    color: "#7B8794",
  },

  statusWrap: {
    flexDirection: "row",
    alignItems: "center",
  },

  statusText: {
    fontFamily: FONT.medium,
    marginLeft: 4,
    fontSize: 11,
  },

  postContent: {
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
    lineHeight: 21,
    color: "#3E4B61",
    marginBottom: 13,
  },

  singleImage: {
    width: "100%",
    height: 180,
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
    height: 160,
    borderRadius: 16,
    resizeMode: "cover",
    backgroundColor: "#E4EBF7",
  },

  actionBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E4EBF7",
    marginTop: 13,
    paddingTop: 4,
  },

  actionButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 11,
  },

  actionText: {
    fontFamily: FONT.medium,
    marginLeft: 6,
    fontSize: 13,
    color: PRIMARY,
  },

  actionCount: {
    fontFamily: FONT.regular,
    marginLeft: 6,
    fontSize: 13,
    color: "#6C7A96",
  },

  commentSection: {
    marginTop: 10,
    marginBottom: 10,
  },

  commentSectionTitle: {
    fontFamily: FONT.semiBold,
    fontSize: 17,
    color: PRIMARY,
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  commentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E4EBF7",
    marginBottom: 10,
  },

  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  commentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E8EEF9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },

  commentUser: {
    fontFamily: FONT.semiBold,
    fontSize: 13,
    color: PRIMARY,
  },

  commentText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 20,
    color: "#3E4B61",
  },

  emptyStateCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E4EBF7",
    alignItems: "center",
  },

  emptyStateText: {
    fontFamily: FONT.regular,
    marginTop: 10,
    fontSize: 13,
    color: "#7D8CA6",
    textAlign: "center",
    lineHeight: 20,
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F2",
  },

  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 100,
    backgroundColor: "#F7FAFF",
    borderWidth: 1,
    borderColor: "#D8E2F0",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONT.regular,
    fontSize: 14,
    color: "#1F2A37",
    marginRight: 10,
  },

  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: PRIMARY,
    justifyContent: "center",
    alignItems: "center",
  },
});