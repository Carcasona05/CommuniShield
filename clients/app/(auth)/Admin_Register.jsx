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
} from "react-native";
import { MaterialIcons, FontAwesome, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { saveAdminInfo } from "../../services/auth";
import { IMAGES } from "../../constants/assets";

const { width, height } = Dimensions.get("window");

if (!globalThis.adminAccount) {
  globalThis.adminAccount = {
    fullName: "ARGUS Admin",
    email: "admin@argus.com",
    password: "Admin123",
  };
}

const validatePassword = (value) => {
  if (!value) return "Password is required.";
  if (value.length < 6) return "Password must be at least 6 characters.";
  if (!/[A-Z]/.test(value))
    return "Password must contain at least one capital letter.";
  if (!/[\d\W_]/.test(value))
    return "Password must contain at least one number or symbol.";
  return "";
};

const validateConfirmPassword = (value, passwordValue) => {
  if (!value) return "Please confirm your password.";
  if (value !== passwordValue) return "Passwords do not match.";
  return "";
};

export default function Admin_Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  const handlePasswordChange = (text) => {
    setPassword(text);
    if (submitted) {
      setPasswordError(validatePassword(text));
      setConfirmPasswordError(validateConfirmPassword(text, confirmPassword));
    }
  };

  const handleConfirmPasswordChange = (text) => {
    setConfirmPassword(text);
    if (submitted) {
      setConfirmPasswordError(validateConfirmPassword(password, text));
    }
  };

  const handleRegister = async () => {
    if (Platform.OS !== "web") {
      Alert.alert("Restricted", "Admin register is available on web only.");
      return;
    }

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    setSubmitted(true);

    const pwError = validatePassword(password);
    const confirmError = validateConfirmPassword(password, confirmPassword);
    setPasswordError(pwError);
    setConfirmPasswordError(confirmError);

    if (pwError || confirmError) return;

    if (!cleanName || !cleanEmail) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }

    await saveAdminInfo({
      fullName: cleanName,
      email: cleanEmail,
      password,
    });

    Alert.alert(
      "Success",
      `Admin account created successfully!\n\nEmail: ${cleanEmail}`,
      [
        {
          text: "OK",
          onPress: () => router.replace("/(admin)/Admin_Dashboard"),
        },
      ],
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
                style={styles.logo}
                resizeMode="contain"
              />

              <Text style={styles.title}>Admin Register</Text>

              <Text style={styles.webOnlyText}>
                This page is available on web only.
              </Text>

              <TouchableOpacity
                style={styles.registerButton}
                onPress={() => router.replace("/(auth)/User_Login")}
                activeOpacity={0.85}
              >
                <Text style={styles.registerButtonText}>
                  Back to User Login
                </Text>
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
                source={IMAGES.logoText}
                style={styles.logo}
                resizeMode="contain"
              />

              <Text style={styles.title}>Admin Register</Text>

              <Text style={styles.subtitle}>
                Create an admin account for ARGUS web access
              </Text>

              <View style={styles.inputWrapper}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color="#2F4F8F"
                  style={styles.inputIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor="#6E7FA5"
                  value={fullName}
                  onChangeText={setFullName}
                  autoComplete="off"
                />
              </View>

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

              <View
                style={[
                  styles.inputWrapper,
                  confirmPasswordError && styles.inputWrapperError,
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
                  placeholder="Confirm Admin Password"
                  placeholderTextColor="#6E7FA5"
                  value={confirmPassword}
                  onChangeText={handleConfirmPasswordChange}
                  secureTextEntry={!showConfirmPassword}
                  autoComplete="new-password"
                />

                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={
                      showConfirmPassword ? "eye-off-outline" : "eye-outline"
                    }
                    size={20}
                    color="#5A6F9E"
                  />
                </TouchableOpacity>
              </View>
              {confirmPasswordError ? (
                <Text style={styles.errorText}>{confirmPasswordError}</Text>
              ) : null}

              <TouchableOpacity
                style={styles.registerButton}
                onPress={handleRegister}
                activeOpacity={0.85}
              >
                <Text style={styles.registerButtonText}>Register as Admin</Text>
              </TouchableOpacity>

              <View style={styles.bottomSection}>
                <View style={styles.lineRow}>
                  <View style={styles.line} />

                  <Text style={styles.signupQuestion}>
                    Already have an admin account?
                  </Text>

                  <View style={styles.line} />
                </View>

                <TouchableOpacity
                  onPress={() => router.replace("/(auth)/Admin_Login")}
                  activeOpacity={0.75}
                >
                  <Text style={styles.loginLink}>Back to Admin Login</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.replace("/(auth)/User_Login")}
                  style={styles.backLinkWrap}
                  activeOpacity={0.75}
                >
                  <Text style={styles.backLink}>Back to User Login</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
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

  logo: {
    width: 1.5 * width,
    height: 200,
    alignSelf: "center",
    marginBottom: 8,
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

  registerButton: {
    width: "100%",
    height: 52,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#007bff",
    marginTop: 4,
    marginBottom: 22,
  },

  registerButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  bottomSection: {
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
  },

  loginLink: {
    fontSize: 14,
    fontWeight: "700",
    color: "#294880",
    textDecorationLine: "underline",
  },

  backLinkWrap: {
    marginTop: 14,
  },

  backLink: {
    fontSize: 13,
    color: "#5A6F9E",
    textDecorationLine: "underline",
  },

  webOnlyText: {
    fontSize: 15,
    color: "#5A6F9E",
    textAlign: "center",
    marginBottom: 24,
  },
});