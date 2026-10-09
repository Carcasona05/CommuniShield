import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

const BLUE = "#294880";

const normalizeOptions = (options) =>
  options.map((option) =>
    typeof option === "string"
      ? { value: option, label: option }
      : option
  );

const formatDateValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function BatchFilterDropdown({
  label,
  value,
  options,
  onChange,
  width,
  chips = false,
}) {
  const [open, setOpen] = useState(false);
  const normalizedOptions = normalizeOptions(options);
  const selectedLabel =
    normalizedOptions.find((option) => option.value === value)?.label || value;
  const fieldStyle = width ? [styles.field, { width }] : [styles.field, styles.flexField];

  return (
    <View style={fieldStyle}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.triggerText} numberOfLines={1}>{selectedLabel}</Text>
        <Ionicons name="chevron-down" size={16} color={BLUE} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>{label}</Text>
            {chips ? (
              <View style={styles.chipWrap}>
                {normalizedOptions.map((option) => {
                  const selected = value === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <ScrollView style={styles.optionList}>
                {normalizedOptions.map((option) => {
                  const selected = value === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.option, selected && styles.optionSelected]}
                      onPress={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                        {option.label}
                      </Text>
                      {selected && <Ionicons name="checkmark" size={18} color={BLUE} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function BatchDateRangeDropdown({
  from,
  to,
  onChangeFrom,
  onChangeTo,
  width,
}) {
  const [open, setOpen] = useState(false);
  const [activePicker, setActivePicker] = useState(null);
  const [pickerValue, setPickerValue] = useState(new Date());
  const fieldStyle = width ? [styles.field, { width }] : [styles.field, styles.flexField];

  const openNativePicker = (field, value) => {
    const parsed = value ? new Date(`${value}T12:00:00`) : new Date();
    setActivePicker(field);
    setPickerValue(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
  };

  const handleNativeDateChange = (event, date) => {
    const field = activePicker;
    setActivePicker(null);
    if (!date || event.type === "dismissed") return;
    (field === "from" ? onChangeFrom : onChangeTo)(formatDateValue(date));
  };

  const rangeLabel = from || to ? `${from || "Any"} - ${to || "Any"}` : "Any date";

  return (
    <View style={fieldStyle}>
      <Text style={styles.label} numberOfLines={1}>Date</Text>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.triggerText} numberOfLines={1}>{rangeLabel}</Text>
        <Ionicons name="calendar-outline" size={17} color={BLUE} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View style={[styles.menu, styles.dateMenu]}>
            <Text style={styles.menuTitle}>Date range</Text>
            <View style={styles.dateRow}>
              {[
                { key: "from", label: "From", value: from, onChange: onChangeFrom },
                { key: "to", label: "To", value: to, onChange: onChangeTo },
              ].map((field) => (
                <View key={field.key} style={styles.dateField}>
                  <Text style={styles.dateLabel}>{field.label}</Text>
                  {Platform.OS === "web" ? (
                    <input
                      type="date"
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      aria-label={field.label}
                      style={styles.webDateInput}
                    />
                  ) : (
                    <TouchableOpacity
                      style={styles.dateButton}
                      onPress={() => openNativePicker(field.key, field.value)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.dateButtonText, !field.value && styles.placeholder]}>
                        {field.value || "Select date"}
                      </Text>
                      <Ionicons name="calendar-outline" size={17} color={BLUE} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
            {Platform.OS !== "web" && activePicker ? (
              <DateTimePicker
                value={pickerValue}
                mode="date"
                display="default"
                onChange={handleNativeDateChange}
              />
            ) : null}
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexShrink: 0,
  },
  flexField: {
    flex: 1,
    minWidth: 170,
  },
  label: {
    color: "#5D6F92",
    fontFamily: "PoppinsMedium",
    fontSize: 11,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  trigger: {
    height: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 10,
    backgroundColor: "#F7F9FD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  triggerText: {
    flex: 1,
    color: BLUE,
    fontFamily: "PoppinsMedium",
    fontSize: 13,
  },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: "rgba(17, 24, 39, 0.28)",
  },
  menu: {
    width: "100%",
    maxWidth: 430,
    maxHeight: "70%",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
  },
  dateMenu: {
    maxWidth: 560,
    paddingHorizontal: 16,
  },
  menuTitle: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    color: BLUE,
    fontFamily: "PoppinsSemiBold",
    fontSize: 15,
  },
  optionList: {
    flexGrow: 0,
  },
  option: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionSelected: {
    backgroundColor: "#EEF3FF",
  },
  optionText: {
    flex: 1,
    color: "#2F4267",
    fontFamily: "PoppinsRegular",
    fontSize: 14,
  },
  optionTextSelected: {
    color: BLUE,
    fontFamily: "PoppinsSemiBold",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  chipSelected: {
    borderColor: BLUE,
    backgroundColor: BLUE,
  },
  chipText: {
    color: BLUE,
    fontFamily: "PoppinsMedium",
    fontSize: 13,
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  dateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  dateField: {
    flex: 1,
    minWidth: 180,
  },
  dateLabel: {
    marginBottom: 6,
    color: "#5D6F92",
    fontFamily: "PoppinsMedium",
    fontSize: 12,
  },
  dateButton: {
    height: 42,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 9,
    backgroundColor: "#F7F9FD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dateButtonText: {
    color: BLUE,
    fontFamily: "PoppinsRegular",
    fontSize: 13,
  },
  placeholder: {
    color: "#8A98B3",
  },
  webDateInput: {
    width: "100%",
    height: 42,
    boxSizing: "border-box",
    border: "1px solid #D9E2F0",
    borderRadius: 9,
    backgroundColor: "#F7F9FD",
    padding: "0 10px",
    color: BLUE,
    fontFamily: "PoppinsRegular",
    fontSize: 13,
  },
  doneButton: {
    minHeight: 40,
    marginTop: 14,
    paddingHorizontal: 18,
    borderRadius: 9,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
  },
});