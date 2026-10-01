import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";

const ActionSheetModal = ({
  visible,
  title,
  options,
  onSelect,
  onClose,
  destructiveIndex,
  cancelText = "Cancel",
}) => {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.container}>
          {title && <Text style={styles.title}>{title}</Text>}
          {options.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.option,
                index === options.length - 1 && styles.lastOption,
                index === destructiveIndex && styles.destructive,
              ]}
              onPress={() => {
                onSelect(index);
                onClose();
              }}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.optionText,
                index === destructiveIndex && styles.destructiveText,
              ]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.cancelText}>{cancelText}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  title: {
    padding: 16,
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  option: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lastOption: {
    borderBottomWidth: 0,
  },
  destructive: {
    backgroundColor: "#FEF2F2",
  },
  optionText: {
    fontSize: 16,
    color: "#1F2937",
    textAlign: "center",
  },
  destructiveText: {
    color: "#EF4444",
    fontWeight: "600",
  },
  cancel: {
    marginTop: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
});

export default ActionSheetModal;