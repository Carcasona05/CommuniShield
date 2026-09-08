import React from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COMMUNISHIELD_BLUE = "#294880";

export default function Admin_ViewSimilarReportsModal({
  visible,
  compiledGroup,
  onClose,
  onVerify,
  onReject,
  onMapAndVerify,
}) {
  if (!compiledGroup) return null;

  const getStatusStyle = (status) => {
    if (status === "Resolved") {
      return {
        color: "#22A06B",
        bg: "#EAF8F1",
        icon: "checkmark-circle-outline",
      };
    }

    if (status === "Rejected") {
      return {
        color: "#E45757",
        bg: "#FFF5F5",
        icon: "close-circle-outline",
      };
    }

    if (status === "Under Verification") {
      return {
        color: COMMUNISHIELD_BLUE,
        bg: "#EAF2FF",
        icon: "sync-outline",
      };
    }

    if (status === "Archived") {
      return {
        color: "#6B7280",
        bg: "#EEF1F5",
        icon: "archive-outline",
      };
    }

    return {
      color: "#C98A2E",
      bg: "#FFF4E5",
      icon: "time-outline",
    };
  };

  const getSeverityStyle = (severity) => {
    if (severity === "High" || severity === "Critical") {
      return {
        color: "#E45757",
        bg: "#FFF5F5",
      };
    }

    if (severity === "Medium") {
      return {
        color: "#C98A2E",
        bg: "#FFF4E5",
      };
    }

    return {
      color: "#22A06B",
      bg: "#EAF8F1",
    };
  };

  const getSentimentStyle = (sentiment) => {
    if (sentiment === "Negative") {
      return {
        color: "#E45757",
        bg: "#FFF5F5",
        icon: "alert-circle-outline",
      };
    }

    if (sentiment === "Positive") {
      return {
        color: "#22A06B",
        bg: "#EAF8F1",
        icon: "happy-outline",
      };
    }

    if (sentiment === "Mixed") {
      return {
        color: "#7C3AED",
        bg: "#F3E8FF",
        icon: "git-compare-outline",
      };
    }

    if (sentiment === "No Majority") {
      return {
        color: "#6B7280",
        bg: "#EEF1F5",
        icon: "remove-circle-outline",
      };
    }

    return {
      color: "#C98A2E",
      bg: "#FFF4E5",
      icon: "remove-circle-outline",
    };
  };

  const getImageSource = (imageValue) => {
    if (!imageValue) return null;

    if (typeof imageValue === "string") {
      return { uri: imageValue };
    }

    return imageValue;
  };

  const getCommentText = (comment) => {
    if (!comment) return "";

    if (typeof comment === "string") {
      return comment;
    }

    return (
      comment.text ||
      comment.comment ||
      comment.details ||
      comment.message ||
      comment.content ||
      ""
    );
  };

  const analyzeSingleComment = (commentText) => {
    const text = commentText.toLowerCase();

    const negativeWords = [
      "danger",
      "dangerous",
      "unsafe",
      "scared",
      "afraid",
      "panic",
      "emergency",
      "urgent",
      "accident",
      "injured",
      "hurt",
      "damage",
      "damaged",
      "blocked",
      "blocking",
      "fire",
      "flood",
      "theft",
      "stolen",
      "harassment",
      "suspicious",
      "reckless",
      "violent",
      "threat",
      "problem",
      "issue",
      "bad",
      "worse",
      "worst",
      "concern",
      "delikado",
      "hadlok",
      "kuyaw",
      "guba",
      "nasamad",
      "aksidente",
      "sunog",
      "baha",
      "kawat",
      "haras",
      "problema",
    ];

    const positiveWords = [
      "safe",
      "resolved",
      "fixed",
      "cleared",
      "helped",
      "responded",
      "thank",
      "thanks",
      "good",
      "better",
      "okay",
      "ok",
      "fine",
      "secured",
      "assisted",
      "improved",
      "solved",
      "salamat",
      "maayo",
      "ayo",
      "naayo",
      "okay na",
      "nasulbad",
      "tabang",
      "natabangan",
      "safe na",
    ];

    let negativeScore = 0;
    let positiveScore = 0;

    negativeWords.forEach((word) => {
      if (text.includes(word)) negativeScore += 1;
    });

    positiveWords.forEach((word) => {
      if (text.includes(word)) positiveScore += 1;
    });

    if (negativeScore > positiveScore) return "Negative";
    if (positiveScore > negativeScore) return "Positive";

    return "Neutral";
  };

  const getCommentSentimentAnalysis = (comments = []) => {
    if (!Array.isArray(comments) || comments.length === 0) {
      return {
        overall: "Neutral",
        majority: "No Majority",
        total: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        positivePercent: 0,
        negativePercent: 0,
        neutralPercent: 0,
      };
    }

    let positive = 0;
    let negative = 0;
    let neutral = 0;

    comments.forEach((comment) => {
      const commentText = getCommentText(comment);
      const sentiment = analyzeSingleComment(commentText);

      if (sentiment === "Positive") positive += 1;
      else if (sentiment === "Negative") negative += 1;
      else neutral += 1;
    });

    const total = comments.length;

    const positivePercent = Math.round((positive / total) * 100);
    const negativePercent = Math.round((negative / total) * 100);
    const neutralPercent = Math.max(
      0,
      100 - positivePercent - negativePercent
    );

    let overall = "Neutral";
    let majority = "Neutral";

    if (negative > positive && negative > neutral) {
      overall = "Negative";
      majority = "Negative";
    } else if (positive > negative && positive > neutral) {
      overall = "Positive";
      majority = "Positive";
    } else if (neutral > positive && neutral > negative) {
      overall = "Neutral";
      majority = "Neutral";
    } else {
      overall = "Mixed";
      majority = "Mixed";
    }

    return {
      overall,
      majority,
      total,
      positive,
      negative,
      neutral,
      positivePercent,
      negativePercent,
      neutralPercent,
    };
  };

  const groupStatusStyle = getStatusStyle(compiledGroup.status);
  const groupSeverityStyle = getSeverityStyle(compiledGroup.severity);

  const allGatheredComments =
    compiledGroup.reports?.flatMap((report) =>
      report.gatheredComments || report.comments || []
    ) || [];

  const groupSentimentAnalysis =
    getCommentSentimentAnalysis(allGatheredComments);

  const groupSentimentStyle = getSentimentStyle(
    groupSentimentAnalysis.majority
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBox}>
                <Ionicons name="copy-outline" size={24} color="#7C3AED" />
              </View>

              <View style={styles.headerTextBox}>
                <Text style={styles.modalTitle}>Similar Reports</Text>
                <Text style={styles.modalSubtitle}>
                  {compiledGroup.reportCount} similar post
                  {compiledGroup.reportCount === 1 ? "" : "s"} found for this
                  incident.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={22} color="#5D6F92" />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <View style={styles.summaryTitleBox}>
                <Text style={styles.groupTitle}>{compiledGroup.title}</Text>

                <View style={styles.groupLocationRow}>
                  <Ionicons
                    name="location-outline"
                    size={16}
                    color="#5D6F92"
                  />
                  <Text style={styles.groupLocation}>
                    {compiledGroup.location}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: groupStatusStyle.bg },
                ]}
              >
                <Ionicons
                  name={groupStatusStyle.icon}
                  size={14}
                  color={groupStatusStyle.color}
                />
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: groupStatusStyle.color },
                  ]}
                >
                  {compiledGroup.status}
                </Text>
              </View>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Category</Text>
                <Text style={styles.summaryValue}>
                  {compiledGroup.category}
                </Text>
              </View>

              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Incident Type</Text>
                <Text style={styles.summaryValue}>{compiledGroup.type}</Text>
              </View>

              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Highest AI Score</Text>
                <Text style={styles.summaryValue}>
                  {compiledGroup.highestAiScore}%
                </Text>
              </View>

              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Severity</Text>
                <View
                  style={[
                    styles.severityBadge,
                    { backgroundColor: groupSeverityStyle.bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.severityBadgeText,
                      { color: groupSeverityStyle.color },
                    ]}
                  >
                    {compiledGroup.severity}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.sentimentBox}>
              <View style={styles.sentimentTopRow}>
                <View style={styles.sentimentTitleRow}>
                  <Ionicons
                    name="analytics-outline"
                    size={16}
                    color={COMMUNISHIELD_BLUE}
                  />
                  <Text style={styles.sentimentTitle}>
                    Gathered Comments Sentiment Analysis
                  </Text>
                </View>

                <View
                  style={[
                    styles.sentimentBadge,
                    { backgroundColor: groupSentimentStyle.bg },
                  ]}
                >
                  <Ionicons
                    name={groupSentimentStyle.icon}
                    size={14}
                    color={groupSentimentStyle.color}
                  />
                  <Text
                    style={[
                      styles.sentimentBadgeText,
                      { color: groupSentimentStyle.color },
                    ]}
                  >
                    {groupSentimentAnalysis.overall}
                  </Text>
                </View>
              </View>

              <View style={styles.sentimentBarContainer}>
                <View
                  style={[
                    styles.sentimentBarSegment,
                    styles.positiveSegment,
                    {
                      flex:
                        groupSentimentAnalysis.positivePercent > 0
                          ? groupSentimentAnalysis.positivePercent
                          : 0.01,
                    },
                  ]}
                />

                <View
                  style={[
                    styles.sentimentBarSegment,
                    styles.negativeSegment,
                    {
                      flex:
                        groupSentimentAnalysis.negativePercent > 0
                          ? groupSentimentAnalysis.negativePercent
                          : 0.01,
                    },
                  ]}
                />

                <View
                  style={[
                    styles.sentimentBarSegment,
                    styles.neutralSegment,
                    {
                      flex:
                        groupSentimentAnalysis.neutralPercent > 0
                          ? groupSentimentAnalysis.neutralPercent
                          : 0.01,
                    },
                  ]}
                />
              </View>

              <View style={styles.sentimentLegendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.positiveDot]} />
                  <Text style={styles.legendText}>
                    Positive {groupSentimentAnalysis.positivePercent}%
                  </Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.negativeDot]} />
                  <Text style={styles.legendText}>
                    Negative {groupSentimentAnalysis.negativePercent}%
                  </Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.neutralDot]} />
                  <Text style={styles.legendText}>
                    Neutral {groupSentimentAnalysis.neutralPercent}%
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Reported Similar Posts</Text>
            <Text style={styles.listCount}>
              {compiledGroup.reports?.length || 0} report
              {(compiledGroup.reports?.length || 0) === 1 ? "" : "s"}
            </Text>
          </View>

          <ScrollView
            style={styles.reportList}
            contentContainerStyle={styles.reportListContent}
            showsVerticalScrollIndicator={false}
          >
            {compiledGroup.reports?.map((report) => {
              const statusStyle = getStatusStyle(report.status);
              const severityStyle = getSeverityStyle(report.severity);

              const reportImage = report.image || report.photo || (Array.isArray(report.images) && report.images.length > 0 ? report.images[0] : null);
              const imageSource = getImageSource(reportImage);

              return (
                <View key={report.id} style={styles.reportCard}>
                  <View style={styles.reportTopRow}>
                    <View style={styles.reportTitleBox}>
                      <Text style={styles.reportId}>{report.id}</Text>
                      <Text style={styles.reportTitle}>{report.title}</Text>
                    </View>

                    <View
                      style={[
                        styles.smallStatusBadge,
                        { backgroundColor: statusStyle.bg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.smallStatusText,
                          { color: statusStyle.color },
                        ]}
                      >
                        {report.status}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.reportDetails}>{report.details}</Text>

                  {imageSource ? (
                    <View style={styles.reportImageContainer}>
                      <Image
                        source={imageSource}
                        style={styles.reportImage}
                        resizeMode="cover"
                      />
                    </View>
                  ) : null}

                  <View style={styles.reportInfoGrid}>
                    <View style={styles.reportInfoItem}>
                      <Text style={styles.infoLabel}>Submitted By</Text>
                      <Text style={styles.infoValue}>{report.submittedBy}</Text>
                    </View>

                    <View style={styles.reportInfoItem}>
                      <Text style={styles.infoLabel}>Submitted At</Text>
                      <Text style={styles.infoValue}>{report.submittedAt}</Text>
                    </View>

                    <View style={styles.reportInfoItem}>
                      <Text style={styles.infoLabel}>AI Score</Text>
                      <Text style={styles.infoValue}>{report.aiScore}%</Text>
                    </View>

                    <View style={styles.reportInfoItem}>
                      <Text style={styles.infoLabel}>Severity</Text>
                      <View
                        style={[
                          styles.severityBadge,
                          { backgroundColor: severityStyle.bg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.severityBadgeText,
                            { color: severityStyle.color },
                          ]}
                        >
                          {report.severity}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.aiBox}>
                    <View style={styles.aiTitleRow}>
                      <Ionicons
                        name="sparkles-outline"
                        size={15}
                        color={COMMUNISHIELD_BLUE}
                      />
                      <Text style={styles.aiTitle}>AI Credibility Review</Text>
                    </View>

                    <Text style={styles.aiText}>
                      {report.credibilityReview ||
                        "No AI credibility review available."}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footerActions}>
            <TouchableOpacity
              style={styles.underVerificationButton}
              onPress={() => onVerify(compiledGroup)}
              activeOpacity={0.85}
            >
              <Ionicons name="sync-outline" size={17} color={COMMUNISHIELD_BLUE} />
              <Text style={styles.underVerificationText}>
                Under Verification
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resolvedButton}
              onPress={() => onMapAndVerify(compiledGroup)}
              activeOpacity={0.85}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={17}
                color="#FFFFFF"
              />
              <Text style={styles.resolvedButtonText}>Resolved</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.rejectedButton}
              onPress={() => onReject(compiledGroup)}
              activeOpacity={0.85}
            >
              <Ionicons name="close-circle-outline" size={17} color="#E45757" />
              <Text style={styles.rejectedText}>Rejected</Text>
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
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    width: "100%",
    maxWidth: 980,
    maxHeight: "92%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
  },

  modalHeader: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#E4EAF3",
    backgroundColor: "#F7F9FD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  headerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTextBox: {
    flex: 1,
  },

  modalTitle: {
    fontSize: 22,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  modalSubtitle: {
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    marginTop: 3,
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    alignItems: "center",
    justifyContent: "center",
  },

  summaryCard: {
    margin: 18,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#F7F9FD",
    borderWidth: 1,
    borderColor: "#E4EAF3",
  },

  summaryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },

  summaryTitleBox: {
    flex: 1,
  },

  groupTitle: {
    fontSize: 18,
    fontFamily: "PoppinsSemiBold",
    color: "#111827",
  },

  groupLocationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 5,
  },

  groupLocation: {
    flex: 1,
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    lineHeight: 20,
  },

  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  statusBadgeText: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
  },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  summaryItem: {
    flex: 1,
    minWidth: 180,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4EAF3",
    borderRadius: 12,
    padding: 12,
  },

  summaryLabel: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
    color: "#7A8BA8",
    marginBottom: 5,
  },

  summaryValue: {
    fontSize: 14,
    fontFamily: "PoppinsMedium",
    color: COMMUNISHIELD_BLUE,
    lineHeight: 19,
  },

  listHeader: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  listTitle: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  listCount: {
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: "#5D6F92",
  },

  reportList: {
    flex: 1,
    paddingHorizontal: 18,
  },

  reportListContent: {
    paddingBottom: 18,
  },

  reportCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4EAF3",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },

  reportTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },

  reportTitleBox: {
    flex: 1,
  },

  reportId: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
    marginBottom: 3,
  },

  reportTitle: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: "#111827",
  },

  smallStatusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  smallStatusText: {
    fontSize: 11,
    fontFamily: "PoppinsMedium",
  },

  reportDetails: {
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    lineHeight: 21,
    marginBottom: 12,
  },

  reportImageContainer: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#F7F9FD",
    borderWidth: 1,
    borderColor: "#E4EAF3",
    marginBottom: 12,
  },

  reportImage: {
    width: "100%",
    height: "100%",
  },

  reportInfoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },

  reportInfoItem: {
    flex: 1,
    minWidth: 160,
    backgroundColor: "#F7F9FD",
    borderRadius: 12,
    padding: 10,
  },

  infoLabel: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
    color: "#7A8BA8",
    marginBottom: 4,
  },

  infoValue: {
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: COMMUNISHIELD_BLUE,
  },

  severityBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  severityBadgeText: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
  },

  aiBox: {
    backgroundColor: "#F7F9FD",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E4EAF3",
  },

  aiTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 5,
  },

  aiTitle: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  aiText: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    lineHeight: 20,
  },

  sentimentBox: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
  },

  sentimentTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },

  sentimentTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },

  sentimentTitle: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  sentimentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  sentimentBadgeText: {
    fontSize: 11,
    fontFamily: "PoppinsSemiBold",
  },

  sentimentBarContainer: {
    height: 12,
    width: "100%",
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#E4EAF3",
    flexDirection: "row",
    marginBottom: 10,
  },

  sentimentBarSegment: {
    height: "100%",
  },

  positiveSegment: {
    backgroundColor: "#22A06B",
  },

  negativeSegment: {
    backgroundColor: "#E45757",
  },

  neutralSegment: {
    backgroundColor: "#C98A2E",
  },

  sentimentLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },

  positiveDot: {
    backgroundColor: "#22A06B",
  },

  negativeDot: {
    backgroundColor: "#E45757",
  },

  neutralDot: {
    backgroundColor: "#C98A2E",
  },

  legendText: {
    fontSize: 11,
    fontFamily: "PoppinsMedium",
    color: "#5D6F92",
  },

  footerActions: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: "#E4EAF3",
    backgroundColor: "#F7F9FD",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },

  underVerificationButton: {
    height: 42,
    paddingHorizontal: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  underVerificationText: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
    color: COMMUNISHIELD_BLUE,
  },

  resolvedButton: {
    height: 42,
    paddingHorizontal: 15,
    borderRadius: 12,
    backgroundColor: "#22A06B",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  resolvedButtonText: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
    color: "#FFFFFF",
  },

  rejectedButton: {
    height: 42,
    paddingHorizontal: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F2C6C6",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  rejectedText: {
    fontSize: 13,
    fontFamily: "PoppinsSemiBold",
    color: "#E45757",
  },
});