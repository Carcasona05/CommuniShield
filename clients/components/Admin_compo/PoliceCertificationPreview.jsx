import React from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { CERTIFICATION_OPENING, getPoliceCertification } from "../../utils/policeCertification";

export default function PoliceCertificationPreview({ record }) {
  const certificate = getPoliceCertification(record);
  return (
    <View style={styles.page}>
      <View style={styles.header}>
        {certificate.logoUri ? (
          <View style={styles.leftLogoSlot}><Image source={{ uri: certificate.logoUri }} style={styles.leftLogo} resizeMode="contain" accessibilityLabel="Philippine National Police logo" /></View>
        ) : <View style={[styles.logo, styles.logoPlaceholder]}><Text style={styles.logoPlaceholderText}>[PNP Logo]</Text></View>}
        <View style={styles.office}>
          {certificate.officeLines.map((line, index) => <Text key={index} style={[styles.text, styles.officeText, styles.center, index === 2 && styles.bold, index === 4 && styles.station]}>{line}</Text>)}
        </View>
        {certificate.rightLogoUri ? (
          <View style={styles.rightLogoSlot}><Image source={{ uri: certificate.rightLogoUri }} style={styles.rightLogo} resizeMode="contain" accessibilityLabel="Station logo" /></View>
        ) : <View style={styles.headerBalance} />}
      </View>
      <Text style={[styles.text, styles.title]}>CERTIFICATION</Text>
      <Text style={[styles.text, styles.bold, styles.paragraph]}>TO WHOM IT MAY CONCERN:</Text>
      <Text style={[styles.text, styles.paragraph]}>{"     "}{CERTIFICATION_OPENING}</Text>
      <View style={styles.fields}>
        {certificate.fields.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={[styles.text, styles.bold, styles.label]}>{label}</Text>
            <Text style={[styles.text, styles.value]}>{value}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.text, styles.bold, styles.section]}>FACTS OF THE CASE</Text>
      {certificate.paragraphs.map((paragraph, index) => <Text key={index} style={[styles.text, styles.paragraph]}>{"     "}{paragraph}</Text>)}
      <View style={styles.disposition}>
        <Text style={styles.text}><Text style={styles.bold}>DISPOSITION: </Text>{certificate.disposition}</Text>
        <Text style={styles.text}><Text style={styles.bold}>ATTENDED BY: </Text>{certificate.attendedBy}</Text>
      </View>
      <Text style={[styles.text, styles.paragraph]}>{"     "}{certificate.purpose}</Text>
      <Text style={[styles.text, styles.paragraph]}>{"     "}{certificate.issuance}</Text>
      <View style={styles.signature}>
        <Text style={[styles.text, styles.center]}>For the Station Commander:</Text>
        <Text style={[styles.text, styles.center, styles.bold, styles.name]}>{certificate.commanderName.toUpperCase()}</Text>
        <Text style={[styles.text, styles.center]}>{certificate.commanderRank}</Text>
        <Text style={[styles.text, styles.center]}>{certificate.commanderPosition}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#FFFFFF", padding: 28, width: "100%", maxWidth: 794, alignSelf: "center" },
  text: { color: "#000000", fontFamily: Platform.OS === "android" ? "sans-serif" : "Arial", fontSize: 14, lineHeight: 20, textAlign: "justify" },
  bold: { fontWeight: "700" },
  center: { textAlign: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 0, marginHorizontal: 60, marginBottom: 24, paddingBottom: 20 },
  logo: { width: 84, height: 104 },
  leftLogoSlot: { width: 84, height: 104, alignItems: "flex-end", justifyContent: "center", transform: [{ translateX: 10 }] },
  leftLogo: { width: 160, height: 198 },
  rightLogoSlot: { width: 84, height: 104, alignItems: "flex-start", justifyContent: "center" },
  rightLogo: { width: 113, height: 140 },
  logoPlaceholder: { alignItems: "center", justifyContent: "center" },
  logoPlaceholderText: { color: "#000000", fontSize: 11, textAlign: "center" },
  headerBalance: { width: 84 },
  office: { flex: 1 },
  officeText: { fontSize: 12, lineHeight: 17 },
  station: { fontSize: 14, fontWeight: "700", textTransform: "uppercase", marginTop: 4 },
  title: { textAlign: "center", fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: 2.5, marginBottom: 24 },
  paragraph: { marginBottom: 16 },
  fields: { marginVertical: 12 },
  row: { flexDirection: "row" },
  label: { width: "42%", textAlign: "left", padding: 10, fontSize: 12 },
  value: { flex: 1, textAlign: "left", padding: 10 },
  section: { marginTop: 18, marginBottom: 12, paddingBottom: 8, letterSpacing: 0.6 },
  disposition: { marginVertical: 18, padding: 12, gap: 8 },
  signature: { width: "52%", alignSelf: "flex-end", marginTop: 24 },
  name: { marginTop: 44, paddingTop: 8 },
});
