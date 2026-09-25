import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { smartBack } from "../../services/navigation";
import { useFonts } from "expo-font";

import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import Dropdown from "../../components/Dropdown";
import ToastProvider, { useToast } from "../../components/Toast";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../../services/apiClient";
import { getCache, setCache } from "../../services/dataStore";

const PRIMARY = "#294880";

const FONT = {
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semiBold: "Poppins-SemiBold",
};

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

export default function MyUser_RepPostView_Edit() {
  return (
    <ToastProvider>
      <EditScreenInner />
    </ToastProvider>
  );
}

function EditScreenInner() {
  const toast = useToast();
  const router = useRouter();
  const params = useLocalSearchParams();

  const [fontsLoaded] = useFonts({
    "Poppins-Regular": require("../../assets/fonts/Poppins-Regular.ttf"),
    "Poppins-Medium": require("../../assets/fonts/Poppins-Medium.ttf"),
    "Poppins-SemiBold": require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [report, setReport] = useState(null);
  const [userName, setUserName] = useState("You");
  const [location, setLocation] = useState("");
  const [incidentCategory, setIncidentCategory] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [categoryOptions, setCategoryOptions] = useState(() => {
    const cached = getCache("api:/incidents/options");
    return Array.isArray(cached?.categories) && cached.categories.length
      ? cached.categories
      : FALLBACK_CATEGORIES;
  });
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState([]);

  const incidentTypes = useMemo(() => {
    const found = categoryOptions.find((o) => o.category === incidentCategory);
    return found?.types || [];
  }, [categoryOptions, incidentCategory]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const token = await AsyncStorage.getItem("access_token");
        if (!token) return;

        const cached = getCache("api:/incidents/options");
        if (Array.isArray(cached?.categories) && cached.categories.length) {
          setCategoryOptions(cached.categories);
        }

        const res = await apiClient.get("/incidents/options", {
          headers: { Authorization: `Bearer ${token}` },
        });

        setCache("api:/incidents/options", res.data ?? {});
        setCategoryOptions(res.data?.categories || []);
      } catch {
        // keep defaults empty
      }
    };

    loadCategories();
  }, []);

  useEffect(() => {
    try {
      const parsedReport = params?.report ? JSON.parse(params.report) : null;

      if (parsedReport) {
        setReport(parsedReport);
        setUserName(parsedReport.userName || "You");
        setLocation(parsedReport.location || "");
        setIncidentCategory(parsedReport.incidentCategory || "");
        setIncidentType(parsedReport.incidentType || "");
        setDetails(parsedReport.details || "");
        setPhotos(Array.isArray(parsedReport.images) ? parsedReport.images : []);
      }
    } catch {
      setReport(null);
    }
  }, [params?.report]);

  useEffect(() => {
    if (incidentCategory && !incidentTypes.includes(incidentType)) {
      setIncidentType("");
    }
  }, [incidentCategory, incidentType, incidentTypes]);

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
      mediaTypes: ["images"],
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

  const handleSaveChanges = () => {
    if (!incidentCategory || !incidentType || !details.trim()) {
      toast.error("Please complete the category, incident type, and details.");
      return;
    }

    const updatedReport = {
      ...report,
      userName,
      location,
      incidentCategory,
      incidentType,
      details: details.trim(),
      images: photos,
    };

    console.log("Updated Report:", updatedReport);

    toast.success("Your report has been updated successfully.");

    setTimeout(() => {
      smartBack("/(tabs)/User_MyReports");
    }, 1200);
  };

  if (!fontsLoaded) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formCard}>
          <View style={styles.topRow}>
            <TouchableOpacity
              style={styles.backButton}
              activeOpacity={0.85}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={22} color={PRIMARY} />
            </TouchableOpacity>

            <ThemedText style={styles.pageTitle}>Edit My Report</ThemedText>
          </View>

          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Username</ThemedText>
            <TextInput
              style={[styles.input, styles.disabledInput]}
              value={userName}
              editable={false}
              placeholderTextColor="#8A94A6"
            />
          </View>

          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Current Location</ThemedText>

            <View style={styles.lockedInputWrap}>
              <TextInput
                style={[styles.input, styles.lockedInput]}
                value={location}
                editable={false}
                placeholder="Current location"
                placeholderTextColor="#8A94A6"
              />

              <Ionicons
                name="lock-closed"
                size={17}
                color="#98A2B3"
                style={styles.lockIconInside}
              />
            </View>

            <ThemedText style={styles.helperText}>
              Location cannot be changed after posting.
            </ThemedText>
          </View>

          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Incident Category</ThemedText>

            <Dropdown
              placeholder="Select Incident Category"
              selectedValue={incidentCategory}
              options={categoryOptions.map((option) => ({
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
              <Ionicons name="images-outline" size={18} color={PRIMARY} />

              <ThemedText style={styles.uploadButtonText}>
                Choose from Album
              </ThemedText>
            </TouchableOpacity>

            <ThemedText style={styles.helperText}>
              Optional. You can upload up to 3 photos.
            </ThemedText>

            {photos.length > 0 && (
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
            )}
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              activeOpacity={0.85}
              onPress={() => router.back()}
            >
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              activeOpacity={0.88}
              onPress={handleSaveChanges}
            >
              <ThemedText style={styles.saveButtonText}>
                Save Changes
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
  
}

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

  scrollContainer: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 34,
  },

  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    marginBottom: 16,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  pageTitle: {
    fontFamily: FONT.semiBold,
    fontSize: 19,
    color: PRIMARY,
  },

  fieldContainer: {
    marginBottom: 16,
  },

  label: {
    fontFamily: FONT.semiBold,
    fontSize: 14,
    color: PRIMARY,
    marginBottom: 8,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8E0EB",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONT.regular,
    fontSize: 15,
    color: "#1F2A37",
  },

  disabledInput: {
    backgroundColor: "#F8FAFD",
    color: "#68758A",
  },

  lockedInputWrap: {
    position: "relative",
  },

  lockedInput: {
    backgroundColor: "#F8FAFD",
    color: "#1F2A37",
    paddingRight: 42,
  },

  lockIconInside: {
    position: "absolute",
    right: 14,
    top: 15,
  },

  helperText: {
    marginTop: 8,
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 18,
    color: "#68758A",
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
    fontFamily: FONT.regular,
    fontSize: 15,
    color: "#1F2A37",
  },

  photoHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  photoCount: {
    fontFamily: FONT.medium,
    fontSize: 12,
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
    fontFamily: FONT.semiBold,
    fontSize: 14,
    color: PRIMARY,
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

  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },

  cancelButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8E0EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButtonText: {
    fontFamily: FONT.medium,
    fontSize: 14,
    color: "#475467",
  },

  saveButton: {
    flex: 1.4,
    height: 50,
    borderRadius: 14,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },

  saveButtonText: {
    fontFamily: FONT.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
});