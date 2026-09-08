import React, { useState } from "react";
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
  ScrollView,
  KeyboardAvoidingView,
  useWindowDimensions,
} from "react-native";
import { MaterialIcons, FontAwesome, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../../services/apiClient";
import { IMAGES } from "../../constants/assets";

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

export default function Register() {
  const { width, height } = useWindowDimensions();

  const isSmallPhone = width < 360;
  const isShortScreen = height < 720;

  const [userName, setUserName] = useState("");
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
    setSubmitted(true);

    const pwError = validatePassword(password);
    const confirmError = validateConfirmPassword(password, confirmPassword);
    setPasswordError(pwError);
    setConfirmPasswordError(confirmError);

    if (pwError || confirmError) return;

    if (!userName.trim() || !email.trim()) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }

    try {
      const res = await apiClient.post("/register", {
        userName: userName.trim(),
        email: cleanEmail,
        password,
      });

      const token = res.data?.access_token;

      if (token) {
        try {
          await AsyncStorage.setItem("access_token", token);
        } catch (storageError) {
          console.warn("Failed to store access token:", storageError);
        }
      }

      Alert.alert("Success", "Registration successful!", [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/User_Home"),
        },
      ]);
    } catch (error) {
      const serverMessage = error.response?.data?.error;
      Alert.alert(
        "Registration Failed",
        serverMessage ||
          "Network error. Please check your connection and try again."
      );
    }
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
                height: isShortScreen ? height * 0.26 : height * 0.34,
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
                      ? 14
                      : 26
                    : isShortScreen
                      ? 8
                      : 18,
                paddingBottom: isShortScreen ? 42 : 90,
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
              <Image
                source={IMAGES.logoText}
                style={[
                  styles.logo,
                  {
                    width: isSmallPhone ? 290 : Math.min(width * 0.9, 410),
                    height: isShortScreen ? 135 : isSmallPhone ? 150 : 170,
                    marginBottom: isShortScreen ? -5 : 5,
                  },
                ]}
              />

              <Text
                style={[
                  styles.title,
                  {
                    fontSize: isSmallPhone ? 22 : 24,
                    marginBottom: isShortScreen ? 18 : 24,
                  },
                ]}
              >
                Register
              </Text>

              <View style={styles.inputWrapper}>
                <View style={styles.iconBox}>
                  <MaterialIcons name="person" size={20} color="#2F4F8F" />
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor="#6E7FA5"
                  value={userName}
                  onChangeText={setUserName}
                  autoComplete="off"
                />
              </View>

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
                  <FontAwesome name="lock" size={21} color="#2F4F8F" />
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

              <View
                style={[
                  styles.inputWrapper,
                  confirmPasswordError && styles.inputWrapperError,
                ]}
              >
                <View style={styles.iconBox}>
                  <FontAwesome name="lock" size={21} color="#2F4F8F" />
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Confirm Password"
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
                style={[
                  styles.loginButton,
                  {
                    marginBottom: isShortScreen ? 26 : 36,
                  },
                ]}
                onPress={handleRegister}
                activeOpacity={0.85}
              >
                <Text style={styles.loginButtonText}>Register</Text>
              </TouchableOpacity>

              <View style={styles.signupSection}>
                <View style={styles.lineRow}>
                  <View style={styles.line} />
                  <Text style={styles.signupQuestion}>
                    Already have an account?
                  </Text>
                  <View style={styles.line} />
                </View>

                <TouchableOpacity
                  onPress={() => router.push("/(auth)/User_Login")}
                >
                  <Text style={styles.signupLink}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
});