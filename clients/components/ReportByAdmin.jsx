import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import formatRelativeTime from "../services/formatRelativeTime";
import formatDisplayLocation from "../services/formatDisplayLocation";
import censorText from "../services/censorText";

const PRIMARY = "#294880";

const FONT = {
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semiBold: "Poppins-SemiBold",
};

const ReportByAdmin = ({
  report = null,
  adminName,
  type,
  location,
  details,
  datePosted,
  postedDate,
  pic,
  image,
  onPress = () => {},
  style,
}) => {
  const [fontsLoaded] = useFonts({
    "Poppins-Regular": require("../assets/fonts/Poppins-Regular.ttf"),
    "Poppins-Medium": require("../assets/fonts/Poppins-Medium.ttf"),
    "Poppins-SemiBold": require("../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const { width } = useWindowDimensions();
  const isSmallScreen = width < 360;

  const cardWidth = Math.min(width - 24, 430);
  const imageHeight = isSmallScreen ? 150 : 180;

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={PRIMARY} />
      </View>
    );
  }

  const finalAdminName = adminName || report?.adminName || "Admin";
  const finalType = type || report?.type || "Safety/Tips";
  const finalLocation = formatDisplayLocation(
    location || report?.location || "Location not specified"
  );
  const finalDetails = censorText(details || report?.details || "No details provided.");
  const finalDatePosted =
    datePosted ||
    postedDate ||
    report?.datePosted ||
    report?.postedDate ||
    null;
  const finalPic = pic || image || report?.pic || report?.image || null;

  const getImageSource = (img) => {
    if (!img) return null;
    return typeof img === "string" ? { uri: img } : img;
  };

  const formatDatePosted = (dateValue) => {
    if (!dateValue) return "Date not specified";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return dateValue;
    }

    return formatRelativeTime(dateValue);
  };

  // const getTypeIcon = () => {
  //   const normalizedType = finalType.toLowerCase();

  //   if (normalizedType.includes("seminar")) {
  //     return "people-outline";
  //   }

  //   if (normalizedType.includes("curfew")) {
  //     return "moon-outline";
  //   }

  //   return "shield-checkmark-outline";
  // };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.wrapper, { width: cardWidth }, style]}
    >
      <View style={styles.header}>
        <View style={styles.adminInfoRow}>
          <View style={styles.adminAvatar}>
            <Ionicons name="megaphone-outline" size={21} color={PRIMARY} />
          </View>

          <View style={styles.adminTextWrap}>
            <Text style={styles.adminName} numberOfLines={1}>
              {finalAdminName}
            </Text>

            <Text style={styles.dateText} numberOfLines={1}>
              {formatDatePosted(finalDatePosted)}
            </Text>
          </View>
        </View>

        <View style={styles.adminBadge}>
          <Ionicons name="checkmark-circle" size={13} color={PRIMARY} />
          <Text style={styles.adminBadgeText}>Admin</Text>
        </View>
      </View>

      <View style={styles.content}>
        

        <Text style={styles.typeValue}>{finalType}</Text>

        <View style={styles.locationLine}>
          <Ionicons name="location-outline" size={15} color="#7B8794" />
          <Text style={styles.locationText} numberOfLines={2}>
            {finalLocation}
          </Text>
        </View>

        <Text style={styles.detailsText}>{finalDetails}</Text>

        {finalPic ? (
          <Image
            source={getImageSource(finalPic)}
            style={[styles.image, { height: imageHeight }]}
          />
        ) : (
          <View style={[styles.noImageBox, { minHeight: isSmallScreen ? 70 : 82 }]}>
            <Ionicons name="image-outline" size={22} color="#9CA3AF" />
            <Text style={styles.noImageText}>No image attached</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
  },

  wrapper: {
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 14,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: "#E4EBF7",
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  adminInfoRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
  },

  adminAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
  },

  adminTextWrap: {
    flex: 1,
    marginLeft: 11,
  },

  adminName: {
    fontFamily: FONT.semiBold,
    fontSize: 15,
    color: "#1F2A37",
  },

  dateText: {
    fontFamily: FONT.regular,
    marginTop: 2,
    fontSize: 11.5,
    color: "#7B8794",
  },

  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8EEF9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  adminBadgeText: {
    fontFamily: FONT.medium,
    marginLeft: 4,
    fontSize: 11,
    color: PRIMARY,
  },

  content: {
    paddingTop: 2,
  },

  typeLine: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },

  typeLabel: {
    fontFamily: FONT.regular,
    marginLeft: 6,
    fontSize: 12,
    color: "#7B8794",
  },

  typeValue: {
    fontFamily: FONT.semiBold,
    fontSize: 16,
    color: "#1F2A37",
    marginBottom: 8,
  },

  locationLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },

  locationText: {
    flex: 1,
    fontFamily: FONT.regular,
    marginLeft: 5,
    fontSize: 12.5,
    color: "#4B5563",
    lineHeight: 18,
  },

  detailsText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: "#3E4B61",
    lineHeight: 21,
    marginBottom: 13,
  },

  image: {
    width: "100%",
    borderRadius: 16,
    resizeMode: "cover",
    backgroundColor: "#E4EBF7",
  },

  noImageBox: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#F3F6FB",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D7E0F0",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },

  noImageText: {
    fontFamily: FONT.regular,
    marginTop: 5,
    fontSize: 12,
    color: "#9CA3AF",
  },
});

export default ReportByAdmin;