import React, { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

const pad = (value) => String(value).padStart(2, "0");
const dateValue = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const timeValue = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

export default function BlotterDateField({ value, onChange, label, mode, disabled, error }) {
  const [activePicker, setActivePicker] = useState(null);
  const [pickerValue, setPickerValue] = useState(() => new Date());
  const [date = "", time = ""] = (value || "").split("T");
  const hasTime = mode === "datetime";
  const changeDate = (selected) => onChange(selected ? (hasTime ? `${selected}T${time}` : selected) : "");
  const changeTime = (selected) => onChange(date || selected ? `${date}T${selected}` : "");
  const candidate = date ? new Date(`${date}T${time || "00:00"}`) : new Date();
  const openPicker = (part) => {
    setPickerValue(Number.isNaN(candidate.getTime()) ? new Date() : candidate);
    setActivePicker(part);
  };
  const commitSelection = (selected) => {
    if (activePicker === "date") changeDate(dateValue(selected));
    else changeTime(timeValue(selected));
  };
  const handleNativeChange = (event, selected) => {
    if (Platform.OS === "android" || event.type === "dismissed") setActivePicker(null);
    if (!selected || event.type === "dismissed") return;
    if (Platform.OS === "ios") setPickerValue(selected);
    else commitSelection(selected);
  };

  return (
    <View>
      <View style={styles.row}>
        {Platform.OS === "web" ? (
          <>
            <input
              type="date"
              value={date}
              onChange={(event) => changeDate(event.target.value)}
              disabled={disabled}
              aria-label={`${label} date`}
              aria-invalid={Boolean(error)}
              style={{ ...webInputStyle, borderColor: error ? "#D75E5E" : "#D9E2F0" }}
            />
            {hasTime ? <input
              type="time"
              value={time}
              onChange={(event) => changeTime(event.target.value)}
              disabled={disabled}
              aria-label={`${label} time`}
              aria-invalid={Boolean(error)}
              style={{ ...webInputStyle, borderColor: error ? "#D75E5E" : "#D9E2F0" }}
            /> : null}
          </>
        ) : (
          <>
            <TouchableOpacity style={[styles.control, error && styles.error]} onPress={() => openPicker("date")} disabled={disabled} accessibilityLabel={`Choose ${label} date`} accessibilityRole="button">
              <Text style={styles.value}>{date || "Select date"}</Text>
              <Ionicons name="calendar-outline" size={20} color="#294880" />
            </TouchableOpacity>
            {hasTime ? <TouchableOpacity style={[styles.control, error && styles.error]} onPress={() => openPicker("time")} disabled={disabled} accessibilityLabel={`Choose ${label} time`} accessibilityRole="button">
              <Text style={styles.value}>{time || "Select time"}</Text>
              <Ionicons name="time-outline" size={20} color="#294880" />
            </TouchableOpacity> : null}
          </>
        )}
      </View>
      {Platform.OS !== "web" && activePicker && !disabled ? (
        <View>
          <DateTimePicker
            value={pickerValue}
            mode={activePicker}
            display={Platform.OS === "ios" ? (activePicker === "date" ? "inline" : "spinner") : "default"}
            onChange={handleNativeChange}
          />
          {Platform.OS === "ios" ? <View style={styles.pickerActions}>
            <TouchableOpacity onPress={() => setActivePicker(null)} style={styles.done} accessibilityRole="button"><Text style={styles.value}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { commitSelection(pickerValue); setActivePicker(null); }} style={styles.done} accessibilityRole="button"><Text style={styles.value}>Done</Text></TouchableOpacity>
          </View> : null}
        </View>
      ) : null}
      {value ? <TouchableOpacity onPress={() => { onChange(""); setActivePicker(null); }} disabled={disabled} style={styles.clear} accessibilityLabel={`Clear ${label}`} accessibilityRole="button"><Text style={styles.clearText}>Clear date{hasTime ? " and time" : ""}</Text></TouchableOpacity> : null}
    </View>
  );
}

const webInputStyle = { flex: "1 1 160px", minWidth: 0, height: 48, boxSizing: "border-box", borderWidth: 1, borderStyle: "solid", borderRadius: 10, padding: "0 14px", fontFamily: "PoppinsRegular, Arial, sans-serif", fontSize: 14, color: "#111827", backgroundColor: "#FFFFFF", colorScheme: "light" };
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  control: { flex: 1, minWidth: 140, minHeight: 48, borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 10, paddingHorizontal: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  value: { color: "#294880", fontFamily: "PoppinsRegular", fontSize: 14 },
  error: { borderColor: "#D75E5E" },
  clear: { alignSelf: "flex-start", marginTop: 8, paddingVertical: 4 },
  clearText: { color: "#6B7280", fontFamily: "PoppinsRegular", fontSize: 12 },
  done: { alignSelf: "flex-end", padding: 12 },
  pickerActions: { flexDirection: "row", justifyContent: "flex-end" },
});
