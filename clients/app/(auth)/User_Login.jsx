import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
  Platform,
  Alert,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons, FontAwesome, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import apiClient from "../../services/apiClient";
import { saveAuth } from "../../services/auth";
import { IMAGES } from "../../constants/assets";
import { prefetchAllData } from "../../services/dataStore";

const validateLoginPassword = (value) => {
  if (!value) return "Password incorrect.";
  return "";
};


export default function UserLogin() {
  const { width, height } = useWindowDimensions();

  const isSmallPhone = width < 360;
  const isShortScreen = height < 700;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [, setAdminTapCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
    }, []),
  );

  const handleHiddenAdminTap = () => {
    setAdminTapCount((prev) => {
      const next = prev + 1;

      if (next >= 5) {
        if (Platform.OS === "web") {
          router.push("/(auth)/Admin_Login");
        } else {
          Alert.alert("Admin Access", "Admin login is available on web only.");
        }
        return 0;
      }

      return next;
    });
  };

  const handlePasswordChange = (text) => {
    setPassword(text);
    if (submitted) {
      setPasswordError(validateLoginPassword(text));
    }
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();

    setSubmitted(true);
    const pwError = validateLoginPassword(password);
    setPasswordError(pwError);
    if (pwError) return;

    if (!cleanEmail) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post("/login", {
        email: cleanEmail,
        password,
      });

      const token = res.data?.access_token;

      if (!token) {
        throw new Error("No access token received from server.");
      }

      try {
        await saveAuth({ token, role: "user" });
      } catch (storageError) {
        console.warn("Failed to store access token:", storageError);
      }

      await prefetchAllData();

      router.replace("/(tabs)/User_Home");
    } catch (error) {
      Alert.alert(
        "Login Failed",
        error.response?.data?.error || "Invalid credentials"
      );
    } finally {
      setLoading(false);
    }
  };

  const openForgotModal = () => {
    setResetEmail(email);
    setShowForgotModal(true);
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setResetEmail("");
  };

  const handleVerifyEmail = () => {
    const cleanEmail = resetEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanEmail) {
      Alert.alert("Error", "Please enter your email.");
      return;
    }

    if (!emailRegex.test(cleanEmail)) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }

    globalThis.demoAccount.resetEmail = cleanEmail;
    closeForgotModal();
    router.push("/(auth)/SendOTP");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <Image
            source={IMAGES.bannerDark}
            style={[
              styles.bottomBanner,
              {
                width: width * 1.15,
                height: isShortScreen ? height * 0.28 : height * 0.34,
                bottom: isShortScreen ? -height * 0.1 : -height * 0.12,
                left: -width * 0.075,
              },
            ]}
            resizeMode="cover"
          />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop:
                  Platform.OS === "android"
                    ? isShortScreen
                      ? 18
                      : 30
                    : isShortScreen
                      ? 10
                      : 20,
                paddingBottom: isShortScreen ? 40 : 90,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.formCard,
                {
                  width: width >= 500 ? 420 : "88%",
                },
              ]}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleHiddenAdminTap}
              >
                <Image
                  source={IMAGES.logoText}
                  style={[
                    styles.logo,
                    {
                      width: isSmallPhone ? 300 : Math.min(width * 0.95, 430),
                      height: isShortScreen ? 150 : isSmallPhone ? 165 : 190,
                      marginBottom: isShortScreen ? -5 : 3,
                    },
                  ]}
                />
              </TouchableOpacity>

              <Text
                style={[
                  styles.title,
                  {
                    fontSize: isSmallPhone ? 22 : 24,
                    marginBottom: isShortScreen ? 20 : 24,
                  },
                ]}
              >
                Login
              </Text>

              <View style={styles.inputWrapper}>
                <View style={styles.iconBox}>
                  <MaterialIcons name="email" size={20} color="#2F4F8F" />
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor="#6E7FA5"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="off"
                />
              </View>

              <View
                style={[
                  styles.inputWrapper,
                  passwordError && styles.inputWrapperError,
                ]}
              >
                <View style={styles.iconBox}>
                  <FontAwesome name="lock" size={22} color="#2F4F8F" />
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#6E7FA5"
                  value={password}
                  onChangeText={handlePasswordChange}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                />

                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#5A6F9E"
                  />
                </TouchableOpacity>
              </View>
              {passwordError ? (
                <Text style={styles.errorText}>{passwordError}</Text>
              ) : null}

              <TouchableOpacity
                style={styles.forgotContainer}
                onPress={openForgotModal}
              >
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.loginButton,
                  {
                    marginBottom: isShortScreen ? 26 : 36,
                    opacity: loading ? 0.6 : 1,
                  },
                ]}
                onPress={handleLogin}
                activeOpacity={0.85}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.loginButtonText}>Login</Text>
                )}
              </TouchableOpacity>

              <View style={styles.signupSection}>
                <View style={styles.lineRow}>
                  <View style={styles.line} />
                  <Text style={styles.signupQuestion}>
                    Don’t have an account?
                  </Text>
                  <View style={styles.line} />
                </View>

                <TouchableOpacity
                  onPress={() => router.push("/(auth)/User_Register")}
                >
                  <Text style={styles.signupLink}>Sign Up</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          <Modal
            visible={showForgotModal}
            transparent
            animationType="fade"
            onRequestClose={closeForgotModal}
          >
            <KeyboardAvoidingView
              style={styles.modalOverlay}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <View
                style={[
                  styles.modalCard,
                  {
                    width: width >= 500 ? 380 : "88%",
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={closeForgotModal}
                >
                  <Ionicons name="close" size={22} color="#294880" />
                </TouchableOpacity>

                <Text style={styles.modalTitle}>Forgot Password</Text>

                <Text style={styles.modalSubtitle}>
                  Enter your email to receive your OTP.
                </Text>

                <View style={styles.modalInputWrapper}>
                  <View style={styles.iconBox}>
                    <MaterialIcons name="email" size={20} color="#2F4F8F" />
                  </View>

                  <TextInput
                    style={styles.modalInput}
                    placeholder="Enter your email"
                    placeholderTextColor="#6E7FA5"
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="off"
                  />
                </View>

                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={handleVerifyEmail}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalButtonText}>Verify Email</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8F8F8",
  },

  keyboardView: {
    flex: 1,
  },

  container: {
    flex: 1,
    backgroundColor: "#F8F8F8",
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  formCard: {
    alignItems: "center",
    zIndex: 2,
  },

  logo: {
    resizeMode: "contain",
    alignSelf: "center",
  },

  title: {
    fontWeight: "700",
    color: "#294880",
    textAlign: "center",
  },

  inputWrapper: {
    width: "100%",
    minHeight: 48,
    borderWidth: 1.2,
    borderColor: "#8EA3CE",
    borderRadius: 8,
    backgroundColor: "#EEF2F8",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 16,
  },

  iconBox: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  input: {
    flex: 1,
    minHeight: 48,
    color: "#294880",
    fontSize: 14,
    paddingVertical: Platform.OS === "web" ? 10 : 0,
    outlineStyle: "none",
  },

  inputWrapperError: {
    borderColor: "#C0392B",
  },

  errorText: {
    width: "100%",
    color: "#C0392B",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  forgotContainer: {
    width: "100%",
    marginTop: -6,
    marginBottom: 18,
    alignItems: "flex-start",
  },

  forgotText: {
    fontSize: 12,
    color: "#5A6F9E",
  },

  loginButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#294880",
  },

  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },

  signupSection: {
    width: "100%",
    alignItems: "center",
  },

  lineRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  line: {
    flex: 1,
    height: 1,
    backgroundColor: "#A8B6D4",
  },

  signupQuestion: {
    marginHorizontal: 10,
    fontSize: 12,
    color: "#6C7B9D",
    textAlign: "center",
  },

  signupLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#294880",
    textDecorationLine: "underline",
  },

  bottomBanner: {
    position: "absolute",
    opacity: 0.95,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  modalCard: {
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "#D9E2F2",
  },

  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 2,
    padding: 4,
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#294880",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 10,
  },

  modalSubtitle: {
    fontSize: 13,
    color: "#6C7B9D",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },

  modalInputWrapper: {
    width: "100%",
    minHeight: 48,
    borderWidth: 1.2,
    borderColor: "#8EA3CE",
    borderRadius: 8,
    backgroundColor: "#EEF2F8",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 14,
  },

  modalInput: {
    flex: 1,
    minHeight: 48,
    color: "#294880",
    fontSize: 14,
    paddingVertical: Platform.OS === "web" ? 10 : 0,
    outlineStyle: "none",
  },

  modalButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#294880",
    marginTop: 6,
  },

  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});