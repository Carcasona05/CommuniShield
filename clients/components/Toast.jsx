import React, {
  createContext,
  useContext,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COMMUNISHIELD_BLUE = "#294880";
const ERROR_RED = "#C0392B";

const ToastContext = createContext(null);

export const useToast = () => useContext(ToastContext);

export default function ToastProvider({ children }) {
  const { width } = useWindowDimensions();
  const [toast, setToast] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-24)).current;
  const hideTimer = useRef(null);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -24,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  };

  const show = (message, type = "success", duration = 2600) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);

    setToast({ message, type });

    opacity.setValue(0);
    translateY.setValue(-24);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();

    hideTimer.current = setTimeout(dismiss, duration);
  };

  const success = (message) => show(message, "success");
  const error = (message) => show(message, "error");

  return (
    <ToastContext.Provider value={{ show, success, error }}>
      {children}

      {toast ? (
        <View style={styles.overlay} pointerEvents="none">
          <Animated.View
            style={[
              styles.toast,
              toast.type === "error" && styles.errorToast,
              { width: width >= 500 ? 400 : "88%" },
              { opacity, transform: [{ translateY }] },
            ]}
          >
            <View
              style={[
                styles.iconCircle,
                toast.type === "error" && styles.errorIconCircle,
              ]}
            >
              <Ionicons
                name={toast.type === "error" ? "alert" : "checkmark"}
                size={18}
                color="#FFFFFF"
              />
            </View>

            <Text style={styles.toastText} numberOfLines={3}>
              {toast.message}
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 20,
    zIndex: 999,
  },

  toast: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COMMUNISHIELD_BLUE,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },

  errorToast: {
    backgroundColor: ERROR_RED,
  },

  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  errorIconCircle: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },

  toastText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "PoppinsMedium",
    color: "#FFFFFF",
    lineHeight: 20,
  },
});
