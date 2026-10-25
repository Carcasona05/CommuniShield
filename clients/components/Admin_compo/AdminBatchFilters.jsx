import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

const BLUE = "#294880";

const normalizeOptions = (options) =>
  (options || []).map((option) =>
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

function useDropdownSelection(value, options) {
  return useMemo(() => {
    // Callers sometimes pass the visible label as the value (for example the
    // hotspot date filter). Match either so the trigger and highlight stay in
    // sync without changing those call sites.
    const selected =
      options.find((option) => option.value === value) ||
      options.find((option) => option.label === value);
    return {
      selectedValue: selected ? selected.value : value,
      selectedLabel: selected ? selected.label : value,
    };
  }, [options, value]);
}

export function BatchFilterDropdown({
  label,
  value,
  options,
  onChange,
  width,
  style,
  testID,
  menuTestID,
  placeholder,
  searchable = false,
  searchPlaceholder = "Search...",
  disabled = false,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const { selectedValue, selectedLabel } = useDropdownSelection(value, normalizedOptions);
  const visibleOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return normalizedOptions;
    return normalizedOptions.filter((option) =>
      String(option.label).toLowerCase().includes(term)
    );
  }, [normalizedOptions, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const fieldStyle = [
    styles.field,
    width ? { width, flex: undefined } : styles.flexField,
    open && styles.fieldOpen,
    style,
  ];

  return (
    <View style={fieldStyle}>
      <Text style={[styles.label, compact && styles.compactLabel]} numberOfLines={1}>{label}</Text>

      <View style={styles.control}>
        <TouchableOpacity
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={disabled}
          style={[styles.trigger, compact && styles.compactTrigger, disabled && styles.triggerDisabled]}
          onPress={() => (open ? close() : setOpen(true))}
          activeOpacity={0.85}
        >
          <Text style={[styles.triggerText, compact && styles.compactTriggerText, !selectedLabel && styles.placeholder]} numberOfLines={1}>
            {selectedLabel || placeholder || "Select"}
          </Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#5D6F92" />
        </TouchableOpacity>

        {open && (
          <>
            {Platform.OS === "web" && (
              <Pressable style={styles.webDismiss} onPress={close} />
            )}
            <View testID={menuTestID} style={styles.menu}>
              {searchable && (
                <View style={styles.searchRow}>
                  <Ionicons name="search-outline" size={16} color="#5D6F92" />
                  <TextInput
                    autoFocus
                    value={query}
                    onChangeText={setQuery}
                    placeholder={searchPlaceholder}
                    placeholderTextColor="#8A98B3"
                    style={styles.searchInput}
                  />
                  {!!query && (
                    <TouchableOpacity onPress={() => setQuery("")} accessibilityLabel="Clear search">
                      <Ionicons name="close-circle" size={16} color="#8A98B3" />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <ScrollView
                style={styles.optionList}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {visibleOptions.length ? visibleOptions.map((option) => {
                  const selected = selectedValue === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.option, selected && styles.optionSelected]}
                      onPress={() => {
                        onChange(option.value);
                        close();
                      }}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[styles.optionText, selected && styles.optionTextSelected]}
                        numberOfLines={2}
                      >
                        {option.label}
                      </Text>
                      {selected && <Ionicons name="checkmark" size={16} color={BLUE} />}
                    </TouchableOpacity>
                  );
                }) : (
                  <Text style={styles.emptyOption}>No matches</Text>
                )}
              </ScrollView>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export function BatchDateRangeDropdown({
  from,
  to,
  onChangeFrom,
  onChangeTo,
  width,
  style,
}) {
  const [open, setOpen] = useState(false);
  const [activePicker, setActivePicker] = useState(null);
  const [pickerValue, setPickerValue] = useState(new Date());
  const fieldStyle = [
    styles.field,
    width ? { width, flex: undefined } : styles.flexField,
    open && styles.fieldOpen,
    style,
  ];

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
  const close = () => {
    setOpen(false);
    setActivePicker(null);
  };

  return (
    <View style={fieldStyle}>
      <Text style={styles.label} numberOfLines={1}>Date</Text>

      <View style={styles.control}>
        <TouchableOpacity
          style={styles.trigger}
          onPress={() => (open ? close() : setOpen(true))}
          activeOpacity={0.85}
        >
          <Text style={[styles.triggerText, !from && !to && styles.placeholder]} numberOfLines={1}>
            {rangeLabel}
          </Text>
          <Ionicons name={open ? "chevron-up" : "calendar-outline"} size={17} color="#5D6F92" />
        </TouchableOpacity>

        {open && (
          <>
            {Platform.OS === "web" && (
              <Pressable style={styles.webDismiss} onPress={close} />
            )}
            <View style={[styles.menu, styles.dateMenu]}>
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
              <TouchableOpacity style={styles.doneButton} onPress={close} activeOpacity={0.85}>
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexShrink: 0,
    position: "relative",
  },
  flexField: {
    flex: 1,
    minWidth: 170,
  },
  fieldOpen: {
    zIndex: 200,
  },
  label: {
    color: "#5D6F92",
    fontFamily: "PoppinsMedium",
    fontSize: 10,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  compactLabel: {
    fontSize: 9,
    marginBottom: 3,
  },
  control: {
    position: "relative",
  },
  trigger: {
    height: 46,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    backgroundColor: "#F7F9FD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  compactTrigger: {
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  compactTriggerText: {
    fontSize: 11,
  },
  triggerDisabled: {
    opacity: 0.55,
  },
  triggerText: {
    flex: 1,
    color: BLUE,
    fontFamily: "PoppinsMedium",
    fontSize: 12,
  },
  placeholder: {
    color: "#8A98B3",
  },
  webDismiss: {
    position: Platform.OS === "web" ? "fixed" : "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  menu: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    minWidth: 220,
    maxHeight: 300,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    zIndex: 2,
    elevation: 12,
    shadowColor: "#0F1E3D",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  searchRow: {
    minHeight: 40,
    marginHorizontal: 8,
    marginBottom: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 9,
    backgroundColor: "#F7F9FD",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: BLUE,
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    outlineStyle: Platform.OS === "web" ? "none" : undefined,
  },
  optionList: {
    flexGrow: 0,
    flexShrink: 1,
  },
  option: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  optionSelected: {
    backgroundColor: "#EAF2FF",
  },
  optionText: {
    flex: 1,
    color: "#2F4267",
    fontFamily: "PoppinsRegular",
    fontSize: 13,
  },
  optionTextSelected: {
    color: BLUE,
    fontFamily: "PoppinsSemiBold",
  },
  emptyOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#8A98B3",
    fontFamily: "PoppinsRegular",
    fontSize: 13,
  },
  dateMenu: {
    width: 300,
    maxWidth: 340,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  dateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  dateField: {
    flex: 1,
    minWidth: 120,
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
    minHeight: 38,
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
