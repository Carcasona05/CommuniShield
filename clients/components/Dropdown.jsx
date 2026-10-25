import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  ScrollView,
  Pressable,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COMMUNISHIELD_BLUE = "#294880";

export default function Dropdown({
  options = [],
  selectedValue = "",
  placeholder = "Select an option",
  onChange,
  disabled = false,
  hover = false,
}) {
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  const selectedLabel = options.find((o) => o.value === selectedValue)?.label;

  const openModal = () => {
    if (!disabled) setOpen(true);
  };

  const close = () => setOpen(false);

  const trigger = (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={() => {
        if (disabled) return;
        if (hover) setOpen((current) => !current);
        else openModal();
      }}
      activeOpacity={0.85}
    >
      <Text
        style={[
          styles.buttonText,
          !selectedLabel && styles.buttonPlaceholder,
        ]}
        numberOfLines={1}
      >
        {selectedLabel || placeholder}
      </Text>

      <Ionicons
        name={hover && open ? "chevron-up" : "chevron-down"}
        size={18}
        color={disabled ? "#B4BDCA" : COMMUNISHIELD_BLUE}
      />
    </TouchableOpacity>
  );

  const renderOption = (item, index) => {
    const isSelected = item.value === selectedValue;

    return (
      <TouchableOpacity
        key={`${item.value}-${index}`}
        style={[
          styles.optionItem,
          isSelected && styles.optionItemSelected,
        ]}
        activeOpacity={0.85}
        onPress={() => {
          onChange(item.value);
          close();
        }}
      >
        <Text
          style={[
            styles.optionText,
            isSelected && styles.optionTextSelected,
          ]}
        >
          {item.label}
        </Text>

        {isSelected ? (
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={COMMUNISHIELD_BLUE}
          />
        ) : null}
      </TouchableOpacity>
    );
  };

  // Anchored hover-down menu. Used where a modal option list would break the
  // form flow (for example the admin Add Report and Add Blotter forms).
  if (hover) {
    return (
      <View style={[styles.hoverWrapper, open && styles.hoverWrapperOpen]}>
        {trigger}

        {open && (
          <>
            {Platform.OS === "web" && (
              <Pressable style={styles.hoverDismiss} onPress={close} />
            )}
            <View style={styles.hoverMenu}>
              <ScrollView
                style={styles.hoverScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {options.length ? (
                  options.map(renderOption)
                ) : (
                  <View style={styles.optionItem}>
                    <Text style={styles.optionText}>No options available</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </>
        )}
      </View>
    );
  }

  return (
    <>
      {trigger}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={close}
          />

          <View
            style={[
              styles.modalCard,
              {
                width: width >= 500 ? 400 : Math.min(width - 40, 420),
                maxHeight: height * 0.6,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{placeholder}</Text>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={close}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={20} color={COMMUNISHIELD_BLUE} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={options}
              keyExtractor={(item, index) => `${item.value}-${index}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              renderItem={({ item, index }) => renderOption(item, index)}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8E0EB",
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  buttonDisabled: {
    backgroundColor: "#F8FAFD",
  },

  buttonText: {
    flex: 1,
    marginRight: 10,
    fontSize: 15,
    fontFamily: "PoppinsRegular",
    color: "#1F2A37",
  },

  buttonPlaceholder: {
    color: "#8A94A6",
  },

  hoverWrapper: {
    position: "relative",
    zIndex: 1,
  },

  hoverWrapperOpen: {
    zIndex: 100,
  },

  hoverDismiss: {
    position: Platform.OS === "web" ? "fixed" : "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },

  hoverMenu: {
    position: "absolute",
    top: 58,
    left: 0,
    right: 0,
    maxHeight: 240,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    zIndex: 2,
    elevation: 12,
    shadowColor: "#0F1E3D",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },

  hoverScroll: {
    maxHeight: 228,
    flexGrow: 0,
    flexShrink: 1,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E2F2",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E7ECF3",
  },

  modalTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  closeButton: {
    padding: 4,
  },

  listContent: {
    paddingVertical: 6,
  },

  optionItem: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  optionItemSelected: {
    backgroundColor: "#EEF3FF",
  },

  optionText: {
    flex: 1,
    marginRight: 10,
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    color: "#1F2A37",
  },

  optionTextSelected: {
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },
});
