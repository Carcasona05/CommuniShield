import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Image,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import Dropdown from "../../components/Dropdown";
import ToastProvider, { useToast } from "../../components/Toast";
import MyUser_RepPost_Layout from "../../components/User_compo/MyUser_RepPost_Layout";
import apiClient from "../../services/apiClient";
import { uploadImage } from "../../services/imageUpload";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import useScrollToTop from "../../hooks/useScrollToTop";
import { subscribeRefresh } from "../../services/refreshBus";
import { getCache, setCache } from "../../services/dataStore";

const PRIMARY = "#294880";

const FONT = {
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semiBold: "Poppins-SemiBold",
};

const statusOptions = [
  "All Status",
  "Pending Review",
  "Under Verification",
  "Resolved",
  "Rejected",
  "Archived",
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

const mapMyReports = (data) =>
  (data?.reports || []).map((r) => ({
    id: r.id,
    userName: "You",
    userAvatar: null,
    location: r.location,
    incidentCategory: r.incident_category,
    incidentType: r.incident_type,
    details: r.details,
    datePosted: r.created_at,
    status: r.status || "Pending Review",
    verified: r.is_verified,
    likes: r.likes ?? 0,
    comments: r.comments ?? 0,
    isLiked: r.is_liked ?? false,
    images: Array.isArray(r.images) ? r.images : [],
    commentList: [],
  }));

const DropdownFilter = ({
  label,
  value,
  options,
  counts,
  isOpen,
  onToggle,
  onSelect,
  icon,
}) => {
  return (
    <View style={styles.dropdownBlock}>
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.dropdownButton, isOpen && styles.activeDropdownButton]}
        onPress={onToggle}
      >
        <View style={styles.dropdownLeft}>
          <View
            style={[
              styles.dropdownIconWrap,
              isOpen && styles.activeDropdownIconWrap,
            ]}
          >
            <Ionicons
              name={icon}
              size={15}
              color={isOpen ? "#FFFFFF" : PRIMARY}
            />
          </View>

          <View style={styles.dropdownTextWrap}>
            <ThemedText
              style={[
                styles.dropdownLabel,
                isOpen && styles.activeDropdownLabel,
              ]}
            >
              {label}
            </ThemedText>

            <ThemedText
              style={[
                styles.dropdownValue,
                isOpen && styles.activeDropdownValue,
              ]}
              numberOfLines={1}
            >
              {value}
              {counts && counts[value] !== undefined
                ? ` (${counts[value]})`
                : ""}
            </ThemedText>
          </View>
        </View>

        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={16}
          color={isOpen ? "#FFFFFF" : PRIMARY}
        />
      </TouchableOpacity>

      {isOpen ? (
        <View style={styles.dropdownMenu}>
          {options.map((option) => {
            const isActive = option === value;

            return (
              <TouchableOpacity
                key={option}
                activeOpacity={0.85}
                style={[
                  styles.dropdownOption,
                  isActive && styles.activeDropdownOption,
                ]}
                onPress={() => onSelect(option)}
              >
                <ThemedText
                  style={[
                    styles.dropdownOptionText,
                    isActive && styles.activeDropdownOptionText,
                  ]}
                >
                  {option}
                </ThemedText>

                {counts && counts[option] !== undefined ? (
                  <ThemedText style={styles.dropdownOptionCount}>
                    {counts[option]}
                  </ThemedText>
                ) : null}

                {isActive ? (
                  <Ionicons name="checkmark-circle" size={16} color={PRIMARY} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
};

const EditReportModal = ({ visible, report, onClose, onSave }) => {
  const toast = useToast();
  const [location, setLocation] = useState("");
  const [incidentCategory, setIncidentCategory] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [categoryOptions, setCategoryOptions] = useState(FALLBACK_CATEGORIES);
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);

  const incidentTypes = useMemo(() => {
    const found = categoryOptions.find((o) => o.category === incidentCategory);
    return found?.types || [];
  }, [categoryOptions, incidentCategory]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const token = await AsyncStorage.getItem("access_token");
        if (!token) return;

        const res = await apiClient.get("/incidents/options", {
          headers: { Authorization: `Bearer ${token}` },
        });

        setCategoryOptions(res.data?.categories || []);
      } catch {
        // keep defaults empty
      }
    };

    loadCategories();
  }, []);

  useEffect(() => {
    if (report) {
      setLocation(report.location || "");
      setIncidentCategory(report.incidentCategory || "");
      setIncidentType(report.incidentType || "");
      setDetails(report.details || "");
      setPhotos(Array.isArray(report.images) ? report.images : []);
    }
  }, [report]);

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

  const handleSaveChanges = async () => {
    if (!incidentCategory || !incidentType || !details.trim()) {
      toast.error("Please complete the category, incident type, and details.");
      return;
    }

    setSaving(true);
    const updatedReport = {
      ...report,
      location,
      incidentCategory,
      incidentType,
      details: details.trim(),
      images: photos,
    };

    try {
      await onSave(updatedReport);
    } finally {
      setSaving(false);
    }
  };

  if (!report) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalTopCloseRow}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              activeOpacity={0.85}
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color="#475467" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.label}>Username</ThemedText>
              <TextInput
                style={[styles.input, styles.disabledInput]}
                value={report.userName || "You"}
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

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                activeOpacity={0.85}
                onPress={onClose}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, { opacity: saving ? 0.6 : 1 }]}
                activeOpacity={0.88}
                onPress={handleSaveChanges}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.saveButtonText}>
                    Save Changes
                  </ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const User_MyReports = () => {
  return (
    <ToastProvider>
      <MyReportsInner />
    </ToastProvider>
  );
};

const MyReportsInner = () => {
  const toast = useToast();
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    "Poppins-Regular": require("../../assets/fonts/Poppins-Regular.ttf"),
    "Poppins-Medium": require("../../assets/fonts/Poppins-Medium.ttf"),
    "Poppins-SemiBold": require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [selectedStatus, setSelectedStatus] = useState("All Status");
  const [openDropdown, setOpenDropdown] = useState(null);
  const [myReports, setMyReports] = useState(() => {
    const cached = getCache("api:/reports/mine");
    return cached?.data || cached || [];
  });
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useScrollToTop();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  const loadMyReports = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/reports/mine");
      if (cached !== undefined) setMyReports(mapMyReports(cached));

      const res = await apiClient.get("/reports/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCache("api:/reports/mine", res.data ?? {});
      setMyReports(mapMyReports(res.data));
    } catch {
      // keep empty list on failure
    } finally {
      setRefreshing(false);
    }
  }, []);

  useAutoRefresh(loadMyReports, 30000);

  useEffect(() => subscribeRefresh(loadMyReports), [loadMyReports]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadMyReports();
  }, [loadMyReports]);

  const filteredReports = useMemo(() => {
    if (selectedStatus === "All Status") {
      return myReports;
    }

    return myReports.filter((report) => report.status === selectedStatus);
  }, [selectedStatus, myReports]);

  const statusCounts = useMemo(() => {
    const counts = { "All Status": myReports.length };

    statusOptions.forEach((status) => {
      if (status !== "All Status") {
        counts[status] = myReports.filter(
          (report) => report.status === status
        ).length;
      }
    });

    return counts;
  }, [myReports]);

  const handleDropdownToggle = (dropdownName) => {
    setOpenDropdown((current) =>
      current === dropdownName ? null : dropdownName
    );
  };

  const handleLike = async (reportId) => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const res = await apiClient.post(
        `/reports/${reportId}/like`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const liked = res.data?.liked ?? false;

      setMyReports((prevReports) =>
        prevReports.map((report) =>
          report.id === reportId
            ? {
                ...report,
                isLiked: liked,
                likes: report.likes + (liked ? 1 : -1),
              }
            : report
        )
      );
    } catch {
      // ignore like failures
    }
  };

  const handleOpenReport = (reportData) => {
    router.push({
      pathname: "/MyUser_RepPostView",
      params: {
        report: JSON.stringify(reportData),
      },
    });
  };

  const handleEditReport = (report) => {
    setSelectedReport(report);
    setEditModalVisible(true);
  };

  const handleCloseEditModal = () => {
    setEditModalVisible(false);
    setSelectedReport(null);
  };

  const handleSaveEditedReport = async (updatedReport) => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const uploadPhotos = [];
      for (const img of updatedReport.images || []) {
        if (typeof img === "string" && img.startsWith("blob:")) {
          const url = await uploadImage(img);
          uploadPhotos.push(url);
        } else {
          uploadPhotos.push(img);
        }
      }

      await apiClient.put(
        `/reports/${updatedReport.id}`,
        {
          details: updatedReport.details,
          location: updatedReport.location,
          poster_name: updatedReport.userName,
          incident_category: updatedReport.incidentCategory,
          incident_type: updatedReport.incidentType,
          photos: uploadPhotos,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setMyReports((prevReports) =>
        prevReports.map((report) =>
          report.id === updatedReport.id
            ? { ...updatedReport, images: uploadPhotos }
            : report
        )
      );

      setEditModalVisible(false);
      setSelectedReport(null);

      toast.success("Your report has been updated successfully.");
    } catch (error) {
      toast.error(
        error.response?.data?.error || "Could not update the report."
      );
    }
  };

  const handleDeleteReport = (reportId) => {
    Alert.alert("Delete Report", "Are you sure you want to delete this report?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem("access_token");
            if (!token) return;

            await apiClient.delete(`/reports/${reportId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });

            setMyReports((prevReports) =>
              prevReports.filter((report) => report.id !== reportId)
            );

            toast.success("Report deleted successfully.");
          } catch (error) {
            toast.error(
              error.response?.data?.error || "Could not delete the report."
            );
          }
        },
      },
    ]);
  };

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[PRIMARY]}
            tintColor={PRIMARY}
          />
        }
      >
        <View style={styles.sectionBlock}>
          <View style={styles.filterCard}>
            <DropdownFilter
              label="Status"
              value={selectedStatus}
              options={statusOptions}
              counts={statusCounts}
              icon="filter-outline"
              isOpen={openDropdown === "status"}
              onToggle={() => handleDropdownToggle("status")}
              onSelect={(option) => {
                setSelectedStatus(option);
                setOpenDropdown(null);
              }}
            />
          </View>

          {filteredReports.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="folder-open-outline" size={28} color="#9CA3AF" />
              </View>

              <ThemedText style={styles.emptyTitle}>No reports found</ThemedText>

              <ThemedText style={styles.emptySubtitle}>
                There are no reports under this status filter.
              </ThemedText>
            </View>
          ) : (
            filteredReports.map((report, index) => (
                <MyUser_RepPost_Layout
                  key={report.id}
                  userName={report.userName}
                  userAvatar={report.userAvatar}
                  datePosted={report.datePosted}
                  location={report.location}
                incidentCategory={report.incidentCategory}
                incidentType={report.incidentType}
                details={report.details}
                status={report.status}
                verified={report.verified}
                likes={report.likes}
                comments={report.comments}
                isLiked={report.isLiked}
                images={report.images}
                onLike={() => handleLike(report.id)}
                onComment={() => handleOpenReport(report)}
                onEdit={() => handleEditReport(report)}
                onDelete={() => handleDeleteReport(report.id)}
                style={
                  index !== filteredReports.length - 1
                    ? styles.reportCardSpacing
                    : null
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      <EditReportModal
        visible={editModalVisible}
        report={selectedReport}
        onClose={handleCloseEditModal}
        onSave={handleSaveEditedReport}
      />
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  scrollContainer: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 110,
  },

  sectionBlock: {
    marginBottom: 14,
  },

  filterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    zIndex: 50,
  },

  dropdownBlock: {
    position: "relative",
  },

  dropdownButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#F8FAFE",
    borderWidth: 1,
    borderColor: "#DDE7F5",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  activeDropdownButton: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },

  dropdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  dropdownIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
  },

  activeDropdownIconWrap: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  dropdownTextWrap: {
    marginLeft: 10,
    flex: 1,
  },

  dropdownLabel: {
    fontFamily: FONT.regular,
    fontSize: 10,
    color: "#7B8794",
  },

  activeDropdownLabel: {
    color: "rgba(255,255,255,0.76)",
  },

  dropdownValue: {
    fontFamily: FONT.medium,
    marginTop: 2,
    fontSize: 13,
    color: PRIMARY,
  },

  activeDropdownValue: {
    color: "#FFFFFF",
  },

  dropdownMenu: {
    marginTop: 7,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4EBF7",
    overflow: "hidden",
  },

  dropdownOption: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  activeDropdownOption: {
    backgroundColor: "#F3F6FB",
  },

  dropdownOptionText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: "#374151",
    flex: 1,
  },

  activeDropdownOptionText: {
    fontFamily: FONT.medium,
    color: PRIMARY,
  },

  dropdownOptionCount: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: PRIMARY,
    marginRight: 10,
  },

  reportCardSpacing: {
    marginBottom: 6,
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E4EBF7",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F3F6FB",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    fontFamily: FONT.semiBold,
    marginTop: 8,
    color: "#1F2A37",
    fontSize: 15,
  },

  emptySubtitle: {
    fontFamily: FONT.regular,
    marginTop: 4,
    color: "#6B7280",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  modalCard: {
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    overflow: "hidden",
  },

  modalTopCloseRow: {
    paddingHorizontal: 14,
    paddingTop: 14,
    alignItems: "flex-end",
  },

  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F6FB",
    alignItems: "center",
    justifyContent: "center",
  },

  modalScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 20,
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

  helperText: {
    marginTop: 8,
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 18,
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

  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
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

export default User_MyReports;