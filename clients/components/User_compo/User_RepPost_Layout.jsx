import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import formatDisplayLocation from "../../services/formatDisplayLocation";

const ARGUS_BLUE = "#294880";

const User_RepPost_Layout = ({
  userName = "Anonymous User",
  userAvatar = null,
  location = "Unknown location",
  incidentCategory = "Incident Category",
  incidentType = "Incident Type",
  details = "No details provided.",
  verified = false,
  likes = 0,
  comments = 0,
  images = [],
  onLike,
  onComment,
  style,
}) => {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.headerRow}>
        <View style={styles.avatarWrap}>
          {userAvatar ? (
            <Image source={userAvatar} style={styles.avatarImage} cachePolicy="memory-disk" transition={200} />
          ) : (
            <Ionicons name="person" size={20} color={ARGUS_BLUE} />
          )}
        </View>

        <View style={styles.headerTextWrap}>
          <Text style={styles.userName}>{userName}</Text>

          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color="#6B7280" />
            <Text style={styles.locationText} numberOfLines={1}>
              {formatDisplayLocation(location)}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.statusBadge,
            verified ? styles.verifiedBadge : styles.unverifiedBadge,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              verified ? styles.verifiedText : styles.unverifiedText,
            ]}
          >
            {verified ? "Verified" : "Pending"}
          </Text>
        </View>
      </View>

      <View style={styles.infoBox}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Category</Text>
          <Text style={styles.infoValue}>{incidentCategory}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Incident Type</Text>
          <Text style={styles.infoValue}>{incidentType}</Text>
        </View>
      </View>

      <Text style={styles.detailsText} numberOfLines={3}>
        {details}
      </Text>

      {images?.length > 0 ? (
        <View style={styles.imagePreview}>
          <Ionicons name="image-outline" size={22} color={ARGUS_BLUE} />
          <Text style={styles.imageText}>{images.length} attached media</Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionButton}
          activeOpacity={0.75}
          onPress={onLike}
        >
          <Ionicons name="heart-outline" size={19} color={ARGUS_BLUE} />
          <Text style={styles.actionText}>{likes}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          activeOpacity={0.75}
          onPress={onComment}
        >
          <Ionicons name="chatbubble-outline" size={19} color={ARGUS_BLUE} />
          <Text style={styles.actionText}>{comments} Comments</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.viewButton}
          activeOpacity={0.75}
          onPress={onComment}
        >
          <Text style={styles.viewButtonText}>View</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    shadowColor: "#8AA9E6",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },

  headerTextWrap: {
    flex: 1,
  },

  userName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1F2A37",
    marginBottom: 3,
  },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  locationText: {
    flex: 1,
    fontSize: 12,
    color: "#6B7280",
    marginLeft: 3,
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },

  verifiedBadge: {
    backgroundColor: "#DCFCE7",
  },

  unverifiedBadge: {
    backgroundColor: "#FEF3C7",
  },

  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },

  verifiedText: {
    color: "#16A34A",
  },

  unverifiedText: {
    color: "#D97706",
  },

  infoBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    marginBottom: 10,
  },

  infoRow: {
    marginBottom: 8,
  },

  infoLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 2,
  },

  infoValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1F2A37",
  },

  detailsText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#374151",
    marginBottom: 12,
  },

  imagePreview: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE7F5",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginBottom: 12,
  },

  imageText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#6B7280",
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
    paddingTop: 10,
  },

  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },

  actionText: {
    fontSize: 12,
    fontWeight: "700",
    color: ARGUS_BLUE,
    marginLeft: 5,
  },

  viewButton: {
    marginLeft: "auto",
    backgroundColor: "#E8EEF9",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },

  viewButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: ARGUS_BLUE,
  },
});

export default User_RepPost_Layout;