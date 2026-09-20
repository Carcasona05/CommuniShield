import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ThemedText from "./ThemedText";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.warn("ErrorBoundary caught:", error, info?.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconWrap}>
            <Ionicons name="alert-circle-outline" size={48} color="#D64545" />
          </View>

          <ThemedText style={styles.title}>Something went wrong</ThemedText>

          <ThemedText style={styles.subtitle}>
            An unexpected error occurred. Please try again.
          </ThemedText>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={this.handleRetry}
            activeOpacity={0.85}
          >
            <ThemedText style={styles.retryText}>Try Again</ThemedText>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FDEBEC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontFamily: "PoppinsSemiBold",
    color: "#1F2A37",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: "#294880",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
    color: "#FFFFFF",
  },
});

export default ErrorBoundary;
