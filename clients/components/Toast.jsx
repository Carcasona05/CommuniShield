import React, {
  createContext,
  useCallback,
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
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COMMUNISHIELD_BLUE = "#294880";
const SUCCESS_GREEN = "#22A06B";
const ERROR_RED = "#E45757";

const ToastContext = createContext(null);

export const useToast = () => useContext(ToastContext);

const TOAST_CONFIG = {
  success: {
    bg: COMMUNISHIELD_BLUE,
    icon: "checkmark-circle",
    iconColor: "#FFFFFF",
  },
  error: {
    bg: ERROR_RED,
    icon: "alert-circle",
    iconColor: "#FFFFFF",
  },
};

export default function ToastProvider({ children }) {
  const { width } = useWindowDimensions();
  const [toast, setToast] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const translateX = useRef(new Animated.Value(20)).current;
  const hideTimer = useRef(null);

  const isDesktop = width >= 768;

  const dismiss = useCallback(() => {
    const toValue = isDesktop ? 20 : -20;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: toValue,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  }, [opacity, translateY, isDesktop]);

  const show = useCallback(
    (message, type = "success", duration = 3000) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);

      setToast({ message, type });

      opacity.setValue(0);
      translateY.setValue(-20);
      translateX.setValue(isDesktop ? -20 : 0);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      hideTimer.current = setTimeout(dismiss, duration);
    },
    [dismiss, opacity, translateY, translateX, isDesktop]
  );

  const success = useCallback((message) => show(message, "success"), [show]);
  const error = useCallback((message) => show(message, "error"), [show]);

  const config = toast ? TOAST_CONFIG[toast.type] || TOAST_CONFIG.success : null;

  return (
    <ToastContext.Provider value={{ show, success, error }}>
      {children}

      {toast && config ? (
        <View
          style={[
            styles.overlay,
            isDesktop && styles.overlayDesktop,
          ]}
          pointerEvents="none"
        >
          <Animated.View
            style={[
              styles.toast,
              isDesktop && styles.toastDesktop,
              { backgroundColor: config.bg },
              {
                opacity,
                transform: [{ translateY }, { translateX }],
              },
            ]}
          >
            <View style={styles.iconCircle}>
              <Ionicons name={config.icon} size={18} color={config.iconColor} />
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
    paddingTop: 80,
    paddingHorizontal: 20,
    zIndex: 9999,
  },

  overlayDesktop: {
    alignItems: "flex-start",
    paddingTop: 20,
    paddingHorizontal: 24,
  },

  toast: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: "88%",
    maxWidth: 400,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },

  toastDesktop: {
    width: 380,
    maxWidth: 380,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },

  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  toastText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: "#FFFFFF",
    lineHeight: 19,
  },
});
