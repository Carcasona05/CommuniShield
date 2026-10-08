import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import Dropdown from "../../components/Dropdown";

const COMMUNISHIELD_BLUE = "#294880";

const BLOTTER_TYPES = [
  "Physical Assault",
  "Verbal Abuse",
  "Property Damage",
  "Theft / Snatching",
  "Harassment",
  "Domestic Dispute",
  "Vehicle Incident",
  "Public Disturbance",
  "Cyber / Online Harassment",
  "Other",
];

const STATUS_OPTIONS = [
  { value: "Pending Review", label: "Pending Review" },
  { value: "Under Verification", label: "Under Verification" },
  { value: "Resolved", label: "Resolved" },
  { value: "Rejected", label: "Rejected" },
  { value: "Marked Fake", label: "Marked Fake" },
];

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

const formatDateTimeValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const buildBlotterNo = () => {
  const date = new Date();
  const y = date.getFullYear();
  const randomPart = `${Date.now()}`.slice(-6);
  return `BLT-${y}-${randomPart}`;
};

export default function Admin_AddBlotterModal({ visible, onClose, onSubmit }) {
  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const now = useMemo(() => new Date(), []);

  const [form, setForm] = useState({
    blotterNo: buildBlotterNo(),
    dateReported: formatDateTimeValue(now),
    barangay: "Poblacion",
    location: "",
    incidentType: "",
    incidentDateTime: formatDateTimeValue(now),
    complainantName: "",
    complainantAge: "",
    complainantContact: "",
    respondent: "",
    incidentDescription: "",
    actionTaken: "",
    status: "Pending Review",
    reportedBy: "",
    blotterOfficer: "",
    dateRecorded: formatDateTimeValue(now),
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    const fresh = new Date();
    setForm({
      blotterNo: buildBlotterNo(),
      dateReported: formatDateTimeValue(fresh),
      barangay: "Poblacion",
      location: "",
      incidentType: "",
      incidentDateTime: formatDateTimeValue(fresh),
      complainantName: "",
      complainantAge: "",
      complainantContact: "",
      respondent: "",
      incidentDescription: "",
      actionTaken: "",
      status: "Pending Review",
      reportedBy: "",
      blotterOfficer: "",
      dateRecorded: formatDateTimeValue(fresh),
    });
    setErrors({});
    setSubmitting(false);
  };

  const closeModal = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.location.trim()) nextErrors.location = "Location is required.";
    if (!form.incidentType.trim()) nextErrors.incidentType = "Type of incident is required.";
    if (!form.complainantName.trim()) nextErrors.complainantName = "Complainant name is required.";
    if (!form.respondent.trim()) nextErrors.respondent = "Respondent is required.";
    if (!form.incidentDescription.trim()) nextErrors.incidentDescription = "Incident description is required.";
    if (!form.actionTaken.trim()) nextErrors.actionTaken = "Action taken is required.";
    if (!form.reportedBy.trim()) nextErrors.reportedBy = "Reported by is required.";
    if (!form.blotterOfficer.trim()) nextErrors.blotterOfficer = "Blotter officer is required.";
    return nextErrors;
  };

  const handleSubmit = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const record = {
        id: form.blotterNo || `blotter-${Date.now()}`,
        kind: "Blotter",
        title: `${form.incidentType}\n${form.location || "Location unspecified"}`,
        reportType: "Blotter",
        location: form.location,
        barangay: form.barangay,
        status: form.status,
        severity: "Medium",
        created_at: form.dateRecorded || new Date().toISOString(),
        details: form.incidentDescription,
        actor: form.reportedBy,
        actorRole: "admin",
        blotterNo: form.blotterNo,
        dateReported: form.dateReported,
        incidentType: form.incidentType,
        incidentDateTime: form.incidentDateTime,
        complainantName: form.complainantName,
        complainantAge: form.complainantAge,
        complainantContact: form.complainantContact,
        respondent: form.respondent,
        actionTaken: form.actionTaken,
        reportedBy: form.reportedBy,
        blotterOfficer: form.blotterOfficer,
        dateRecorded: form.dateRecorded,
      };
      if (onSubmit) await onSubmit(record);
      resetForm();
      onClose();
    } catch (error) {
      setErrors({ submit: error?.message || "Could not save the blotter report." });
    } finally {
      setSubmitting(false);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeModal}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardAvoider}
        >
          <View style={styles.modalCard}>
            {/* Fixed Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}>
                  <Ionicons name="document-text-outline" size={22} color={COMMUNISHIELD_BLUE} />
                </View>
                <View>
                  <Text style={styles.title}>Add Blotter Report</Text>
                  <Text style={styles.subtitle}>Log a local complaint case</Text>
                </View>
              </View>
              <TouchableOpacity onPress={closeModal} hitSlop={8}>
                <Ionicons name="close" size={24} color="#4B5D7A" />
              </TouchableOpacity>
            </View>

            <View style={styles.body}>
              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
              <Text style={styles.sectionTitle}>System Info</Text>
              <View style={styles.gridRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>Blotter No. (auto)</Text>
                  <TextInput value={form.blotterNo} style={[styles.input, styles.readOnlyInput]} editable={false} />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>Date/Time Reported</Text>
                  <TextInput value={form.dateReported} style={[styles.input, styles.readOnlyInput]} editable={false} />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Barangay</Text>
                <Dropdown
                  options={ARGAO_BARANGAYS.map((value) => ({ value, label: value }))}
                  selectedValue={form.barangay}
                  placeholder="Select barangay"
                  onChange={(value) => updateField("barangay", value)}
                />
              </View>

              <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Incident Info</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Location</Text>
                <TextInput
                  style={[styles.input, errors.location && styles.inputError]}
                  value={form.location}
                  onChangeText={(value) => updateField("location", value)}
                  placeholder="Exact incident location"
                  placeholderTextColor="#8A94A6"
                />
                {errors.location ? <Text style={styles.errorText}>{errors.location}</Text> : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Type of Incident</Text>
                <Dropdown
                  options={BLOTTER_TYPES.map((value) => ({ value, label: value }))}
                  selectedValue={form.incidentType}
                  placeholder="Select incident type"
                  onChange={(value) => updateField("incidentType", value)}
                />
                {errors.incidentType ? <Text style={styles.errorText}>{errors.incidentType}</Text> : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Date & Time of Incident</Text>
                <TextInput
                  style={styles.input}
                  value={form.incidentDateTime}
                  onChangeText={(value) => updateField("incidentDateTime", value)}
                  placeholder="YYYY-MM-DDTHH:MM"
                  placeholderTextColor="#8A94A6"
                  keyboardType="default"
                />
              </View>

              <Text style={[styles.sectionTitle, styles.sectionSpacing]}>People Involved</Text>
              <View style={styles.gridRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>Complainant Name</Text>
                  <TextInput
                    style={[styles.input, errors.complainantName && styles.inputError]}
                    value={form.complainantName}
                    onChangeText={(value) => updateField("complainantName", value)}
                    placeholder="Full name"
                    placeholderTextColor="#8A94A6"
                  />
                  {errors.complainantName ? <Text style={styles.errorText}>{errors.complainantName}</Text> : null}
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>Age</Text>
                  <TextInput
                    style={styles.input}
                    value={form.complainantAge}
                    onChangeText={(value) => updateField("complainantAge", value)}
                    placeholder="Age"
                    placeholderTextColor="#8A94A6"
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <View style={styles.gridRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>Contact No.</Text>
                  <TextInput
                    style={styles.input}
                    value={form.complainantContact}
                    onChangeText={(value) => updateField("complainantContact", value)}
                    placeholder="Contact number"
                    placeholderTextColor="#8A94A6"
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>Respondent</Text>
                  <TextInput
                    style={[styles.input, errors.respondent && styles.inputError]}
                    value={form.respondent}
                    onChangeText={(value) => updateField("respondent", value)}
                    placeholder="Respondent"
                    placeholderTextColor="#8A94A6"
                  />
                  {errors.respondent ? <Text style={styles.errorText}>{errors.respondent}</Text> : null}
                </View>
              </View>

              <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Narrative</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Incident Description</Text>
                <TextInput
                  style={[styles.textArea, errors.incidentDescription && styles.inputError]}
                  value={form.incidentDescription}
                  onChangeText={(value) => updateField("incidentDescription", value)}
                  placeholder="Describe what happened..."
                  placeholderTextColor="#8A94A6"
                  multiline
                  textAlignVertical="top"
                />
                {errors.incidentDescription ? <Text style={styles.errorText}>{errors.incidentDescription}</Text> : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Action Taken</Text>
                <TextInput
                  style={[styles.textArea, errors.actionTaken && styles.inputError]}
                  value={form.actionTaken}
                  onChangeText={(value) => updateField("actionTaken", value)}
                  placeholder="List the actions taken..."
                  placeholderTextColor="#8A94A6"
                  multiline
                  textAlignVertical="top"
                />
                {errors.actionTaken ? <Text style={styles.errorText}>{errors.actionTaken}</Text> : null}
              </View>

              <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Admin Info</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Status</Text>
                <Dropdown
                  options={STATUS_OPTIONS}
                  selectedValue={form.status}
                  placeholder="Select status"
                  onChange={(value) => updateField("status", value)}
                />
              </View>

              <View style={styles.gridRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>Reported By</Text>
                  <TextInput
                    style={[styles.input, errors.reportedBy && styles.inputError]}
                    value={form.reportedBy}
                    onChangeText={(value) => updateField("reportedBy", value)}
                    placeholder="Reporter name"
                    placeholderTextColor="#8A94A6"
                  />
                  {errors.reportedBy ? <Text style={styles.errorText}>{errors.reportedBy}</Text> : null}
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>Blotter Officer</Text>
                  <TextInput
                    style={[styles.input, errors.blotterOfficer && styles.inputError]}
                    value={form.blotterOfficer}
                    onChangeText={(value) => updateField("blotterOfficer", value)}
                    placeholder="Officer name"
                    placeholderTextColor="#8A94A6"
                  />
                  {errors.blotterOfficer ? <Text style={styles.errorText}>{errors.blotterOfficer}</Text> : null}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Date Recorded</Text>
                <TextInput
                  style={styles.input}
                  value={form.dateRecorded}
                  onChangeText={(value) => updateField("dateRecorded", value)}
                  placeholder="YYYY-MM-DDTHH:MM"
                  placeholderTextColor="#8A94A6"
                />
              </View>

                {errors.submit ? <Text style={styles.submitError}>{errors.submit}</Text> : null}
              </ScrollView>
            </View>

            {/* Fixed Footer */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeModal} activeOpacity={0.8}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                activeOpacity={0.85}
                disabled={submitting}
              >
                <Text style={styles.submitButtonText}>{submitting ? "Saving..." : "Save Blotter Report"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  keyboardAvoider: {
    width: "100%",
    maxWidth: 650,
    height: "88%",
  },
  modalCard: {
    width: "100%",
    height: "105%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E6ECF5",
    backgroundColor: "#FFFFFF",
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
  body: {
    flex: 1,
    minHeight: 0,
  },
  scrollArea: {
    flex: 1,
    paddingTop: 20,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    color: COMMUNISHIELD_BLUE,
    fontFamily: "PoppinsSemiBold",
    marginBottom: 10,
    marginHorizontal: 20,
  },
  sectionSpacing: {
    marginTop: 12,
  },
  gridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  fieldHalf: {
    flex: 1,
    minWidth: 220,
  },
  field: {
    marginBottom: 12,
    marginHorizontal: 20,
  },
  label: {
    fontSize: 14,
    color: COMMUNISHIELD_BLUE,
    fontFamily: "PoppinsSemiBold",
    marginBottom: 8,
  },
  input: {
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
  textArea: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: "#111827",
    fontFamily: "PoppinsRegular",
    fontSize: 14,
  },
  readOnlyInput: {
    backgroundColor: "#F3F7FB",
    color: "#41536F",
  },
  inputError: {
    borderColor: "#D75E5E",
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "PoppinsRegular",
    color: "#E45757",
  },
  submitError: {
    marginHorizontal: 20,
    marginTop: 8,
    color: "#C0392B",
    fontFamily: "PoppinsMedium",
    fontSize: 12,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#E7ECF3",
    backgroundColor: "#F7F9FD",
  },
  cancelButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#EEF2F8",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: "#294880",
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
  },
  submitButton: {
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: COMMUNISHIELD_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
  },
});