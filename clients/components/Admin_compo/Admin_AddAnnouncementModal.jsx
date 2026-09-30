import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { useToast } from "../Toast";

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

const announcementTypes = [
  "Curfew",
  "Road Closure",
  "Emergency",
  "Power Interruption",
  "Water Interruption",
  "Weather Advisory",
  "Public Advisory",
  "Medical Advisory",
  "Flood Advisory",
  "Fire Incident",
  "Earthquake",
  "Typhoon",
  "Others",
];

export default function Admin_AddAnnouncementModal({
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

  const [announcementType, setAnnouncementType] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [details, setDetails] = useState("");

  const [image, setImage] = useState(null);

  const [showTypeList, setShowTypeList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const filteredBarangays = useMemo(() => {
    const query = locationSearch.trim().toLowerCase();
    if (!query) return ARGAO_BARANGAYS;
    return ARGAO_BARANGAYS.filter((b) =>
      b.toLowerCase().includes(query)
    );
  }, [locationSearch]);

  if (!fontsLoaded) return null;

  const resetForm = () => {
    setAnnouncementType("");
    setTitle("");
    setLocation("");
    setLocationSearch("");
    setShowLocationDropdown(false);
    setDetails("");
    setImage(null);
    setShowTypeList(false);
    setSubmitting(false);
    setSubmitted(false);
    setFormError("");
  };

  const handleClose = () => {
    if (submitting) return;

    resetForm();
    onClose();
  };

  const pickImage = async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      toast.error("Please allow photo access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: true,
    });

    if (!result.canceled) {
      setImage(result.assets[0]);
    }
  };

  const fieldErrors = {
    title: title.trim() ? "" : "Please enter a title.",
    announcementType: announcementType.trim()
      ? ""
      : "Please select announcement type.",
    location: location.trim() ? "" : "Please enter location.",
    details: details.trim() ? "" : "Please enter details.",
  };

  const submit = async () => {
    setSubmitted(true);
    setFormError("");

    if (Object.values(fieldErrors).some(Boolean)) return;

    try {
      setSubmitting(true);

      await onSubmit({
        id: Date.now().toString(),

        type: announcementType,

        title: title.trim(),

        location,

        details,

        image,

        createdAt: new Date().toISOString(),
      });

      resetForm();
    } catch (error) {
      setFormError(
        error?.message || "Could not publish the announcement."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>

        <View style={styles.modal}>

          {/* HEADER */}

          <View style={styles.header}>

            <View style={styles.headerLeft}>

              <View style={styles.headerIcon}>

                <Ionicons
                  name="add-circle-outline"
                  size={22}
                  color={COMMUNISHIELD_BLUE}
                />

              </View>

              <View>

                <Text style={styles.title}>
                  Add Announcement
                </Text>

                <Text style={styles.subtitle}>
                  Create a new public announcement
                </Text>

              </View>

            </View>

            <TouchableOpacity onPress={handleClose}>
              <Ionicons
                name="close"
                size={24}
                color="#555"
              />
            </TouchableOpacity>

          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
          >

            {/* TITLE */}

            <Text style={styles.label}>
              Title
            </Text>

            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Road Closure in Poblacion"
              placeholderTextColor="#8A94A6"
              maxLength={120}
              editable={!submitting}
            />

            {submitted && fieldErrors.title ? (
              <Text style={styles.errorText}>
                {fieldErrors.title}
              </Text>
            ) : null}

            {/* Announcement Type */}

            <Text style={styles.label}>
              Announcement Type
            </Text>

            <TouchableOpacity
              style={styles.dropdown}
              disabled={submitting}
              onPress={() =>
                setShowTypeList(!showTypeList)
              }
            >

              <Text
                style={[
                  styles.dropdownText,
                  !announcementType && {
                    color: "#999",
                  },
                ]}
              >
                {announcementType || "Select type"}
              </Text>

              <Ionicons
                name={
                  showTypeList
                    ? "chevron-up"
                    : "chevron-down"
                }
                size={20}
                color={COMMUNISHIELD_BLUE}
              />

            </TouchableOpacity>

            {showTypeList && (
              <View style={styles.dropdownList}>

                {announcementTypes.map((item) => (

                  <TouchableOpacity
                    key={item}
                    style={styles.dropdownItem}
                    onPress={() => {
                      setAnnouncementType(item);
                      setShowTypeList(false);
                    }}
                  >

                    <Text style={styles.dropdownItemText}>
                      {item}
                    </Text>

                  </TouchableOpacity>

                ))}

              </View>
            )}

            {submitted && fieldErrors.announcementType ? (
              <Text style={styles.errorText}>
                {fieldErrors.announcementType}
              </Text>
            ) : null}

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
                placeholder="Search barangay in Argao..."
                value={locationSearch}
                onChangeText={(text) => {
                  setLocationSearch(text);
                  setShowLocationDropdown(true);
                  setLocation("");
                }}
                onFocus={() => setShowLocationDropdown(true)}
                style={styles.locationInput}
                placeholderTextColor="#999"
                editable={!submitting}
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
                          setLocation(`${barangay}, Argao, Cebu`);
                          setLocationSearch(`${barangay}, Argao, Cebu`);
                          setShowLocationDropdown(false);
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
                        setLocation(`${barangay}, Argao, Cebu`);
                        setLocationSearch(`${barangay}, Argao, Cebu`);
                        setShowLocationDropdown(false);
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

            {/* DETAILS */}

            <Text style={styles.label}>
              Details
            </Text>

            <TextInput
              multiline
              numberOfLines={6}
              placeholder="Describe the announcement..."
              value={details}
              onChangeText={setDetails}
              textAlignVertical="top"
              style={styles.textArea}
              editable={!submitting}
            />

            {submitted && fieldErrors.details ? (
              <Text style={styles.errorText}>
                {fieldErrors.details}
              </Text>
            ) : null}

            {/* PHOTO */}

            <Text style={styles.label}>
              Upload Photo
            </Text>

            <TouchableOpacity
              style={styles.uploadButton}
              onPress={pickImage}
            >

              <Ionicons
                name="image-outline"
                size={22}
                color={COMMUNISHIELD_BLUE}
              />

              <Text style={styles.uploadText}>
                Choose Image
              </Text>

            </TouchableOpacity>

            {image && (

  <View style={styles.previewCard}>

    <Image
      source={{ uri: image.uri }}
      style={styles.previewImage}
    />

    <TouchableOpacity
      style={styles.removeButton}
      onPress={() => setImage(null)}
    >

      <Ionicons
        name="trash-outline"
        size={18}
        color="#fff"
      />

    </TouchableOpacity>

  </View>

)}

</ScrollView>

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
              onPress={submit}
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
                {submitting ? "Submitting..." : "Submit"}
              </Text>
            </TouchableOpacity>

          </View>

        </View>

      </View>

    </Modal>
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
    height: 50,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    paddingHorizontal: 15,
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    backgroundColor: "#FFFFFF",
    color: "#111827",
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

  locationInputWrap: {
    minHeight: 50,
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  locationInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    color: "#111827",
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
  },

  dropdown: {
    marginHorizontal: 20,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    paddingHorizontal: 15,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  dropdownText: {
    fontSize: 14,
    color: "#111827",
    fontFamily: "PoppinsRegular",
  },

  dropdownList: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    marginTop: 5,
    overflow: "hidden",
  },

  dropdownItem: {
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },

  dropdownItemText: {
    fontSize: 14,
    color: "#374151",
    fontFamily: "PoppinsRegular",
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
    marginBottom: 15,
  },

  uploadText: {
    color: COMMUNISHIELD_BLUE,
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
  },

  previewCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },

  previewImage: {
    width: "100%",
    height: 220,
    resizeMode: "cover",
  },

  removeButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#E45757",
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