import React, { useState } from "react";
import { View, ScrollView, Platform, useWindowDimensions } from "react-native";
import { useFonts } from "expo-font";
import Admin_Layout from "../../components/Admin_compo/Admin_Layout";
import SentimentDatasetManager from "../../components/Admin_compo/SentimentDatasetManager";
import SentimentDistributionCard from "../../components/Admin_compo/SentimentDistributionCard";
import SentimentOverviewCard from "../../components/Admin_compo/SentimentOverviewCard";

const TRAINING_SCROLLBAR_CSS = `
  #sentiment-training-scroll {
    scrollbar-gutter: stable;
    overscroll-behavior-y: contain;
  }
  #sentiment-training-scroll::-webkit-scrollbar {
    width: 10px;
  }
  #sentiment-training-scroll::-webkit-scrollbar-track {
    background: #F3F6FB;
    border-radius: 999px;
    margin-block: 10px;
  }
  #sentiment-training-scroll::-webkit-scrollbar-thumb {
    background: #9AAED0;
    border: 3px solid #F3F6FB;
    border-radius: 999px;
    min-height: 40px;
  }
  #sentiment-training-scroll::-webkit-scrollbar-thumb:hover {
    background: #294880;
  }
  #sentiment-training-scroll::-webkit-scrollbar-thumb:active {
    background: #203A69;
  }
  @supports not selector(::-webkit-scrollbar) {
    #sentiment-training-scroll {
      scrollbar-width: thin;
      scrollbar-color: #9AAED0 #F3F6FB;
    }
  }
`;

export default function Admin_Analytics() {
  const { width } = useWindowDimensions();
  const [overviewHeight, setOverviewHeight] = useState(500);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }


  return (
    <Admin_Layout>
      {Platform.OS === "web" ? <style>{TRAINING_SCROLLBAR_CSS}</style> : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrap}>
          {/* TWO-COLUMN LAYOUT (70% LEFT, 30% RIGHT) */}
          <View style={[styles.middleRow, width < 1100 && { flexDirection: "column" }]}>
            {/* LEFT SECTION (70%) */}
            <View style={[styles.leftAnalyticsSection, width < 1100 ? styles.stackedSection : { flex: 7 }]}>
              <View
                testID="sentiment-overview-panel"
                style={styles.emphasizedSentimentCard}
                onLayout={(event) => setOverviewHeight(event.nativeEvent.layout.height)}
              >
                <SentimentOverviewCard />
                <View style={[styles.chartContent, { paddingTop: 0 }]}>
                  <SentimentDistributionCard />
                </View>
              </View>
            </View>

            {/* RIGHT SECTION: SENTIMENT DATA MANAGER (30%) */}
            <View testID="sentiment-training-panel" style={[styles.rightEmptySection, styles.trainingPanel, { height: overviewHeight }, width < 1100 ? styles.stackedSection : { flex: 3 }]}>
              <ScrollView
                nativeID="sentiment-training-scroll"
                testID="sentiment-training-scroll"
                style={styles.trainingScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                <SentimentDatasetManager embedded />
              </ScrollView>
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
    flexGrow: 1,
    flexShrink: 0,
  },
  middleRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  leftAnalyticsSection: {
    minWidth: 0,
  },
  rightEmptySection: {
    minWidth: 0,
  },
  stackedSection: { width: "100%", flexGrow: 0, flexShrink: 0 },
  trainingPanel: {
    minHeight: 0,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 12,
    overflow: "hidden",
  },
  trainingScroll: { flex: 1, minHeight: 0 },
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
