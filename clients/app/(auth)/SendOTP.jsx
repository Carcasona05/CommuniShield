import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
  Image,
  Dimensions,
} from "react-native";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import { IMAGES } from "../../constants/assets";
import ToastProvider, { useToast } from "../../components/Toast";
import apiClient from "../../services/apiClient";

const { width, height } = Dimensions.get("window");

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

export default function SendOTP() {
  return (
    <ToastProvider>
      <SendOTPInner />
    </ToastProvider>
  );
}

function SendOTPInner() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState("otp");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resetting, setResetting] = useState(false);

  const otpRefs = useRef([]);

  useEffect(() => {
    setEmail(globalThis.demoAccount.resetEmail || globalThis.demoAccount.email || "");
  }, []);

  const handleOtpChange = (value, index) => {
    const cleanValue = value.replace(/[^0-9]/g, "").slice(0, 1);
    const updated = [...otpDigits];
    updated[index] = cleanValue;
    setOtpDigits(updated);

    if (cleanValue && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const enteredOtp = otpDigits.join("");

    if (enteredOtp.length !== 6) {
      toast.error("Please enter the complete 6-digit OTP.");
      return;
    }

    setVerifying(true);
    try {
      const res = await apiClient.post("/verify-otp", {
        email: email.trim().toLowerCase(),
        otp: enteredOtp,
      });

      setResetToken(res.data?.reset_token || "");
      setStep("reset");
    } catch (error) {
      toast.error(
        error.response?.data?.error || "OTP verification failed."
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleNewPasswordChange = (text) => {
    setNewPassword(text);
    if (submitted) {
      setNewPasswordError(validateNewPassword(text));
      setConfirmPasswordError(validateConfirmPassword(text, confirmPassword));
    }
  };

  const handleConfirmPasswordChange = (text) => {
    setConfirmPassword(text);
    if (submitted) {
      setConfirmPasswordError(validateConfirmPassword(newPassword, text));
    }
  };

  const handleSavePassword = async () => {
    setSubmitted(true);

    const pwError = validateNewPassword(newPassword);
    const confirmError = validateConfirmPassword(newPassword, confirmPassword);
    setNewPasswordError(pwError);
    setConfirmPasswordError(confirmError);

    if (pwError || confirmError) return;

    setResetting(true);
    try {
      await apiClient.post("/reset-password", {
        email: email.trim().toLowerCase(),
        reset_token: resetToken,
        newPassword,
      });

      toast.success("Password changed successfully.");
      setTimeout(() => {
        router.replace("/(auth)/User_Login");
      }, 1000);
    } catch (error) {
      toast.error(
        error.response?.data?.error || "Could not reset password."
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#294880" />
        </TouchableOpacity>

        <Image
          source={IMAGES.logoText}
          style={styles.logo}
        />

        <Text style={styles.title}>
          {step === "otp" ? "Verify OTP" : "Reset Password"}
        </Text>

        <Text style={styles.subtitle}>
          {step === "otp"
            ? "Enter the 6-digit OTP sent to your email."
            : "Set your new password."}
        </Text>

        <Text style={styles.emailText}>{email}</Text>

        {step === "otp" ? (
          <>
            <View style={styles.otpContainer}>
              {otpDigits.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => (otpRefs.current[index] = ref)}
                  style={styles.otpBox}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(value, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  textAlign="center"
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, verifying && { opacity: 0.6 }]}
              onPress={handleVerifyOtp}
              activeOpacity={0.85}
              disabled={verifying}
            >
              <Text style={styles.primaryButtonText}>
                {verifying ? "Verifying..." : "Verify OTP"}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
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
                placeholder="Confirm New Password"
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
              style={[styles.primaryButton, resetting && { opacity: 0.6 }]}
              onPress={handleSavePassword}
              activeOpacity={0.85}
              disabled={resetting}
            >
              <Text style={styles.primaryButtonText}>
                {resetting ? "Saving..." : "Save New Password"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <Image
          source={IMAGES.bannerDark}
          style={styles.bottomBanner}
          resizeMode="cover"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8F8F8",
  },
  container: {
    flex: 1,
    backgroundColor: "#F8F8F8",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 30 : 12,
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  logo: {
    width: 1.3 * width,
    height: 220,
    resizeMode: "contain",
    marginTop: -10,
    marginBottom: -20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#294880",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: "#6C7B9D",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 20,
  },
  emailText: {
    fontSize: 14,
    color: "#294880",
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 28,
  },
  otpContainer: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
    marginTop: 10,
  },
  otpBox: {
    width: 46,
    height: 56,
    borderWidth: 1.4,
    borderColor: "#8EA3CE",
    borderRadius: 10,
    backgroundColor: "#EEF2F8",
    fontSize: 22,
    fontWeight: "700",
    color: "#294880",
  },
  inputWrapper: {
    width: "100%",
    height: 50,
    borderWidth: 1.2,
    borderColor: "#8EA3CE",
    borderRadius: 8,
    backgroundColor: "#EEF2F8",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
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
  primaryButton: {
    width: "100%",
    height: 50,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#007bff",
    marginTop: 6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  bottomBanner: {
    position: "absolute",
    bottom: -height * 0.12,
    left: -width * 0.06,
    width: width * 1.12,
    height: height * 0.34,
  },
});