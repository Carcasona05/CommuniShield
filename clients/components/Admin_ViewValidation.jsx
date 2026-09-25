import React from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  primary: "#294880",
  primarySoft: "#EAF2FF",
  primaryBorder: "#D9E2F0",
  text: "#2F4267",
  textMuted: "#5D6F92",
  white: "#FFFFFF",
  background: "#F5F8FC",
  surfaceSoft: "#F7F9FD",
  success: "#22A06B",
  successSoft: "#EAF8F1",
  danger: "#E45757",
  dangerSoft: "#FFF5F5",
  warning: "#C98A2E",
  warningSoft: "#FFF4E5",
  pendingSoft: "#EEF3FB",
};


function ScoreBadge({ label }) {
  const value = (label || "").toLowerCase();

  let badgeStyle = {
    backgroundColor: COLORS.warningSoft,
    color: COLORS.warning,
  };

  if (value === "high") {
    badgeStyle = {
      backgroundColor: COLORS.successSoft,
      color: COLORS.success,
    };
  } else if (value === "low") {
    badgeStyle = {
      backgroundColor: COLORS.dangerSoft,
      color: COLORS.danger,
    };
  }

  return (
    <View style={[styles.scoreBadge, { backgroundColor: badgeStyle.backgroundColor }]}>
      <Text style={[styles.scoreBadgeText, { color: badgeStyle.color }]}>{label}</Text>
    </View>
  );
}

function InfoCard({ label, value, fullWidth = false }) {
  return (
    <View style={[styles.infoCard, fullWidth && styles.infoCardFull]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function CommentCard({ item, index }) {
  return (
    <View style={styles.commentCard}>
      <View style={styles.commentHeader}>
        <View style={styles.commentAvatar}>
          <Ionicons name="person-outline" size={16} color={COLORS.primary} />
        </View>

        <View style={styles.commentHeaderText}>
          <Text style={styles.commentAuthor}>{item.author || `Comment ${index + 1}`}</Text>
          <Text style={styles.commentTime}>{item.timestamp || "No timestamp"}</Text>
        </View>
      </View>

      <Text style={styles.commentText}>{item.text}</Text>
    </View>
  );
}

export default function Admin_ViewValidation({
  visible,
  report,
  onClose,
  onVerify,
  onReject,
}) {
  if (!report) return null;

  const comments = report.comments || [];
  const reportImage = report.image;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable onPress={onClose} style={styles.backdrop} />

        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Validation Report Details</Text>
              <Text style={styles.headerSubtitle}>
                Review the complete incident submission before verification and mapping.
              </Text>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={COLORS.white} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Incident Overview</Text>

              <View style={styles.infoGrid}>
                <InfoCard label="Incident ID" value={report.id} />
                <InfoCard label="Category" value={report.category} />
                <InfoCard label="Type" value={report.type} />
                <InfoCard label="Timestamp" value={report.timestamp} />
                <InfoCard label="Status" value={report.status} />
                <InfoCard
                  label="Coordinates"
                  value={report.coordinates || "No coordinates available"}
                />
                <InfoCard label="Location" value={report.location} fullWidth />
              </View>
            </View>

            <View style={styles.dualRow}>
              <View style={styles.halfCard}>
                <Text style={styles.sectionTitle}>AI Sentiment Review</Text>
                <Text style={styles.sentimentValue}>
                  {report.sentiment ?? "Unavailable"}
                </Text>
                <Text style={styles.supportingText}>
                  The system analyzed the tone and urgency of the submitted report to help
                  the admin prioritize validation.
                </Text>
              </View>

              <View style={styles.halfCard}>
                <Text style={styles.sectionTitle}>AI Credibility Review</Text>
                <ScoreBadge label={report.credibility || "Medium"} />
                <Text style={[styles.supportingText, styles.aiReviewText]}>
                  {report.aiReview || "No AI review available."}
                </Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Attached Report Image</Text>

              {reportImage ? (
                <Image
                  source={
                    typeof reportImage === "string"
                      ? { uri: reportImage }
                      : reportImage
                  }
                  style={styles.reportImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.emptyStateBox}>
                  <Ionicons name="image-outline" size={28} color={COLORS.textMuted} />
                  <Text style={styles.emptyStateText}>No image attached to this report.</Text>
                </View>
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Comments</Text>

              {comments.length > 0 ? (
                <View style={styles.commentsList}>
                  {comments.map((item, index) => (
                    <CommentCard key={index} item={item} index={index} />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyStateBox}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={28}
                    color={COLORS.textMuted}
                  />
                  <Text style={styles.emptyStateText}>No comments available for this report.</Text>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} style={styles.closeFooterButton}>
              <Text style={styles.closeFooterButtonText}>Close</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => onReject?.(report)} style={styles.rejectButton}>
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => onVerify?.(report)} style={styles.verifyButton}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
              <Text style={styles.verifyButtonText}>Verify & Map Incident</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(18, 31, 52, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    width: "96%",
    maxWidth: 1180,
    maxHeight: "92%",
    backgroundColor: COLORS.white,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    elevation: 12,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: "#D6E3FF",
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
  },
  contentScroll: {
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    padding: 24,
    gap: 18,
  },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    padding: 20,
  },
  sectionTitle: {
    color: COLORS.primary,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 16,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  infoCard: {
    width: "48%",
    minWidth: 260,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E4EAF3",
  },
  infoCardFull: {
    width: "100%",
  },
  infoLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  infoValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
  },
  dualRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
  },
  halfCard: {
    flex: 1,
    minWidth: 320,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    padding: 20,
  },
  sentimentValue: {
    color: COLORS.warning,
    fontSize: 24,
    fontWeight: "800",
  },
  supportingText: {
    color: COLORS.textMuted,
    marginTop: 10,
    lineHeight: 22,
    fontSize: 14,
  },
  aiReviewText: {
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  scoreBadge: {
    minWidth: 96,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  scoreBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  reportImage: {
    width: "100%",
    height: 360,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSoft,
  },
  emptyStateBox: {
    height: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    backgroundColor: COLORS.surfaceSoft,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  emptyStateText: {
    marginTop: 10,
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
  commentsList: {
    gap: 12,
  },
  commentCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4EAF3",
    padding: 14,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  commentHeaderText: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  commentTime: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.text,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.primaryBorder,
    backgroundColor: COLORS.white,
  },
  closeFooterButton: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  closeFooterButtonText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 14,
  },
  rejectButton: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F2A0A0",
    backgroundColor: COLORS.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectButtonText: {
    color: COLORS.danger,
    fontWeight: "700",
    fontSize: 14,
  },
  verifyButton: {
    height: 54,
    paddingHorizontal: 26,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#294880",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  verifyButtonText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 15,
  },
});