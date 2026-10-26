import React, { useEffect, useState } from "react";
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
import {
  BLOTTER_FORM_SECTIONS,
  getBlotterFormValues,
  validateBlotterForm,
} from "../../utils/blotterForm";
import { ARGAO_POLICE_STATION } from "../../constants/policeStation";
import BlotterDateField from "./BlotterDateField";

const BLUE = "#294880";

export default function Admin_AddBlotterModal({ visible, onClose, onSubmit, record: editingRecord }) {
  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });
  const [form, setForm] = useState(() => getBlotterFormValues());
  const [baseline, setBaseline] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const values = getBlotterFormValues(editingRecord);
    setForm(values);
    setBaseline(values);
    setErrors({});
    setSubmitting(false);
  }, [visible, editingRecord]);

  const isDirty = !baseline || JSON.stringify(form) !== JSON.stringify(baseline);
  const closeModal = () => {
    if (!submitting) onClose();
  };
  const updateField = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "", submit: "" }));
  };
  const handleSubmit = async () => {
    if (submitting || !isDirty) return;
    const nextErrors = validateBlotterForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    try {
      const values = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
      const record = {
        ...values,
        ...(editingRecord?.id ? { id: editingRecord.id } : {}),
        kind: "Blotter",
        reportType: "Blotter",
        title: `${values.incidentType} • ${values.location}`,
        details: values.incidentDescription,
      };
      if (onSubmit) await onSubmit(record);
      onClose();
    } catch (error) {
      setErrors({ submit: error?.message || "Could not save the blotter certification." });
    } finally {
      setSubmitting(false);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeModal}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardAvoider}>
          <View style={styles.modalCard}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}><Ionicons name="document-text-outline" size={22} color={BLUE} /></View>
                <View style={styles.heading}>
                  <Text style={styles.title}>{editingRecord ? "Edit Blotter Certification" : "Add Blotter Certification"}</Text>
                  <Text style={styles.subtitle}>{ARGAO_POLICE_STATION.name} · Local records</Text>
                </View>
              </View>
              <TouchableOpacity onPress={closeModal} disabled={submitting} hitSlop={8} accessibilityLabel="Close blotter form" accessibilityRole="button">
                <Ionicons name="close" size={24} color="#4B5D7A" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.body} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.help}>Enter the information from the official record. Fields marked * are required. Optional details left blank appear as placeholders in the certification.</Text>
              <Text style={styles.help}>Saved on this device for now. Issuance location: Argao, Cebu, Philippines.</Text>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>AUTOMATIC RECORD NUMBERS</Text>
                <View style={styles.field}>
                  <Text style={styles.label}>Blotter Entry No.</Text>
                  <Text style={styles.systemValue}>{editingRecord?.blotter_no || editingRecord?.blotterNo || (editingRecord ? "[Blotter Entry Number]" : "Automatically assigned when saved")}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Log Book Page Number</Text>
                  <Text style={styles.systemValue}>{editingRecord?.page_number || editingRecord?.pageNumber || (editingRecord ? "[Page Number]" : "Automatically assigned when saved")}</Text>
                </View>
              </View>
              {BLOTTER_FORM_SECTIONS.map((section) => (
                <View key={section.title} style={styles.section}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  {section.description ? <Text style={styles.help}>{section.description}</Text> : null}
                  {section.fields.map((field) => (
                    <View key={field.key} style={styles.field}>
                      <Text style={styles.label}>{field.label}{field.required ? " *" : " (optional)"}</Text>
                      {field.type === "date" || field.type === "datetime" ? <BlotterDateField
                        value={form[field.key]}
                        onChange={(value) => updateField(field.key, value)}
                        label={field.label}
                        mode={field.type}
                        disabled={submitting}
                        error={errors[field.key]}
                      /> : <TextInput
                        style={[styles.input, field.multiline && styles.textArea, errors[field.key] && styles.inputError]}
                        value={form[field.key]}
                        onChangeText={(value) => updateField(field.key, value)}
                        placeholder={field.placeholder}
                        placeholderTextColor="#8A94A6"
                        multiline={Boolean(field.multiline)}
                        textAlignVertical={field.multiline ? "top" : "center"}
                        editable={!submitting}
                        autoCapitalize="sentences"
                        accessibilityLabel={field.label}
                      />}
                      {errors[field.key] ? <Text style={styles.errorText}>{errors[field.key]}</Text> : null}
                    </View>
                  ))}
                </View>
              ))}
              {errors.submit ? <Text style={styles.errorText}>{errors.submit}</Text> : null}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={submitting} activeOpacity={0.8}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitButton, (submitting || !isDirty) && styles.disabled]} onPress={handleSubmit} disabled={submitting || !isDirty} activeOpacity={0.85}>
                <Text style={styles.submitButtonText}>{submitting ? "Saving..." : !isDirty ? "No Changes" : editingRecord ? "Save Changes" : "Save Certification"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", paddingHorizontal: 20, paddingVertical: 24 },
  keyboardAvoider: { width: "100%", maxWidth: 680, height: "94%" },
  modalCard: { flex: 1, width: "100%", backgroundColor: "#FFFFFF", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "#D9E2F0" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "#E6ECF5" },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 12 },
  headerIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#EAF2FF", justifyContent: "center", alignItems: "center", marginRight: 12 },
  heading: { flex: 1 },
  title: { fontSize: 18, color: BLUE, fontFamily: "PoppinsSemiBold" },
  subtitle: { fontSize: 12, color: "#6B7280", fontFamily: "PoppinsRegular", marginTop: 2 },
  body: { flex: 1, minHeight: 0 },
  scrollContent: { padding: 20, paddingBottom: 28 },
  help: { fontSize: 12, lineHeight: 18, color: "#6B7280", fontFamily: "PoppinsRegular", marginBottom: 14 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 14, color: BLUE, fontFamily: "PoppinsSemiBold", marginBottom: 12 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, color: BLUE, fontFamily: "PoppinsSemiBold", marginBottom: 7 },
  input: { height: 48, borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 10, paddingHorizontal: 14, fontSize: 14, fontFamily: "PoppinsRegular", backgroundColor: "#FFFFFF", color: "#111827" },
  systemValue: { padding: 14, borderRadius: 10, backgroundColor: "#F3F7FB", color: "#41536F", fontSize: 14, fontFamily: "PoppinsRegular" },
  textArea: { height: 140, paddingVertical: 12 },
  inputError: { borderColor: "#D75E5E" },
  errorText: { marginTop: 6, fontSize: 12, lineHeight: 17, fontFamily: "PoppinsRegular", color: "#C0392B" },
  footer: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#E7ECF3", backgroundColor: "#F7F9FD" },
  cancelButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#EEF2F8", alignItems: "center", justifyContent: "center" },
  cancelButtonText: { color: BLUE, fontFamily: "PoppinsSemiBold", fontSize: 13 },
  submitButton: { minHeight: 42, paddingHorizontal: 18, borderRadius: 10, backgroundColor: BLUE, alignItems: "center", justifyContent: "center" },
  submitButtonText: { color: "#FFFFFF", fontFamily: "PoppinsSemiBold", fontSize: 13 },
  disabled: { opacity: 0.55 },
});
