import React from "react";
import { ScrollView, View } from "react-native";
import SAdmin_Layout from "../../components/SAdmin_Compo/SAdmin_Layout";
import SentimentDatasetManager from "../../components/Admin_compo/SentimentDatasetManager";

export default function SAdmin_SentimentDatasets() {
  return <SAdmin_Layout><ScrollView contentContainerStyle={{ paddingTop: 0, paddingBottom: 20, paddingHorizontal: 0 }}><View style={{ width: "100%", maxWidth: 1180, alignSelf: "center" }}><SentimentDatasetManager /></View></ScrollView></SAdmin_Layout>;
}
