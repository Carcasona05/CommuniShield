import React, { useEffect, useMemo, useState } from "react";
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
import { ARGAO_BARANGAYS as ARGAO_BARANGAY_DATA } from "../../constants/argaoMapData";

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

const ARGAO_BARANGAYS = ARGAO_BARANGAY_DATA.map(({ name }) => name);

const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const isValidDateTimeValue = (value) => {
  if (!DATETIME_REGEX.test(value)) return false;
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hours &&
    date.getMinutes() === minutes
  );
};

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

const toInputDateTime = (value, fallback) => {
  if (!value) return fallback;
  if (DATETIME_REGEX.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return formatDateTimeValue(parsed);
};

export default function Admin_AddBlotterModal({ visible, onClose, onSubmit, record: editingRecord }) {
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
    reportedBy: "",
    blotterOfficer: "",
    dateRecorded: formatDateTimeValue(now),
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [baseline, setBaseline] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setErrors({});
    const fresh = new Date();
    const next = editingRecord
      ? {
          blotterNo: editingRecord.blotterNo || editingRecord.blotter_no || buildBlotterNo(),
          dateReported: toInputDateTime(editingRecord.dateReported || editingRecord.date_reported, formatDateTimeValue(now)),
          barangay: editingRecord.barangay || "Poblacion",
          location: editingRecord.location || "",
          incidentType: editingRecord.incidentType || editingRecord.incident_type || "",
          incidentDateTime: toInputDateTime(editingRecord.incidentDateTime || editingRecord.incident_datetime, formatDateTimeValue(now)),
          complainantName: editingRecord.complainantName || editingRecord.complainant_name || "",
          complainantAge: editingRecord.complainantAge ?? editingRecord.complainant_age ?? "",
          complainantContact: editingRecord.complainantContact ?? editingRecord.complainant_contact ?? "",
          respondent: editingRecord.respondent || "",
          incidentDescription: editingRecord.incidentDescription || editingRecord.incident_description || editingRecord.details || "",
          actionTaken: editingRecord.actionTaken || editingRecord.action_taken || "",
          reportedBy: editingRecord.reportedBy || editingRecord.reported_by || "",
          blotterOfficer: editingRecord.blotterOfficer || editingRecord.blotter_officer || "",
          dateRecorded: toInputDateTime(editingRecord.dateRecorded || editingRecord.date_recorded, formatDateTimeValue(now)),
        }
      : {
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
          reportedBy: "",
          blotterOfficer: "",
          dateRecorded: formatDateTimeValue(fresh),
        };
    setForm(next);
    setBaseline(next);
    setSubmitting(false);
  }, [visible, editingRecord, now]);

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

  const isDirty = !baseline || JSON.stringify(form) !== JSON.stringify(baseline);

  const validate = () => {
    const nextErrors = {};
    const requireText = (key, label) => {
      if (!String(form[key] ?? "").trim()) nextErrors[key] = `${label} is required.`;
    };

    requireText("barangay", "Barangay");
    requireText("location", "Location");
    requireText("incidentType", "Type of incident");

    if (!String(form.incidentDateTime ?? "").trim()) {
      nextErrors.incidentDateTime = "Date & time of incident is required.";
    } else if (!isValidDateTimeValue(String(form.incidentDateTime).trim())) {
      nextErrors.incidentDateTime = "Use the format YYYY-MM-DDTHH:MM.";
    }

    requireText("complainantName", "Complainant name");

    const age = String(form.complainantAge ?? "").trim();
    if (age && (!/^\d{1,3}$/.test(age) || Number(age) < 1 || Number(age) > 120)) {
      nextErrors.complainantAge = "Age must be a number from 1 to 120.";
    }

    const contact = String(form.complainantContact ?? "").trim();
    if (contact && !/^09\d{9}$/.test(contact)) {
      nextErrors.complainantContact = "Contact number must start with 09 and contain exactly 11 digits.";
    }

    requireText("respondent", "Respondent");
    requireText("incidentDescription", "Incident description");
    if (!nextErrors.incidentDescription && String(form.incidentDescription).trim().length < 10) {
      nextErrors.incidentDescription = "Incident description must be at least 10 characters.";
    }

    requireText("actionTaken", "Action taken");
    if (!nextErrors.actionTaken && String(form.actionTaken).trim().length < 5) {
      nextErrors.actionTaken = "Action taken must be at least 5 characters.";
    }

    requireText("reportedBy", "Reported by");
    requireText("blotterOfficer", "Blotter officer");

    if (!String(form.dateRecorded ?? "").trim()) {
      nextErrors.dateRecorded = "Date recorded is required.";
    } else if (!isValidDateTimeValue(String(form.dateRecorded).trim())) {
      nextErrors.dateRecorded = "Use the format YYYY-MM-DDTHH:MM.";
    }

    return nextErrors;
  };

  const handleSubmit = async () => {
    if (!isDirty) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const record = {
        id: editingRecord?.id || form.blotterNo || `blotter-${Date.now()}`,
        kind: "Blotter",
        title: `${form.incidentType}\n${form.location || "Location unspecified"}`,
        reportType: "Blotter",
        location: form.location,
        barangay: form.barangay,
        severity: "Medium",
        created_at: form.dateRecorded || new Date().toISOString(),
        details: form.incidentDescription,
        incidentDescription: form.incidentDescription,
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
                  <Text style={styles.title}>{editingRecord ? "Edit Blotter Report" : "Add Blotter Report"}</Text>
                  <Text style={styles.subtitle}>
                    {editingRecord ? "Update the logged complaint case" : "Log a local complaint case"}
                  </Text>
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

              <View style={[styles.field, styles.fieldRaisedHigh]}>
                <Text style={styles.label}>Barangay</Text>
                <Dropdown
                  hover
                  options={ARGAO_BARANGAYS.map((value) => ({ value, label: value }))}
                  selectedValue={form.barangay}
                  placeholder="Select barangay"
                  onChange={(value) => updateField("barangay", value)}
                />
                {errors.barangay ? <Text style={styles.errorText}>{errors.barangay}</Text> : null}
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

              <View style={[styles.field, styles.fieldRaisedMedium]}>
                <Text style={styles.label}>Type of Incident</Text>
                <Dropdown
                  hover
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
                  style={[styles.input, errors.incidentDateTime && styles.inputError]}
                  value={form.incidentDateTime}
                  onChangeText={(value) => updateField("incidentDateTime", value)}
                  placeholder="YYYY-MM-DDTHH:MM"
                  placeholderTextColor="#8A94A6"
                  keyboardType="default"
                />
                {errors.incidentDateTime ? <Text style={styles.errorText}>{errors.incidentDateTime}</Text> : null}
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
                    style={[styles.input, errors.complainantAge && styles.inputError]}
                    value={form.complainantAge}
                    onChangeText={(value) => updateField("complainantAge", value)}
                    placeholder="Age"
                    placeholderTextColor="#8A94A6"
                    keyboardType="number-pad"
                  />
                  {errors.complainantAge ? <Text style={styles.errorText}>{errors.complainantAge}</Text> : null}
                </View>
              </View>

              <View style={styles.gridRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>Contact No.</Text>
                  <TextInput
                    style={[styles.input, errors.complainantContact && styles.inputError]}
                    value={form.complainantContact}
                    onChangeText={(value) => updateField("complainantContact", value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="09XXXXXXXXX"
                    placeholderTextColor="#8A94A6"
                    keyboardType="phone-pad"
                    maxLength={11}
                  />
                  {errors.complainantContact ? <Text style={styles.errorText}>{errors.complainantContact}</Text> : null}
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
                  style={[styles.input, errors.dateRecorded && styles.inputError]}
                  value={form.dateRecorded}
                  onChangeText={(value) => updateField("dateRecorded", value)}
                  placeholder="YYYY-MM-DDTHH:MM"
                  placeholderTextColor="#8A94A6"
                />
                {errors.dateRecorded ? <Text style={styles.errorText}>{errors.dateRecorded}</Text> : null}
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
                style={[styles.submitButton, (submitting || !isDirty) && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                activeOpacity={0.85}
                disabled={submitting || !isDirty}
              >
                <Text style={styles.submitButtonText}>
                  {submitting ? "Saving..." : !isDirty ? "No Changes" : editingRecord ? "Save Changes" : "Save Blotter Report"}
                </Text>
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
  fieldRaisedHigh: {
    zIndex: 30,
  },
  fieldRaisedMedium: {
    zIndex: 20,
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
