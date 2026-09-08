import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COMMUNISHIELD_BLUE = "#294880";

const INCIDENT_CATEGORIES = [
  "Public Safety Incidents",
  "Property-Related Incidents",
  "Traffic and Road Incidents",
  "Community and Environmental Concerns",
  "Suspicious Activities",
  "Public Assistance / Community Reports",
];

const INCIDENT_TYPES = {
  "Public Safety Incidents": [
    "Public Disturbance",
    "Harassment",
    "Loitering / Suspicious Presence",
    "Trespassing",
  ],
  "Property-Related Incidents": [
    "Theft",
    "Lost Property",
    "Vandalism / Property Damage",
    "Shoplifting",
  ],
  "Traffic and Road Incidents": [
    "Vehicular Accident",
    "Reckless Driving",
    "Illegal Parking",
    "Road Obstruction",
  ],
  "Community and Environmental Concerns": [
    "Fire Incident",
    "Flooding",
    "Blocked Drainage",
    "Garbage / Sanitation Issues",
    "Streetlight Outage",
  ],
  "Suspicious Activities": [
    "Suspicious Person",
    "Suspicious Vehicle",
    "Unattended / Abandoned Object",
    "Unusual Behavior",
  ],
  "Public Assistance / Community Reports": [
    "Missing Pet",
    "Lost Item",
    "Request for Assistance",
    "General Safety Concern",
  ],
};

export default function MyUser_RepPostView_Edit_Layout({
  post,
  onCancel,
  onSave,
}) {
  const [incidentCategory, setIncidentCategory] = useState(
    post?.incidentCategory || post?.category || "Public Safety Incidents"
  );

  const [incidentType, setIncidentType] = useState(
    post?.incidentType || post?.type || "Suspicious Person"
  );

  const [details, setDetails] = useState(post?.details || "");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);

  const lockedLocation = useMemo(() => {
    return (
      post?.location ||
      post?.address ||
      post?.barangay ||
      "Location unavailable"
    );
  }, [post]);

  const currentTypes = INCIDENT_TYPES[incidentCategory] || [];

  const handleChangeCategory = (category) => {
    setIncidentCategory(category);
    setIncidentType(INCIDENT_TYPES[category]?.[0] || "");
    setShowCategoryPicker(false);
    setShowTypePicker(false);
  };

  const handleSave = () => {
    if (!incidentCategory || !incidentType || !details.trim()) {
      Alert.alert(
        "Missing information",
        "Please complete the incident category, incident type, and details."
      );
      return;
    }

    const updatedPost = {
      ...post,
      incidentCategory,
      incidentType,
      details: details.trim(),

      // Location is locked. This prevents changing or altering it.
      location: post?.location,
      address: post?.address,
      barangay: post?.barangay,
      latitude: post?.latitude,
      longitude: post?.longitude,
    };

    onSave?.(updatedPost);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onCancel}>
          <Ionicons name="chevron-back" size={22} color={COMMUNISHIELD_BLUE} />
        </TouchableOpacity>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Edit Report</Text>
          <Text style={styles.headerSubtitle}>
            Update your report details only
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.postHeader}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={20} color="#FFFFFF" />
            </View>

            <View style={styles.postHeaderInfo}>
              <Text style={styles.nameText}>
                {post?.fullname || post?.author || "Current User"}
              </Text>

              <Text style={styles.dateText}>
                {post?.date || "May 15, 2026"}
                {post?.time ? ` • ${post.time}` : ""}
              </Text>
            </View>

            <View style={styles.statusPill}>
              <Text style={styles.statusText}>
                {post?.status || "Pending Review"}
              </Text>
            </View>
          </View>

          {post?.image ? (
            <Image source={{ uri: post.image }} style={styles.reportImage} />
          ) : post?.photo ? (
            <Image source={{ uri: post.photo }} style={styles.reportImage} />
          ) : (
            <View style={styles.noImageBox}>
              <Ionicons name="image-outline" size={24} color="#8A97A8" />
              <Text style={styles.noImageText}>No image attached</Text>
            </View>
          )}

          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Report Information</Text>

            <Text style={styles.label}>Incident Category</Text>
            <TouchableOpacity
              style={styles.selectBox}
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            >
              <Text style={styles.selectText}>{incidentCategory}</Text>
              <Ionicons
                name={showCategoryPicker ? "chevron-up" : "chevron-down"}
                size={18}
                color="#667085"
              />
            </TouchableOpacity>

            {showCategoryPicker && (
              <View style={styles.optionBox}>
                {INCIDENT_CATEGORIES.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.optionItem,
                      incidentCategory === item && styles.optionItemActive,
                    ]}
                    onPress={() => handleChangeCategory(item)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        incidentCategory === item && styles.optionTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.label}>Incident Type</Text>
            <TouchableOpacity
              style={styles.selectBox}
              onPress={() => setShowTypePicker(!showTypePicker)}
            >
              <Text style={styles.selectText}>{incidentType}</Text>
              <Ionicons
                name={showTypePicker ? "chevron-up" : "chevron-down"}
                size={18}
                color="#667085"
              />
            </TouchableOpacity>

            {showTypePicker && (
              <View style={styles.optionBox}>
                {currentTypes.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.optionItem,
                      incidentType === item && styles.optionItemActive,
                    ]}
                    onPress={() => {
                      setIncidentType(item);
                      setShowTypePicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        incidentType === item && styles.optionTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.label}>Location</Text>
            <View style={styles.lockedLocationBox}>
              <View style={styles.locationIconBox}>
                <Ionicons name="location" size={18} color={COMMUNISHIELD_BLUE} />
              </View>

              <View style={styles.locationTextWrap}>
                <Text style={styles.lockedLocationText}>{lockedLocation}</Text>
                <Text style={styles.lockedNote}>
                  Location cannot be changed after posting.
                </Text>
              </View>

              <Ionicons name="lock-closed" size={17} color="#98A2B3" />
            </View>

            <Text style={styles.label}>Details</Text>
            <TextInput
              style={styles.detailsInput}
              value={details}
              onChangeText={setDetails}
              multiline
              textAlignVertical="top"
              placeholder="Describe what happened..."
              placeholderTextColor="#98A2B3"
            />
          </View>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },

  header: {
    paddingTop: Platform.OS === "ios" ? 58 : 34,
    paddingHorizontal: 18,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E7ECF3",
    flexDirection: "row",
    alignItems: "center",
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EEF3FA",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  headerTextWrap: {
    flex: 1,
  },

  headerTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 20,
    color: "#1D2939",
  },

  headerSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: "#667085",
    marginTop: 1,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    padding: 16,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    padding: 15,
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COMMUNISHIELD_BLUE,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  postHeaderInfo: {
    flex: 1,
  },

  nameText: {
    fontFamily: "PoppinsMedium",
    fontSize: 14,
    color: "#1D2939",
  },

  dateText: {
    fontFamily: "PoppinsRegular",
    fontSize: 11,
    color: "#667085",
    marginTop: 1,
  },

  statusPill: {
    backgroundColor: "#EEF3FA",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  statusText: {
    fontFamily: "PoppinsMedium",
    fontSize: 10,
    color: COMMUNISHIELD_BLUE,
  },

  reportImage: {
    width: "100%",
    height: 190,
    borderRadius: 18,
    backgroundColor: "#EEF3FA",
    marginBottom: 16,
  },

  noImageBox: {
    height: 120,
    borderRadius: 18,
    backgroundColor: "#F2F5F9",
    borderWidth: 1,
    borderColor: "#E4EAF1",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  noImageText: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: "#8A97A8",
    marginTop: 6,
  },

  formSection: {
    marginTop: 2,
  },

  sectionTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 16,
    color: "#1D2939",
    marginBottom: 14,
  },

  label: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: "#344054",
    marginBottom: 7,
    marginTop: 12,
  },

  selectBox: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#DDE5EF",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  selectText: {
    flex: 1,
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    color: "#1D2939",
  },

  optionBox: {
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4EAF1",
    overflow: "hidden",
  },

  optionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F3F8",
  },

  optionItemActive: {
    backgroundColor: "#EEF3FA",
  },

  optionText: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: "#344054",
  },

  optionTextActive: {
    fontFamily: "PoppinsMedium",
    color: COMMUNISHIELD_BLUE,
  },

  lockedLocationBox: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#DDE5EF",
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
  },

  locationIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EEF3FA",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  locationTextWrap: {
    flex: 1,
  },

  lockedLocationText: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: "#1D2939",
  },

  lockedNote: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: "#8A97A8",
    marginTop: 2,
  },

  detailsInput: {
    minHeight: 150,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#DDE5EF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    color: "#1D2939",
    lineHeight: 20,
  },

  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },

  cancelButton: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE5EF",
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButtonText: {
    fontFamily: "PoppinsMedium",
    fontSize: 13,
    color: "#475467",
  },

  saveButton: {
    flex: 1.4,
    height: 50,
    borderRadius: 16,
    backgroundColor: COMMUNISHIELD_BLUE,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },

  saveButtonText: {
    fontFamily: "PoppinsMedium",
    fontSize: 13,
    color: "#FFFFFF",
  },

  bottomSpace: {
    height: 28,
  },
});