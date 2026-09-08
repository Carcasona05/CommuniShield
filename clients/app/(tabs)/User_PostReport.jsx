import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  useWindowDimensions,
  Platform,
} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import Dropdown from "../../components/Dropdown";
import ToastProvider, { useToast } from "../../components/Toast";
import apiClient from "../../services/apiClient";
import { uploadImages } from "../../services/imageUpload";
import { getCache, setCache } from "../../services/dataStore";

const COMMUNISHIELD_BLUE = "#294880";

const FALLBACK_CATEGORIES = [
  {
    category: "Public Safety Incidents",
    types: [
      "Public Disturbance",
      "Harassment",
      "Loitering / Suspicious Presence",
      "Trespassing",
    ],
  },
  {
    category: "Property-Related Incidents",
    types: ["Theft", "Lost Property", "Vandalism / Property Damage", "Shoplifting"],
  },
  {
    category: "Traffic and Road Incidents",
    types: ["Vehicular Accident", "Reckless Driving", "Illegal Parking", "Road Obstruction"],
  },
  {
    category: "Community and Environmental Concerns",
    types: [
      "Fire Incident",
      "Flooding",
      "Blocked Drainage",
      "Garbage / Sanitation Issues",
      "Streetlight Outage",
    ],
  },
  {
    category: "Suspicious Activities",
    types: [
      "Suspicious Person",
      "Suspicious Vehicle",
      "Unattended / Abandoned Object",
      "Unusual Behavior",
    ],
  },
  {
    category: "Public Assistance / Community Reports",
    types: ["Missing Pet", "Lost Item", "Request for Assistance", "General Safety Concern"],
  },
  {
    category: "Cyber and Online Incidents (Non-sensitive)",
    types: [
      "Online Scam / Suspicious Message",
      "Cyberbullying",
      "Fake Information / Misinformation",
    ],
  },
];

export default function User_PostReport() {
  return (
    <ToastProvider>
      <UserPostReportInner />
    </ToastProvider>
  );
}

function UserPostReportInner() {
  const toast = useToast();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const navHeight = width < 340 ? 62 : width < 390 ? 66 : 70;
  const bottomSpace =
    Platform.OS === "ios"
      ? Math.max(insets.bottom, 10) + 6
      : Math.max(insets.bottom, 8) + 8;
  const bottomPadding = navHeight + bottomSpace + 24;

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [displayNameType, setDisplayNameType] = useState("Fullname");

  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [incidentCategory, setIncidentCategory] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [categoryOptions, setCategoryOptions] = useState(FALLBACK_CATEGORIES);
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState([]);
  const [loadingLocation, setLoadingLocation] = useState(true);

  const incidentOptions = categoryOptions.length
    ? categoryOptions
    : FALLBACK_CATEGORIES;
  const incidentTypes = useMemo(() => {
    const found = incidentOptions.find(
      (o) => o.category === incidentCategory
    );
    return found?.types || [];
  }, [incidentOptions, incidentCategory]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = await AsyncStorage.getItem("access_token");
        if (!token) return;

        const cached = getCache("api:/profile");
        if (cached !== undefined) {
          const cachedFull =
            cached.name ||
            `${cached.first_name || ""} ${cached.last_name || ""}`.trim();
          if (cachedFull) setFullName(cachedFull);
          if (cached.user_name) setUsername(cached.user_name);
        }

        const res = await apiClient.get("/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const profile = res.data ?? {};
        setCache("api:/profile", profile);
        const full =
          profile.name ||
          `${profile.first_name || ""} ${profile.last_name || ""}`.trim();

        if (full) setFullName(full);
        if (profile.user_name) setUsername(profile.user_name);
      } catch {
        // leave defaults empty
      }
    };

    loadProfile();

    const loadCategories = async () => {
      try {
        const token = await AsyncStorage.getItem("access_token");
        if (!token) return;

        const cached = getCache("api:/incidents/options");
        if (cached !== undefined) {
          setCategoryOptions(cached?.categories || []);
        }

        const res = await apiClient.get("/incidents/options", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const options = res.data?.categories || [];
        setCache("api:/incidents/options", res.data ?? {});
        setCategoryOptions(options);
      } catch {
        // keep defaults
      }
    };

    loadCategories();
  }, []);

  useEffect(() => {
    getCurrentLocation();
  }, []);

  useEffect(() => {
    if (!incidentTypes.includes(incidentType)) {
      setIncidentType("");
    }
  }, [incidentCategory, incidentType, incidentTypes]);

  const fetchPlaceName = async (lat, lng) => {
    try {
      const [geocode] = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lng,
      });

      if (geocode) {
        const barangay = (geocode.district || geocode.subregion || geocode.name || "").trim();
        const city = (geocode.city || geocode.subregion || "").trim();
        const province = (geocode.region || "").trim();

        const parts = [];
        [barangay, city, province].forEach((item) => {
          if (item && !parts.some((p) => p.toLowerCase() === item.toLowerCase())) {
            parts.push(item);
          }
        });

        if (parts.length > 0) {
          return parts.join(", ");
        }
      }
    } catch {
      // ignore native error & fallback to openstreetmap
    }

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "CommuniShield-App/1.0",
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const addr = data.address;
        if (addr) {
          const barangay = (addr.suburb || addr.village || addr.neighbourhood || addr.quarter || addr.hamlet || addr.road || "").trim();
          const city = (addr.town || addr.city || addr.municipality || addr.district || "").trim();
          const province = (addr.state || addr.region || addr.county || "").trim();

          const parts = [];
          [barangay, city, province].forEach((item) => {
            if (item && !parts.some((p) => p.toLowerCase() === item.toLowerCase())) {
              parts.push(item);
            }
          });

          if (parts.length > 0) {
            return parts.join(", ");
          }
        }
      }
    } catch {
      // fallback
    }

    return null;
  };

  const getCurrentLocation = async () => {
    try {
      setLoadingLocation(true);

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        setLocation("Location permission denied");
        setLatitude("");
        setLongitude("");
        setLoadingLocation(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const lat = currentLocation.coords.latitude;
      const lng = currentLocation.coords.longitude;

      const fetchedLatitude = lat.toFixed(6);
      const fetchedLongitude = lng.toFixed(6);

      setLatitude(fetchedLatitude);
      setLongitude(fetchedLongitude);

      const placeName = await fetchPlaceName(lat, lng);
      setLocation(placeName || `Location near ${fetchedLatitude}, ${fetchedLongitude}`);
    } catch {
      setLocation("Unable to fetch current location");
      setLatitude("");
      setLongitude("");
    } finally {
      setLoadingLocation(false);
    }
  };

  const handlePickPhoto = async () => {
    if (photos.length >= 3) {
      toast.error("You can only upload up to 3 photos.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      toast.error("Please allow access to your photo library.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length) {
      const selectedUri = result.assets[0].uri;
      setPhotos((prev) => [...prev, selectedUri]);
    }
  };

  const handleRemovePhoto = (indexToRemove) => {
    setPhotos((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handlePostReport = async () => {
    const selectedDisplayName =
      displayNameType === "Fullname" ? fullName : username.trim();

    if (
      !selectedDisplayName ||
      !latitude ||
      !longitude ||
      !incidentCategory ||
      !incidentType ||
      !details.trim()
    ) {
      toast.error(
        "Please complete the display name, location, category, incident type, and details."
      );
      return;
    }

    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) {
        toast.error("Please sign in to post a report.");
        return;
      }

      const photoUrls = await uploadImages(photos);

      await apiClient.post(
        "/reports",
        {
          poster_name: selectedDisplayName,
          display_name_type: displayNameType,
          location,
          latitude,
          longitude,
          incident_category: incidentCategory,
          incident_type: incidentType,
          details,
          photos: photoUrls,
          status: "Pending Review",
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      resetForm();

      toast.success(
        "Report submitted successfully. It is now pending review."
      );

      setTimeout(() => {
        router.replace("/User_Home");
      }, 1200);
    } catch (error) {
      toast.error(
        error.response?.data?.error || "Could not submit your report. Please try again."
      );
    }
  };

  const resetForm = () => {
    setDisplayNameType("Fullname");
    setLocation("");
    setLatitude("");
    setLongitude("");
    setIncidentCategory("");
    setIncidentType("");
    setDetails("");
    setPhotos([]);
    setLoadingLocation(true);
    getCurrentLocation();
  };

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formCard}>
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Display Name</ThemedText>

            <View style={styles.nameChoiceRow}>
              <TouchableOpacity
                style={[
                  styles.nameChoiceButton,
                  displayNameType === "Fullname" &&
                    styles.nameChoiceButtonActive,
                ]}
                activeOpacity={0.85}
                onPress={() => setDisplayNameType("Fullname")}
              >
                <Ionicons
                  name={
                    displayNameType === "Fullname"
                      ? "radio-button-on"
                      : "radio-button-off"
                  }
                  size={16}
                  color={
                    displayNameType === "Fullname" ? COMMUNISHIELD_BLUE : "#8A94A6"
                  }
                />

                <ThemedText
                  style={[
                    styles.nameChoiceText,
                    displayNameType === "Fullname" &&
                      styles.nameChoiceTextActive,
                  ]}
                >
                  Fullname
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.nameChoiceButton,
                  displayNameType === "Username" &&
                    styles.nameChoiceButtonActive,
                ]}
                activeOpacity={0.85}
                onPress={() => setDisplayNameType("Username")}
              >
                <Ionicons
                  name={
                    displayNameType === "Username"
                      ? "radio-button-on"
                      : "radio-button-off"
                  }
                  size={16}
                  color={
                    displayNameType === "Username" ? COMMUNISHIELD_BLUE : "#8A94A6"
                  }
                />

                <ThemedText
                  style={[
                    styles.nameChoiceText,
                    displayNameType === "Username" &&
                      styles.nameChoiceTextActive,
                  ]}
                >
                  Username / Nickname
                </ThemedText>
              </TouchableOpacity>
            </View>

            {displayNameType === "Fullname" ? (
              <TextInput
                style={[styles.input, styles.disabledInput]}
                value={fullName}
                editable={false}
                placeholderTextColor="#8A94A6"
              />
            ) : (
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Enter username or nickname"
                placeholderTextColor="#8A94A6"
              />
            )}

            <ThemedText style={styles.helperText}>
              This name will appear as the reporter name on your submitted
              report.
            </ThemedText>
          </View>

          <View style={styles.fieldContainer}>
            <View style={styles.locationHeaderRow}>
              <ThemedText style={styles.label}>Current Location</ThemedText>

              <TouchableOpacity
                style={styles.refreshButton}
                activeOpacity={0.85}
                onPress={getCurrentLocation}
                disabled={loadingLocation}
              >
                <Ionicons
                  name="refresh-outline"
                  size={14}
                  color={COMMUNISHIELD_BLUE}
                />
                <ThemedText style={styles.refreshText}>
                  {loadingLocation ? "Fetching" : "Refresh"}
                </ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.locationInputWrap}>
              <Ionicons
                name="location-outline"
                size={18}
                color={COMMUNISHIELD_BLUE}
              />

              <TextInput
                style={styles.locationInput}
                value={location}
                editable={false}
                pointerEvents="none"
                placeholder={
                  loadingLocation
                    ? "Fetching current location..."
                    : "Location will be fetched automatically"
                }
                placeholderTextColor="#8A94A6"
              />
            </View>

            <ThemedText style={styles.helperText}>
              Location is automatically fetched and cannot be edited manually.
            </ThemedText>
          </View>

          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Incident Category</ThemedText>

            <Dropdown
              placeholder="Select Incident Category"
              selectedValue={incidentCategory}
              options={incidentOptions.map((option) => ({
                label: option.category,
                value: option.category,
              }))}
              onChange={setIncidentCategory}
            />
          </View>

          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Incident Type</ThemedText>

            <Dropdown
              placeholder={
                incidentCategory
                  ? "Select Incident Type"
                  : "Select category first"
              }
              selectedValue={incidentType}
              options={incidentTypes.map((type) => ({
                label: type,
                value: type,
              }))}
              onChange={setIncidentType}
              disabled={!incidentCategory}
            />
          </View>

          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Report Details</ThemedText>

            <TextInput
              style={styles.textArea}
              value={details}
              onChangeText={setDetails}
              placeholder="Describe what happened..."
              placeholderTextColor="#8A94A6"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.fieldContainer}>
            <View style={styles.photoHeaderRow}>
              <ThemedText style={styles.label}>Photo Evidence</ThemedText>

              <ThemedText style={styles.photoCount}>
                {photos.length}/3
              </ThemedText>
            </View>

            <TouchableOpacity
              style={styles.uploadButton}
              activeOpacity={0.88}
              onPress={handlePickPhoto}
            >
              <Ionicons name="images-outline" size={18} color={COMMUNISHIELD_BLUE} />

              <ThemedText style={styles.uploadButtonText}>
                Choose from Album
              </ThemedText>
            </TouchableOpacity>

            <ThemedText style={styles.helperText}>
              Optional. You can upload up to 3 photos.
            </ThemedText>

            {photos.length > 0 ? (
              <View style={styles.photoGrid}>
                {photos.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.photoCard}>
                    <Image source={{ uri }} style={styles.photoPreview} />

                    <TouchableOpacity
                      style={styles.removePhotoButton}
                      onPress={() => handleRemovePhoto(index)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.postButton}
            onPress={handlePostReport}
            activeOpacity={0.88}
          >
            <ThemedText style={styles.postButtonText}>Post Report</ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  keyboardView: {
    flex: 1,
  },

  scrollContainer: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },

  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    marginBottom: 16,
  },

  fieldContainer: {
    marginBottom: 16,
  },

  label: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
    marginBottom: 8,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8E0EB",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "PoppinsRegular",
    color: "#1F2A37",
  },

  disabledInput: {
    backgroundColor: "#F8FAFD",
    color: "#68758A",
  },

  nameChoiceRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },

  nameChoiceButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8E0EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  nameChoiceButtonActive: {
    backgroundColor: "#EEF3FF",
    borderColor: COMMUNISHIELD_BLUE,
  },

  nameChoiceText: {
    marginLeft: 7,
    fontSize: 12,
    fontFamily: "PoppinsMedium",
    color: "#68758A",
  },

  nameChoiceTextActive: {
    color: COMMUNISHIELD_BLUE,
    fontFamily: "PoppinsSemiBold",
  },

  locationHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF3FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },

  refreshText: {
    marginLeft: 4,
    fontSize: 11,
    fontFamily: "PoppinsMedium",
    color: COMMUNISHIELD_BLUE,
  },

  locationInputWrap: {
    minHeight: 50,
    backgroundColor: "#F8FAFD",
    borderWidth: 1,
    borderColor: "#D8E0EB",
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  locationInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    fontFamily: "PoppinsRegular",
    color: "#1F2A37",
  },

  textArea: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8E0EB",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 140,
    fontSize: 15,
    fontFamily: "PoppinsRegular",
    color: "#1F2A37",
  },

  photoHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  photoCount: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
    color: "#68758A",
  },

  uploadButton: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8E0EB",
    backgroundColor: "#F8FAFD",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  uploadButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  helperText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "PoppinsRegular",
    color: "#68758A",
  },

  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
  },

  photoCard: {
    width: 92,
    height: 92,
    borderRadius: 16,
    overflow: "hidden",
    marginRight: 10,
    marginBottom: 10,
    position: "relative",
    backgroundColor: "#EEF2F7",
    borderWidth: 1,
    borderColor: "#D8E0EB",
  },

  photoPreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  removePhotoButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },

  postButton: {
    backgroundColor: COMMUNISHIELD_BLUE,
    borderRadius: 14,
    paddingVertical: 15,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },

  postButtonText: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: "#FFFFFF",
  },
});