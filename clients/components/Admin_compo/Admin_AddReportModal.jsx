import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import ActionSheetModal from "../../components/ActionSheetModal";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";

import Dropdown from "../../components/Dropdown";
import apiClient from "../../services/apiClient";
import { uploadImages } from "../../services/imageUpload";
import { getCache, setCache } from "../../services/dataStore";
import { useToast } from "../../components/Toast";

const COMMUNISHIELD_BLUE = "#294880";

const ARGAO_BARANGAYS = [
  "Abaga",
  "Angadan",
  "Barangay 1 (Pob.)",
  "Barangay 2 (Pob.)",
  "Barangay 3 (Pob.)",
  "Barangay 4 (Pob.)",
  "Barangay 5 (Pob.)",
  "Barangay 6 (Pob.)",
  "Barangay 7 (Pob.)",
  "Barangay 8 (Pob.)",
  "Barangay 9 (Pob.)",
  "Barangay 10 (Pob.)",
  "Barangay 11 (Pob.)",
  "Barangay 12 (Pob.)",
  "Barangay 13 (Pob.)",
  "Barangay 14 (Pob.)",
  "Bulasa",
  "Buhi",
  "Dakli",
  "Dalaguet",
  "Datu",
  "Ginabangan",
  "Gonghos",
  "Guimbangco-an",
  "Guiso",
  "Hilasmasan",
  "Ilasan",
  "Langtad",
  "Lusong",
  "Malacoromong",
  "Malay",
  "Malitbog",
  "Nabangad",
  "Patong",
  "Poblacion",
  "Sacsac",
  "Sua",
  "Tubod",
  "Zumarraga",
];

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
    types: [
      "Theft",
      "Lost Property",
      "Vandalism / Property Damage",
      "Shoplifting",
    ],
  },
  {
    category: "Traffic and Road Incidents",
    types: [
      "Vehicular Accident",
      "Reckless Driving",
      "Illegal Parking",
      "Road Obstruction",
    ],
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
    types: [
      "Missing Pet",
      "Lost Item",
      "Request for Assistance",
      "General Safety Concern",
    ],
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

export default function Admin_AddReportModal({
  visible,
  onClose,
  onSubmit,
}) {
  const toast = useToast();
  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [adminName, setAdminName] = useState("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState("9.8816");
  const [longitude, setLongitude] = useState("123.5953");
  const [locationSearch, setLocationSearch] = useState("");
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);

  const [incidentCategory, setIncidentCategory] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [categoryOptions, setCategoryOptions] = useState(FALLBACK_CATEGORIES);
  const [details, setDetails] = useState("");

  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  const filteredBarangays = useMemo(() => {
    const query = locationSearch.trim().toLowerCase();
    if (!query) return ARGAO_BARANGAYS;
    return ARGAO_BARANGAYS.filter((b) =>
      b.toLowerCase().includes(query)
    );
  }, [locationSearch]);

  const geocodeLocation = async (locationName) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&limit=1`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "CommuniShield-App/1.0",
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setLatitude(data[0].lat);
          setLongitude(data[0].lon);
          return;
        }
      }
    } catch {}

    setLatitude("9.8816");
    setLongitude("123.5953");
  };

  const incidentOptions = categoryOptions.length
    ? categoryOptions
    : FALLBACK_CATEGORIES;

  const incidentTypes = useMemo(() => {
    const found = incidentOptions.find(
      (option) => option.category === incidentCategory
    );
    return found?.types || [];
  }, [incidentOptions, incidentCategory]);

  useEffect(() => {
    if (!visible) return;

    loadAdminProfile();
    loadCategories();
  }, [visible]);

  useEffect(() => {
    if (!incidentTypes.includes(incidentType)) {
      setIncidentType("");
    }
  }, [incidentCategory, incidentType, incidentTypes]);

  const loadAdminProfile = async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/profile");

      if (cached !== undefined) {
        const cachedName =
          cached.name ||
          `${cached.first_name || ""} ${cached.last_name || ""}`.trim();

        if (cachedName) {
          setAdminName(cachedName);
        }
      }

      const res = await apiClient.get("/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const profile = res.data ?? {};
      setCache("api:/profile", profile);

      const fullName =
        profile.name ||
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim();

      if (fullName) {
        setAdminName(fullName);
      }
    } catch {
      // Keep cached/default admin name.
    }
  };

  const loadCategories = async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/incidents/options");

      if (cached !== undefined) {
        setCategoryOptions(cached?.categories || FALLBACK_CATEGORIES);
      }

      const res = await apiClient.get("/incidents/options", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const options = res.data?.categories || FALLBACK_CATEGORIES;

      setCache("api:/incidents/options", res.data ?? {});
      setCategoryOptions(options);
    } catch {
      // Keep fallback categories.
    }
  };

  const handlePickPhoto = () => {
    if (photos.length >= 3) {
      toast.error("You can only upload up to 3 photos.");
      return;
    }
    setActionSheetVisible(true);
  };

  const handleActionSheetSelect = async (index) => {
    if (index === 0) {
      const camPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (!camPerm.granted) {
        toast.error("Please allow camera access to take a photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.length) {
        setPhotos((prev) => [...prev, result.assets[0].uri]);
      }
    } else if (index === 1) {
      const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!libPerm.granted) {
        toast.error("Please allow access to your photo library.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.length) {
        setPhotos((prev) => [...prev, result.assets[0].uri]);
      }
    }
  };

  const handleRemovePhoto = (indexToRemove) => {
    setPhotos((prev) =>
      prev.filter((_, index) => index !== indexToRemove)
    );
  };

  const resetForm = () => {
    setLocation("");
    setLatitude("9.8816");
    setLongitude("123.5953");
    setLocationSearch("");
    setShowLocationDropdown(false);
    setIncidentCategory("");
    setIncidentType("");
    setDetails("");
    setPhotos([]);
    setSubmitting(false);
    setSubmitted(false);
    setFormError("");
  };

  const handleClose = () => {
    if (submitting) return;

    resetForm();
    onClose();
  };

  const fieldErrors = {
    adminName: adminName.trim()
      ? ""
      : "Admin profile name could not be loaded.",
    location: location ? "" : "Please select a location.",
    incidentCategory: incidentCategory
      ? ""
      : "Please select an incident category.",
    incidentType: incidentType ? "" : "Please select an incident type.",
    details: details.trim() ? "" : "Please enter the report details.",
  };

  const handleSubmit = async () => {
    setSubmitted(true);
    setFormError("");

    if (Object.values(fieldErrors).some(Boolean)) return;

    try {
      setSubmitting(true);

      const token = await AsyncStorage.getItem("access_token");

      if (!token) {
        setFormError("Please sign in before posting a report.");
        return;
      }

      const photoUrls = await uploadImages(photos);

      await apiClient.post(
        "/reports",
        {
          poster_name: adminName.trim(),
          display_name_type: "Fullname",
          location,
          latitude,
          longitude,
          incident_category: incidentCategory,
          incident_type: incidentType,
          details: details.trim(),
          photos: photoUrls,
          status: "Pending Review",
          source: "Admin",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (onSubmit) {
        await onSubmit({
          poster_name: adminName.trim(),
          display_name_type: "Fullname",
          location,
          latitude,
          longitude,
          incident_category: incidentCategory,
          incident_type: incidentType,
          details: details.trim(),
          photos: photoUrls,
          status: "Pending Review",
          source: "Admin",
        });
      }

      toast.success("The admin report has been submitted successfully.");

      resetForm();
      onClose();
    } catch (error) {
      setFormError(
        error.response?.data?.error ||
          "Could not submit the report. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <>
      <Modal
        animationType="fade"
        transparent
        visible={visible}
        onRequestClose={handleClose}
      >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* HEADER */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons
                  name="document-text-outline"
                  size={22}
                  color={COMMUNISHIELD_BLUE}
                />
              </View>

              <View>
                <Text style={styles.title}>
                  Add Report
                </Text>

                <Text style={styles.subtitle}>
                  Create a new incident report as an administrator
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleClose}
              disabled={submitting}
            >
              <Ionicons
                name="close"
                size={24}
                color="#555"
              />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            behavior={
              Platform.OS === "ios"
                ? "padding"
                : undefined
            }
            style={styles.keyboardView}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              {/* ADMIN NAME */}
              <Text style={styles.label}>
                Reported By
              </Text>

              <View
                style={[
                  styles.input,
                  styles.disabledInput,
                  styles.nameInputWrap,
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={COMMUNISHIELD_BLUE}
                />

                <Text style={styles.nameInputText}>
                  {adminName || "Loading admin name..."}
                </Text>
              </View>

              {submitted && fieldErrors.adminName ? (
                <Text style={styles.errorText}>
                  {fieldErrors.adminName}
                </Text>
              ) : null}

              <Text style={styles.helperText}>
                This report will be recorded under the logged-in
                administrator.
              </Text>

              {/* LOCATION */}
              <Text style={styles.label}>
                Location (Argao)
              </Text>

              <View style={styles.locationInputWrap}>
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={COMMUNISHIELD_BLUE}
                />

                <TextInput
                  style={styles.locationInput}
                  value={locationSearch}
                  onChangeText={(text) => {
                    setLocationSearch(text);
                    setShowLocationDropdown(true);
                    setLocation("");
                  }}
                  placeholder="Search barangay in Argao..."
                  placeholderTextColor="#8A94A6"
                  onFocus={() => setShowLocationDropdown(true)}
                />
              </View>

              {showLocationDropdown && locationSearch.length > 0 && (
                <View style={styles.locationDropdown}>
                  <ScrollView
                    style={{ maxHeight: 160 }}
                    keyboardShouldPersistTaps="handled"
                  >
                    {filteredBarangays.length === 0 ? (
                      <View style={styles.locationDropdownItem}>
                        <Text style={styles.locationDropdownText}>
                          No barangay found
                        </Text>
                      </View>
                    ) : (
                      filteredBarangays.map((barangay) => (
                        <TouchableOpacity
                          key={barangay}
                          style={styles.locationDropdownItem}
                          onPress={() => {
                            const loc = `${barangay}, Argao, Cebu`;
                            setLocation(loc);
                            setLocationSearch(loc);
                            setShowLocationDropdown(false);
                            geocodeLocation(loc);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.locationDropdownText}>
                            {barangay}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}

              {showLocationDropdown && locationSearch.length === 0 && (
                <View style={styles.locationDropdown}>
                  <ScrollView
                    style={{ maxHeight: 160 }}
                    keyboardShouldPersistTaps="handled"
                  >
                    {ARGAO_BARANGAYS.map((barangay) => (
                      <TouchableOpacity
                        key={barangay}
                        style={styles.locationDropdownItem}
                        onPress={() => {
                          const loc = `${barangay}, Argao, Cebu`;
                          setLocation(loc);
                          setLocationSearch(loc);
                          setShowLocationDropdown(false);
                          geocodeLocation(loc);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.locationDropdownText}>
                          {barangay}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {submitted && fieldErrors.location ? (
                <Text style={styles.errorText}>
                  {fieldErrors.location}
                </Text>
              ) : null}

              <Text style={styles.helperText}>
                Select a barangay within Argao, Cebu.
              </Text>

              {/* CATEGORY */}
              <Text style={styles.label}>
                Incident Category
              </Text>

              <View style={styles.dropdownField}>
                <Dropdown
                  placeholder="Select Incident Category"
                  selectedValue={incidentCategory}
                  options={incidentOptions.map((option) => ({
                    label: option.category,
                    value: option.category,
                  }))}
                  onChange={setIncidentCategory}
                  disabled={submitting}
                />
              </View>

              {submitted && fieldErrors.incidentCategory ? (
                <Text style={styles.errorText}>
                  {fieldErrors.incidentCategory}
                </Text>
              ) : null}

              {/* TYPE */}
              <Text style={styles.label}>
                Incident Type
              </Text>

              <View style={styles.dropdownField}>
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
                  disabled={
                    !incidentCategory || submitting
                  }
                />
              </View>

              {submitted && fieldErrors.incidentType ? (
                <Text style={styles.errorText}>
                  {fieldErrors.incidentType}
                </Text>
              ) : null}

              {/* DETAILS */}
              <Text style={styles.label}>
                Report Details
              </Text>

              <TextInput
                style={styles.textArea}
                value={details}
                onChangeText={setDetails}
                placeholder="Describe what happened..."
                placeholderTextColor="#8A94A6"
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                editable={!submitting}
              />

              {submitted && fieldErrors.details ? (
                <Text style={styles.errorText}>
                  {fieldErrors.details}
                </Text>
              ) : null}

              {/* PHOTOS */}
              <View style={styles.photoHeaderRow}>
                <Text style={styles.label}>
                  Photo Evidence
                </Text>

                <Text style={styles.photoCount}>
                  {photos.length}/3
                </Text>
              </View>

              <TouchableOpacity
                style={styles.uploadButton}
                activeOpacity={0.88}
                onPress={handlePickPhoto}
                disabled={submitting}
              >
                <Ionicons
                  name="images-outline"
                  size={18}
                  color={COMMUNISHIELD_BLUE}
                />

                <Text style={styles.uploadButtonText}>
                  Choose from Album
                </Text>
              </TouchableOpacity>

              <Text style={styles.helperText}>
                Optional. You can upload up to 3 photos.
              </Text>

              {photos.length > 0 ? (
                <View style={styles.photoGrid}>
                  {photos.map((uri, index) => (
                    <View
                      key={`${uri}-${index}`}
                      style={styles.photoCard}
                    >
                      <Image
                        source={{ uri }}
                        style={styles.photoPreview}
                      />

                      <TouchableOpacity
                        style={styles.removePhotoButton}
                        onPress={() =>
                          handleRemovePhoto(index)
                        }
                        activeOpacity={0.85}
                        disabled={submitting}
                      >
                        <Ionicons
                          name="close"
                          size={14}
                          color="#FFFFFF"
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>

          {formError ? (
            <View style={styles.formErrorWrap}>
              <Ionicons
                name="alert-circle"
                size={16}
                color="#E45757"
              />

              <Text style={styles.formErrorText}>
                {formError}
              </Text>
            </View>
          ) : null}

          {/* FOOTER */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={submitting}
            >
              <Text style={styles.cancelButtonText}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitButton,
                submitting && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Ionicons
                name={
                  submitting
                    ? "sync-outline"
                    : "checkmark-circle-outline"
                }
                size={18}
                color="#FFFFFF"
              />

              <Text style={styles.submitButtonText}>
                {submitting ? "Submitting..." : "Post"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    <ActionSheetModal
      visible={actionSheetVisible}
      title="Add Photo"
      options={["Take Photo", "Choose from Gallery"]}
      onSelect={handleActionSheetSelect}
      onClose={() => setActionSheetVisible(false)}
    />
  </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  modal: {
    width: "100%",
    maxWidth: 650,
    maxHeight: "92%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
  },

  keyboardView: {
    flex: 1,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E6ECF5",
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  headerIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: "#EAF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  title: {
    fontSize: 20,
    color: COMMUNISHIELD_BLUE,
    fontFamily: "PoppinsSemiBold",
  },

  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    fontFamily: "PoppinsRegular",
    marginTop: 2,
  },

  scrollContent: {
    paddingBottom: 8,
  },

  label: {
    marginTop: 18,
    marginBottom: 8,
    marginHorizontal: 20,
    fontSize: 14,
    color: COMMUNISHIELD_BLUE,
    fontFamily: "PoppinsSemiBold",
  },

  input: {
    marginHorizontal: 20,
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    paddingHorizontal: 15,
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    backgroundColor: "#FFFFFF",
  },

  disabledInput: {
    backgroundColor: "#F8FAFD",
  },

  nameInputWrap: {
    flexDirection: "row",
    alignItems: "center",
  },

  nameInputText: {
    marginLeft: 9,
    fontSize: 14,
    color: "#68758A",
    fontFamily: "PoppinsMedium",
  },

  helperText: {
    marginTop: 8,
    marginHorizontal: 20,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "PoppinsRegular",
    color: "#68758A",
  },

  dropdownField: {
    marginHorizontal: 20,
  },

  errorText: {
    marginTop: 6,
    marginHorizontal: 20,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "PoppinsRegular",
    color: "#E45757",
  },

  formErrorWrap: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: "#FDEBEC",
    borderWidth: 1,
    borderColor: "#F5C6C6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  formErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "PoppinsRegular",
    color: "#E45757",
  },

  locationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginRight: 20,
  },

  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF3FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 18,
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
    marginHorizontal: 20,
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

  locationDropdown: {
    marginHorizontal: 20,
    marginTop: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },

  locationDropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F8",
  },

  locationDropdownText: {
    fontSize: 14,
    color: "#374151",
    fontFamily: "PoppinsRegular",
  },

  textArea: {
    marginHorizontal: 20,
    minHeight: 140,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    padding: 15,
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    backgroundColor: "#FFFFFF",
    color: "#1F2A37",
  },

  photoHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginRight: 20,
  },

  photoCount: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
    color: "#68758A",
    marginTop: 18,
    marginBottom: 8,
  },

  uploadButton: {
    marginHorizontal: 20,
    height: 55,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: COMMUNISHIELD_BLUE,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 2,
  },

  uploadButtonText: {
    color: COMMUNISHIELD_BLUE,
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
  },

  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: 20,
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

  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E6ECF5",
  },

  cancelButton: {
    paddingHorizontal: 20,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    justifyContent: "center",
    alignItems: "center",
  },

  cancelButtonText: {
    color: "#374151",
    fontSize: 14,
    fontFamily: "PoppinsMedium",
  },

  submitButton: {
    backgroundColor: COMMUNISHIELD_BLUE,
    height: 46,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  submitButtonDisabled: {
    opacity: 0.65,
  },

  submitButtonText: {
    color: "#FFFFFF",
    marginLeft: 8,
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
  },
});