import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
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
}) {
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  const selectedLabel = options.find((o) => o.value === selectedValue)?.label;

  const openModal = () => {
    if (!disabled) setOpen(true);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={openModal}
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
          name="chevron-down"
          size={18}
          color={disabled ? "#B4BDCA" : COMMUNISHIELD_BLUE}
        />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setOpen(false)}
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
                onPress={() => setOpen(false)}
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
              renderItem={({ item }) => {
                const isSelected = item.value === selectedValue;

                return (
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      isSelected && styles.optionItemSelected,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
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
              }}
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
