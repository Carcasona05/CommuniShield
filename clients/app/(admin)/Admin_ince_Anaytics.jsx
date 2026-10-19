import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Line, Polyline, Circle } from "react-native-svg";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import { AnalyticsSkeleton } from "../../components/PageSkeletons";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache } from "../../services/dataStore";

const SentimentChart = ({ data = [] }) => {
  const W = 320;
  const H = 120;
  const max = 100;
  const step = data.length > 1 ? W / (data.length - 1) : W;

  const clamp = (v) => Math.min(max, Math.max(0, Number(v) || 0));

  const points = data
    .map((d, i) => `${(i * step).toFixed(1)},${(H - (clamp(d.value) / max) * H).toFixed(1)}`)
    .join(" ");

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {[0, 30, 60, 90].map((y) => (
        <Line key={y} x1={0} y1={y} x2={W} y2={y} stroke="#DCE5F1" strokeWidth={1} />
      ))}

      {points ? (
        <Polyline
          points={points}
          fill="none"
          stroke="#2F8DE4"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}

      {data.map((d, i) => (
        <Circle
          key={i}
          cx={i * step}
          cy={H - (clamp(d.value) / max) * H}
          r={2.5}
          fill="#2F8DE4"
        />
      ))}
    </Svg>
  );
};

const distColor = (label) => {
  switch (label) {
    case "positive":
      return "#3DBB74";
    case "neutral":
      return "#4F8EF7";
    case "negative":
      return "#E45757";
    case "mixed":
      return "#F29A2E";
    case "unclear":
      return "#9AA8C2";
    default:
      return "#9AA8C2";
  }
};

export default function Admin_Analytics() {
  const [loading, setLoading] = useState(() => getCache("api:/admin/analytics") === undefined);

  const [summary, setSummary] = useState(() => {
    const cached = getCache("api:/admin/analytics");
    return cached?.summary || {
      activeIncidents: 0,
      criticalHotspots: 0,
      avgSentiment: "4.2",
      sentimentLabel: "Mostly Positive",
      sentimentAnalyzed: 142,
      sentimentTotal: 150,
      sentimentDistribution: [
        { label: "positive", count: 90 },
        { label: "neutral", count: 45 },
        { label: "negative", count: 15 },
      ],
    };
  });
  const [sentimentTrend, setSentimentTrend] = useState(() => {
    const cached = getCache("api:/admin/analytics");
    return cached?.sentimentTrend || [];
  });

  // --- RIGHT SIDE DATASETS & PAGINATION ---
  const [datasets, setDatasets] = useState([
    { id: "6", label: "positive", note: "Road maintenance feedback positive." },
    { id: "5", label: "neutral", note: "Inquiry regarding public transport schedule." },
    { id: "4", label: "negative", note: "Power outage reported near east district." },
    { id: "3", label: "positive", note: "Water supply restoration confirmed." },
    { id: "2", label: "negative", note: "Delay reported in southern sector." },
    { id: "1", label: "positive", note: "Community outreach feedback was great." },
  ]);

  const [inputWord, setInputWord] = useState("");
  const [inputLabel, setInputLabel] = useState("positive");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Pagination (Strictly 4 per page)
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 4;

  const totalPages = Math.ceil(datasets.length / ITEMS_PER_PAGE) || 1;
  const paginatedDatasets = datasets.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSaveDataset = () => {
    if (!inputWord.trim()) return;

    if (editingId) {
      setDatasets(
        datasets.map((d) =>
          d.id === editingId ? { ...d, label: inputLabel, note: inputWord.trim() } : d
        )
      );
      setEditingId(null);
    } else {
      const newEntry = {
        id: Date.now().toString(),
        label: inputLabel,
        note: inputWord.trim(),
      };
      setDatasets([newEntry, ...datasets]);
      setCurrentPage(1);
    }
    setInputWord("");
    setDropdownOpen(false);
  };

  const handleEditDataset = (item) => {
    setEditingId(item.id);
    setInputLabel(item.label);
    setInputWord(item.note);
  };

  const handleDeleteDataset = (id) => {
    const updated = datasets.filter((d) => d.id !== id);
    setDatasets(updated);

    const newTotalPages = Math.ceil(updated.length / ITEMS_PER_PAGE) || 1;
    if (currentPage > newTotalPages) {
      setCurrentPage(newTotalPages);
    }

    if (editingId === id) {
      setEditingId(null);
      setInputWord("");
    }
  };

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const loadAnalytics = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };

      const cachedAnalytics = getCache("api:/admin/analytics");
      if (cachedAnalytics) {
        if (cachedAnalytics.summary) {
          setSummary((prev) => ({ ...prev, ...cachedAnalytics.summary }));
        }
        if (Array.isArray(cachedAnalytics.sentimentTrend)) {
          setSentimentTrend(cachedAnalytics.sentimentTrend);
        }
      }

      const res = await apiClient.get("/admin/analytics", { headers });
      setCache("api:/admin/analytics", res.data ?? {});

      const data = res.data ?? {};

      if (data.summary) {
        setSummary((prev) => ({ ...prev, ...data.summary }));
      }
      if (Array.isArray(data.sentimentTrend)) {
        setSentimentTrend(data.sentimentTrend);
      }
    } catch {
      // keep last loaded data on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(loadAnalytics, 60000);

  if (!fontsLoaded) {
    return null;
  }

  if (loading) {
    return (
      <Admin_Layout>
        <AnalyticsSkeleton />
      </Admin_Layout>
    );
  }

  // Calculate total sum of breakdown items
  const distributionList = Array.isArray(summary.sentimentDistribution)
    ? summary.sentimentDistribution
    : [];
  const totalBreakdownCount = distributionList.reduce(
    (acc, item) => acc + (Number(item?.count) || 0),
    0
  );

  return (
    <Admin_Layout>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrap}>
          {/* TWO-COLUMN LAYOUT (70% LEFT, 30% RIGHT) */}
          <View style={styles.middleRow}>
            {/* LEFT SECTION (70%) */}
            <View style={styles.leftAnalyticsSection}>
              <View style={styles.emphasizedSentimentCard}>
                <View style={styles.emphasizedHeader}>
                  <View style={styles.emphasizedHeaderTitleRow}>
                    <Ionicons name="pulse" size={18} color="#294880" />
                    <Text style={styles.emphasizedTitle}>Sentiment Analysis Overview</Text>
                  </View>
                  <Text style={styles.sentimentCoverage}>
                    {summary.sentimentAnalyzed ?? 0}/{summary.sentimentTotal ?? 0} Analyzed
                  </Text>
                </View>

                <View style={styles.chartContent}>
                  {/* SUMMARY METRICS MINI-BANNER */}
                  <View style={styles.metricsBanner}>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>Total Comments</Text>
                      <Text style={styles.metricValue}>{summary.sentimentTotal ?? 0}</Text>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>AI Analyzed</Text>
                      <Text style={[styles.metricValue, { color: "#3DBB74" }]}>
                        {summary.sentimentAnalyzed ?? 0}
                      </Text>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>Pending AI</Text>
                      <Text style={[styles.metricValue, { color: "#E5A12F" }]}>
                        {(summary.sentimentTotal || 0) - (summary.sentimentAnalyzed || 0)}
                      </Text>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>Avg. Health</Text>
                      <Text style={[styles.metricValue, { color: "#2F8DE4" }]}>
                        {summary.avgSentiment || "—"} / 5.0
                      </Text>
                    </View>
                  </View>

                  {/* 24HR TREND CHART */}
                  <Text style={[styles.chartSubhead, { marginBottom: 20 }]}>24hr Trend</Text>
                  <View style={styles.lineChartBox}>
                    <View style={styles.yAxisLabels}>
                      <Text style={styles.axisText}>100</Text>
                      <Text style={styles.axisText}>75</Text>
                      <Text style={styles.axisText}>50</Text>
                      <Text style={styles.axisText}>25</Text>
                      <Text style={styles.axisText}>0</Text>
                    </View>

                    <View style={styles.svgWrap}>
                      <SentimentChart data={sentimentTrend} />
                    </View>

                    <View style={styles.rightLabels}>
                      <Text style={styles.anxiousLabel}>Anxious</Text>
                      <Text style={styles.neutralLabel}>Neutral</Text>
                      <Text style={styles.calmLabel}>Calm</Text>
                    </View>
                  </View>

                  <View style={styles.xAxisRow}>
                    <Text style={styles.axisText}>00:00</Text>
                    <Text style={styles.axisText}>06:00</Text>
                    <Text style={styles.axisText}>12:00</Text>
                    <Text style={styles.axisText}>18:00</Text>
                    <Text style={styles.axisText}>23:00</Text>
                  </View>

                  {/* DISTRIBUTION BREAKDOWN */}
                  <Text style={[styles.chartSubhead, { marginTop: 16 }]}>
                    Distribution Breakdown
                  </Text>
                  <View style={styles.distList}>
                    {distributionList.map((item) => {
                      const count = Number(item?.count) || 0;
                      const divisor = totalBreakdownCount || 1;
                      const pct = Math.round((count / divisor) * 100);
                      const isNone = item?.label === "none";
                      return (
                        <View key={String(item?.label)} style={styles.distRow}>
                          <Text style={styles.distLabel}>
                            {isNone ? "No data" : String(item?.label)}
                          </Text>
                          <View style={styles.distBarTrack}>
                            <View
                              style={[
                                styles.distBarFill,
                                {
                                  width: `${pct}%`,
                                  backgroundColor: isNone
                                    ? "#9AA8C2"
                                    : distColor(String(item?.label)),
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.distCount}>
                            {count} ({pct}%)
                          </Text>
                        </View>
                      );
                    })}

                    {/* CUMULATIVE TOTAL ROW WITH COMBINED COLOR BAR */}
                    <View style={styles.distRow}>
                      <Text style={[styles.distLabel, { fontFamily: "PoppinsSemiBold", color: "#294880" }]}>
                        Total
                      </Text>
                      <View style={styles.distBarTrack}>
                        <View style={[styles.distBarFill, { flexDirection: "row", width: "100%", overflow: "hidden" }]}>
                          {distributionList.map((item) => {
                            const count = Number(item?.count) || 0;
                            const divisor = totalBreakdownCount || 1;
                            const pct = (count / divisor) * 100;
                            if (pct <= 0) return null;
                            return (
                              <View
                                key={item.label}
                                style={{
                                  height: "100%",
                                  width: `${pct}%`,
                                  backgroundColor: distColor(item.label),
                                }}
                              />
                            );
                          })}
                        </View>
                      </View>
                      <Text style={[styles.distCount, { fontFamily: "PoppinsSemiBold", color: "#294880" }]}>
                        {totalBreakdownCount} (100%)
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* RIGHT SECTION: SENTIMENT DATA MANAGER (30%) */}
            <View style={styles.rightEmptySection}>
              <View style={styles.emptyBoxCard}>
                <View style={styles.emphasizedHeader}>
                  <View style={styles.emphasizedHeaderTitleRow}>
                    <Ionicons name="create-outline" size={18} color="#294880" />
                    <Text style={styles.emphasizedTitle}>
                      {editingId ? "Edit Sentiment Data" : "Add Sentiment Data"}
                    </Text>
                  </View>
                </View>

                <View style={{ padding: 14 }}>
                  {/* ADD WORD INPUT */}
                  <Text style={styles.inputLabel}>Add Word / Phrase</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Type a word or sentence..."
                    placeholderTextColor="#9AA8C2"
                    value={inputWord}
                    onChangeText={setInputWord}
                  />

                  {/* CATEGORY HOVERDOWN DROPDOWN */}
                  <Text style={styles.inputLabel}>Category</Text>
                  <TouchableOpacity
                    style={styles.dropdownHeader}
                    onPress={() => setDropdownOpen(!dropdownOpen)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={[styles.miniDot, { backgroundColor: distColor(inputLabel) }]} />
                      <Text style={styles.dropdownHeaderText}>{inputLabel.toUpperCase()}</Text>
                    </View>
                    <Ionicons
                      name={dropdownOpen ? "chevron-up" : "chevron-down"}
                      size={16}
                      color="#4B5D7A"
                    />
                  </TouchableOpacity>

                  {dropdownOpen && (
                    <View style={styles.dropdownList}>
                      {["positive", "neutral", "negative"].map((lbl) => (
                        <TouchableOpacity
                          key={lbl}
                          style={[
                            styles.dropdownItem,
                            inputLabel === lbl && { backgroundColor: "#EAF2FF" },
                          ]}
                          onPress={() => {
                            setInputLabel(lbl);
                            setDropdownOpen(false);
                          }}
                        >
                          <View style={[styles.miniDot, { backgroundColor: distColor(lbl) }]} />
                          <Text
                            style={[
                              styles.dropdownItemText,
                              inputLabel === lbl && { color: "#2F8DE4", fontFamily: "PoppinsSemiBold" },
                            ]}
                          >
                            {lbl.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* SAVE DATASET BUTTON */}
                  <TouchableOpacity style={styles.submitBtn} onPress={handleSaveDataset}>
                    <Text style={styles.submitBtnText}>
                      {editingId ? "Update Dataset" : "Save Dataset"}
                    </Text>
                  </TouchableOpacity>

                  <View style={{ height: 1, backgroundColor: "#D9E2F0", marginVertical: 14 }} />

                  {/* RECENT DATASET HEADER WITH UPPER RIGHT PAGINATION */}
                  <View style={styles.recentHeaderRow}>
                    <Text style={styles.chartSubhead}>Recent Dataset</Text>

                    <View style={styles.paginationBox}>
                      <TouchableOpacity
                        disabled={currentPage === 1}
                        onPress={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        style={{ opacity: currentPage === 1 ? 0.3 : 1 }}
                      >
                        <Ionicons name="chevron-back" size={14} color="#294880" />
                      </TouchableOpacity>

                      <Text style={styles.paginationText}>
                        {currentPage} ... {totalPages}
                      </Text>

                      <TouchableOpacity
                        disabled={currentPage === totalPages}
                        onPress={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        style={{ opacity: currentPage === totalPages ? 0.3 : 1 }}
                      >
                        <Ionicons name="chevron-forward" size={14} color="#294880" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* RECENT DATASETS LIST (STRICTLY MAX 4 PER PAGE) */}
                  {paginatedDatasets.length === 0 ? (
                    <Text style={{ fontSize: 12, color: "#9AA8C2", fontStyle: "italic", marginTop: 6 }}>
                      No datasets added yet.
                    </Text>
                  ) : (
                    paginatedDatasets.map((item) => (
                      <View key={item.id} style={styles.datasetRow}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <View style={[styles.miniDot, { backgroundColor: distColor(item.label) }]} />
                            <Text style={styles.datasetLabelText}>{item.label.toUpperCase()}</Text>
                            <Text style={styles.aiTag}>AI Calculated</Text>
                          </View>
                          <Text style={styles.datasetNoteText} numberOfLines={2}>
                            {item.note}
                          </Text>
                        </View>

                        <View style={{ flexDirection: "row", gap: 8, marginLeft: 8 }}>
                          <TouchableOpacity onPress={() => handleEditDataset(item)}>
                            <Ionicons name="pencil-outline" size={16} color="#4F8EF7" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteDataset(item.id)}>
                            <Ionicons name="trash-outline" size={16} color="#E45757" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </Admin_Layout>
  );
}

const styles = {
  scrollContent: {
    paddingBottom: 24,
  },
  contentWrap: {
    flex: 1,
  },
  middleRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  leftAnalyticsSection: {
    flex: 7,
    minWidth: 0,
  },
  rightEmptySection: {
    flex: 3,
    minWidth: 0,
  },
  emptyBoxCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    overflow: "hidden",
    minHeight: 500,
    shadowColor: "#0F1E3D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emphasizedSentimentCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    overflow: "hidden",
    minHeight: 500,
    shadowColor: "#0F1E3D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emphasizedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#F7F9FD",
    borderBottomWidth: 1,
    borderBottomColor: "#D9E2F0",
  },
  emphasizedHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emphasizedTitle: {
    fontSize: 15,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },
  chartContent: {
    padding: 16,
  },
  metricsBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F7FC",
    borderWidth: 1,
    borderColor: "#E1E8F2",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  metricBox: {
    flex: 1,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: "PoppinsMedium",
    color: "#5D6F92",
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#2E3F63",
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#D9E2F0",
  },
  chartSubhead: {
    fontSize: 13,
    color: "#4F70A5",
    fontFamily: "PoppinsSemiBold",
  },
  sentimentCoverage: {
    fontSize: 12,
    color: "#5D6F92",
    fontFamily: "PoppinsMedium",
  },
  distList: {
    gap: 8,
    marginTop: 8,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  distLabel: {
    width: 72,
    fontSize: 11,
    color: "#435A84",
    fontFamily: "PoppinsMedium",
    textTransform: "capitalize",
  },
  distBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E8EEF8",
    overflow: "hidden",
  },
  distBarFill: {
    height: 10,
    borderRadius: 5,
  },
  distCount: {
    width: 75,
    fontSize: 11,
    color: "#5D6F92",
    fontFamily: "PoppinsMedium",
    textAlign: "right",
  },
  lineChartBox: {
    height: 120,
    position: "relative",
  },
  svgWrap: {
    marginLeft: 30,
    marginRight: 70,
  },
  yAxisLabels: {
    position: "absolute",
    left: 0,
    top: -8,
    height: 128,
    justifyContent: "space-between",
  },
  axisText: {
    fontSize: 11,
    color: "#6A7C9B",
    fontFamily: "PoppinsMedium",
  },
  rightLabels: {
    position: "absolute",
    right: -2,
    top: 8,
    height: 104,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  anxiousLabel: {
    fontSize: 12,
    color: "#F04E45",
    fontFamily: "PoppinsSemiBold",
  },
  neutralLabel: {
    fontSize: 12,
    color: "#C9731D",
    fontFamily: "PoppinsSemiBold",
  },
  calmLabel: {
    fontSize: 12,
    color: "#2F7DE1",
    fontFamily: "PoppinsSemiBold",
  },
  xAxisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 12,
    marginLeft: 28,
    marginRight: 64,
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: "PoppinsMedium",
    color: "#4B5D7A",
    marginBottom: 6,
    marginTop: 8,
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FAFBFC",
  },
  dropdownHeaderText: {
    fontSize: 11,
    fontFamily: "PoppinsSemiBold",
    color: "#2E3F63",
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F4F9",
  },
  dropdownItemText: {
    fontSize: 11,
    fontFamily: "PoppinsMedium",
    color: "#4B5D7A",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: "#2E3F63",
    fontFamily: "PoppinsRegular",
    backgroundColor: "#FAFBFC",
    marginBottom: 10,
  },
  submitBtn: {
    backgroundColor: "#2F8DE4",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    marginTop: 12,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "PoppinsSemiBold",
  },
  recentHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  paginationBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0F4F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  paginationText: {
    fontSize: 11,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
  },
  datasetRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F9FD",
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E5ECF6",
  },
  miniDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  datasetLabelText: {
    fontSize: 11,
    fontFamily: "PoppinsSemiBold",
    color: "#2E3F63",
  },
  aiTag: {
    fontSize: 9,
    fontFamily: "PoppinsRegular",
    color: "#2F8DE4",
    backgroundColor: "#EAF2FF",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  datasetNoteText: {
    fontSize: 11,
    fontFamily: "PoppinsRegular",
    color: "#6A7C9B",
    marginTop: 2,
  },
};