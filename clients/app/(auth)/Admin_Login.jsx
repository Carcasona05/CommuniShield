import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  SafeAreaView,
  Platform,
  Alert,
  ScrollView,
  Modal,
} from "react-native";
import { MaterialIcons, FontAwesome, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import apiClient from "../../services/apiClient";
import { saveAuth, saveAdminInfo } from "../../services/auth";
import { prefetchAllData } from "../../services/dataStore";
import { IMAGES } from "../../constants/assets";

const { width, height } = Dimensions.get("window");

function seedAdminStore() {
  if (!globalThis.communishieldAdmins) {
    globalThis.communishieldAdmins = [];
  }

  if (
    globalThis.adminAccount?.email &&
    !globalThis.communishieldAdmins.some(
      (a) => a.email === globalThis.adminAccount.email
    )
  ) {
    globalThis.communishieldAdmins.push({
      email: globalThis.adminAccount.email,
      fullName: globalThis.adminAccount.fullName || "CommuniShield Admin",
      password: globalThis.adminAccount.password || "",
      role: globalThis.adminAccount.role || "admin",
      type:
        globalThis.adminAccount.role === "super_admin" ? "sadmin" : "nadmin",
    });
  }
}

const getAdminByEmail = (email) => {
  seedAdminStore();
  const clean = (email || "").trim().toLowerCase();
  return (
    globalThis.communishieldAdmins.find(
      (a) => (a.email || "").toLowerCase() === clean
    ) || null
  );
};

const validateLoginPassword = (value) => {
  if (!value) return "Password incorrect.";
  return "";
};

const validateNewPassword = (value) => {
  if (!value) return "Password is required.";
  if (value.length < 6) return "Password must be at least 6 characters.";
  if (!/[A-Z]/.test(value))
    return "Password must contain at least one capital letter.";
  if (!/[\d\W_]/.test(value))
    return "Password must contain at least one number or symbol.";
  return "";
};

const validateConfirmPassword = (value, newPasswordValue) => {
  if (!value) return "Please confirm your password.";
  if (value !== newPasswordValue) return "Passwords do not match.";
  return "";
};

export default function Admin_Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotStep, setForgotStep] = useState("email");

  const [forgotEmail, setForgotEmail] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [enteredOtp, setEnteredOtp] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmNewPasswordError, setConfirmNewPasswordError] = useState("");

  const handlePasswordChange = (text) => {
    setPassword(text);
    if (submitted) {
      setPasswordError(validateLoginPassword(text));
    }
  };

  const handleNewPasswordChange = (text) => {
    setNewPassword(text);
    if (forgotSubmitted) {
      setNewPasswordError(validateNewPassword(text));
      setConfirmNewPasswordError(validateConfirmPassword(text, confirmNewPassword));
    }
  };

  const handleConfirmNewPasswordChange = (text) => {
    setConfirmNewPassword(text);
    if (forgotSubmitted) {
      setConfirmNewPasswordError(validateConfirmPassword(newPassword, text));
    }
  };

  const handleLogin = async () => {
    if (Platform.OS !== "web") {
      Alert.alert("Restricted", "Admin login is available on web only.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    setSubmitted(true);
    const pwError = validateLoginPassword(password);
    setPasswordError(pwError);
    if (pwError) return;

    if (!cleanEmail) {
      Alert.alert("Error", "Please enter both email and password.");
      return;
    }

    try {
      const res = await apiClient.post("/admin/login", {
        email: cleanEmail,
        password: cleanPassword,
      });

      const token = res.data?.access_token;
      const user = res.data?.user;

      if (!token) {
        throw new Error("No access token received");
      }

      await saveAuth({ token, role: user?.role || "admin" });

      await saveAdminInfo({
        fullName: user?.name || user?.email || "Admin",
        email: user?.email || cleanEmail,
        role: user?.role || "Admin",
      });

      prefetchAllData();

      if (user?.role === "super_admin") {
        router.replace("/(sadmin)/SAdmin_Dashboard");
      } else {
        router.replace("/(admin)/Admin_Dashboard");
      }
    } catch (error) {
      Alert.alert(
        "Login Failed",
        error.response?.data?.error || "Invalid admin email or password."
      );
    }
  };

  const resetForgotForm = () => {
    setForgotStep("email");
    setForgotEmail("");
    setGeneratedOtp("");
    setEnteredOtp("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
    setForgotSubmitted(false);
    setNewPasswordError("");
    setConfirmNewPasswordError("");
  };

  const openForgotPassword = () => {
    resetForgotForm();
    setForgotVisible(true);
  };

  const closeForgotPassword = () => {
    setForgotVisible(false);
    resetForgotForm();
  };

  const handleSendOtp = () => {
    const cleanEmail = forgotEmail.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert("Error", "Please enter your admin email address.");
      return;
    }

    const foundAdmin = getAdminByEmail(cleanEmail);

    if (!foundAdmin) {
      Alert.alert("Account Not Found", "No admin account found with this email.");
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    setGeneratedOtp(otp);
    setForgotStep("otp");

    Alert.alert(
      "OTP Sent",
      `Your OTP code is ${otp}.\n\nFor now, this is shown here for testing. Later, this can be sent through email.`
    );
  };

  const handleVerifyOtp = () => {
    if (!enteredOtp.trim()) {
      Alert.alert("Error", "Please enter the OTP code.");
      return;
    }

    if (enteredOtp.trim() !== generatedOtp) {
      Alert.alert("Invalid OTP", "The OTP code you entered is incorrect.");
      return;
    }

    setForgotStep("newPassword");
  };

  const handleResetPassword = () => {
    const cleanEmail = forgotEmail.trim().toLowerCase();

    setForgotSubmitted(true);

    const pwError = validateNewPassword(newPassword);
    const confirmError = validateConfirmPassword(newPassword, confirmNewPassword);
    setNewPasswordError(pwError);
    setConfirmNewPasswordError(confirmError);

    if (pwError || confirmError) return;

    const foundAdmin = getAdminByEmail(cleanEmail);

    if (!foundAdmin) {
      Alert.alert("Error", "Admin account not found.");
      return;
    }

    foundAdmin.password = newPassword;
    foundAdmin.type = foundAdmin.type || (foundAdmin.role === "super_admin" ? "sadmin" : "nadmin");

    if (
      globalThis.adminAccount &&
      (globalThis.adminAccount.email || "").toLowerCase() === cleanEmail
    ) {
      globalThis.adminAccount.password = newPassword;
    }

    setPassword("");
    setEmail(cleanEmail);

    Alert.alert("Success", "Password has been reset successfully.", [
      {
        text: "OK",
        onPress: closeForgotPassword,
      },
    ]);
  };

  const renderForgotContent = () => {
    if (forgotStep === "email") {
      return (
        <>
          <Text style={styles.modalTitle}>Forgot Password</Text>
          <Text style={styles.modalSubtitle}>
            Enter your admin email address to receive an OTP code.
          </Text>

          <View style={styles.inputWrapper}>
            <MaterialIcons
              name="email"
              size={20}
              color="#2F4F8F"
              style={styles.inputIcon}
            />

            <TextInput
              style={styles.input}
              placeholder="Admin Email Address"
              placeholderTextColor="#6E7FA5"
              value={forgotEmail}
              onChangeText={setForgotEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="off"
            />
          </View>

          <TouchableOpacity
            style={styles.modalPrimaryButton}
            onPress={handleSendOtp}
            activeOpacity={0.85}
          >
            <Text style={styles.modalPrimaryButtonText}>Send OTP</Text>
          </TouchableOpacity>
        </>
      );
    }

    if (forgotStep === "otp") {
      return (
        <>
          <Text style={styles.modalTitle}>Enter OTP</Text>
          <Text style={styles.modalSubtitle}>
            Enter the 6-digit OTP code sent to your admin email.
          </Text>

          <View style={styles.inputWrapper}>
            <Ionicons
              name="keypad-outline"
              size={20}
              color="#2F4F8F"
              style={styles.inputIcon}
            />

            <TextInput
              style={styles.input}
              placeholder="Enter OTP"
              placeholderTextColor="#6E7FA5"
              value={enteredOtp}
              onChangeText={setEnteredOtp}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="off"
            />
          </View>

          <TouchableOpacity
            style={styles.modalPrimaryButton}
            onPress={handleVerifyOtp}
            activeOpacity={0.85}
          >
            <Text style={styles.modalPrimaryButtonText}>Verify OTP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalSecondaryButton}
            onPress={handleSendOtp}
            activeOpacity={0.75}
          >
            <Text style={styles.modalSecondaryButtonText}>Resend OTP</Text>
          </TouchableOpacity>
        </>
      );
    }

    return (
      <>
        <Text style={styles.modalTitle}>Set New Password</Text>
        <Text style={styles.modalSubtitle}>
          Create a new password for your admin account.
        </Text>

        <View
          style={[
            styles.inputWrapper,
            newPasswordError && styles.inputWrapperError,
          ]}
        >
          <FontAwesome
            name="lock"
            size={20}
            color="#2F4F8F"
            style={styles.inputIcon}
          />

          <TextInput
            style={styles.input}
            placeholder="New Password"
            placeholderTextColor="#6E7FA5"
            value={newPassword}
            onChangeText={handleNewPasswordChange}
            secureTextEntry={!showNewPassword}
            autoComplete="new-password"
          />

          <TouchableOpacity
            onPress={() => setShowNewPassword(!showNewPassword)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showNewPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#5A6F9E"
            />
          </TouchableOpacity>
        </View>
        {newPasswordError ? (
          <Text style={styles.errorText}>{newPasswordError}</Text>
        ) : null}

        <View
          style={[
            styles.inputWrapper,
            confirmNewPasswordError && styles.inputWrapperError,
          ]}
        >
          <FontAwesome
            name="lock"
            size={20}
            color="#2F4F8F"
            style={styles.inputIcon}
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm New Password"
            placeholderTextColor="#6E7FA5"
            value={confirmNewPassword}
            onChangeText={handleConfirmNewPasswordChange}
            secureTextEntry={!showConfirmNewPassword}
            autoComplete="new-password"
          />

          <TouchableOpacity
            onPress={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showConfirmNewPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#5A6F9E"
            />
          </TouchableOpacity>
        </View>
        {confirmNewPasswordError ? (
          <Text style={styles.errorText}>{confirmNewPasswordError}</Text>
        ) : null}

        <TouchableOpacity
          style={styles.modalPrimaryButton}
          onPress={handleResetPassword}
          activeOpacity={0.85}
        >
          <Text style={styles.modalPrimaryButtonText}>Reset Password</Text>
        </TouchableOpacity>
      </>
    );
  };

  if (Platform.OS !== "web") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.page}>
          <Image
            source={IMAGES.bannerDark}
            style={styles.backgroundBanner}
            resizeMode="cover"
          />

          <View style={styles.overlay} />

          <View style={[styles.container, styles.centerContent]}>
            <View style={styles.webCard}>
              <Image
                source={IMAGES.logoText}
                style={styles.logonoText}
                resizeMode="contain"
              />

              <Text style={styles.title}>Admin Login</Text>

              <Text style={styles.webOnlyText}>
                This page is available on web only.
              </Text>

              <TouchableOpacity
                style={styles.loginButton}
                onPress={() => router.replace("/(auth)/User_Login")}
                activeOpacity={0.85}
              >
                <Text style={styles.loginButtonText}>Back to User Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.page}>
        <Image
          source={IMAGES.bannerDark}
          style={styles.backgroundBanner}
          resizeMode="cover"
        />

        <View style={styles.overlay} />

        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <View style={styles.webCard}>
              <Image
                source={IMAGES.logoNoText}
                style={styles.logoNoText}
                resizeMode="contain"
              />

              <Text style={styles.title}>Admin Login</Text>

              <Text style={styles.subtitle}>
                Sign in to access the CommuniShield admin dashboard
              </Text>

              <View style={styles.inputWrapper}>
                <MaterialIcons
                  name="email"
                  size={20}
                  color="#2F4F8F"
                  style={styles.inputIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Admin Email Address"
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
                <FontAwesome
                  name="lock"
                  size={20}
                  color="#2F4F8F"
                  style={styles.inputIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Admin Password"
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
                style={styles.forgotButton}
                onPress={openForgotPassword}
                activeOpacity={0.75}
              >
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.loginButton}
                onPress={handleLogin}
                activeOpacity={0.85}
              >
                <Text style={styles.loginButtonText}>Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        <Modal
          visible={forgotVisible}
          transparent
          animationType="fade"
          onRequestClose={closeForgotPassword}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeForgotPassword}
                activeOpacity={0.75}
              >
                <Ionicons name="close-outline" size={24} color="#294880" />
              </TouchableOpacity>

              <View style={styles.modalIconCircle}>
                <Ionicons name="lock-closed-outline" size={28} color="#FFFFFF" />
              </View>

              {renderForgotContent()}
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8F8F8",
  },

  page: {
    flex: 1,
    backgroundColor: "#F8F8F8",
  },

  backgroundBanner: {
    position: "absolute",
    width: width * 1.2,
    height: height * 1.05,
    bottom: -height * 0.08,
    left: -width * 0.08,
    opacity: 0.14,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(248,248,248,0.72)",
  },

  scrollContainer: {
    flexGrow: 1,
  },

  container: {
    flex: 1,
    minHeight: height,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: "transparent",
  },

  centerContent: {
    justifyContent: "center",
  },

  webCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: "#D9E2F2",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },

  logoNoText: {
    width: 210,
    height: 210,
    alignSelf: "center",
    marginBottom: -8,
    marginTop: -12,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#294880",
    textAlign: "center",
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 14,
    color: "#6C7B9D",
    textAlign: "center",
    marginBottom: 24,
  },

  inputWrapper: {
    width: "100%",
    height: 52,
    borderWidth: 1.2,
    borderColor: "#8EA3CE",
    borderRadius: 10,
    backgroundColor: "#EEF2F8",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 16,
  },

  inputIcon: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    height: "100%",
    color: "#294880",
    fontSize: 14,
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

  forgotButton: {
    alignSelf: "flex-end",
    marginTop: -4,
    marginBottom: 16,
  },

  forgotText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#294880",
    textDecorationLine: "underline",
  },

  loginButton: {
    width: "100%",
    height: 52,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#007bff",
    marginTop: 4,
    marginBottom: 4,
  },

  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  webOnlyText: {
    fontSize: 15,
    color: "#5A6F9E",
    textAlign: "center",
    marginBottom: 24,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 30, 55, 0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  modalCard: {
    width: "100%",
    maxWidth: 430,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 20,
    paddingHorizontal: 26,
    paddingTop: 28,
    paddingBottom: 26,
    borderWidth: 1,
    borderColor: "#D9E2F2",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },

  modalCloseButton: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2F8",
    zIndex: 10,
  },

  modalIconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#294880",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#294880",
    textAlign: "center",
    marginBottom: 8,
  },

  modalSubtitle: {
    fontSize: 13,
    color: "#6C7B9D",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 22,
  },

  modalPrimaryButton: {
    width: "100%",
    height: 50,
    borderRadius: 10,
    backgroundColor: "#007bff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },

  modalPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  modalSecondaryButton: {
    width: "100%",
    height: 44,
    borderRadius: 10,
    backgroundColor: "#EEF2F8",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#D9E2F2",
  },

  modalSecondaryButtonText: {
    color: "#294880",
    fontSize: 14,
    fontWeight: "700",
  },
});