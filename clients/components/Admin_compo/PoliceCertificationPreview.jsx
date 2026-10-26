import React from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { CERTIFICATION_OPENING, getPoliceCertification } from "../../utils/policeCertification";

export default function PoliceCertificationPreview({ record }) {
  const certificate = getPoliceCertification(record);
  return (
    <View style={styles.page}>
      <View style={styles.header}>
        {certificate.logoUri ? (
          <Image source={{ uri: certificate.logoUri }} style={styles.logo} resizeMode="contain" accessibilityLabel="Philippine National Police logo" />
        ) : <Text style={[styles.text, styles.logo]}>[PNP Logo]</Text>}
        <View style={styles.office}>
          {certificate.officeLines.map((line, index) => <Text key={index} style={[styles.text, styles.center, index === 2 && styles.bold]}>{line}</Text>)}
        </View>
      </View>
      <Text style={[styles.text, styles.title]}>CERTIFICATION</Text>
      <Text style={[styles.text, styles.bold, styles.paragraph]}>TO WHOM IT MAY CONCERN:</Text>
      <Text style={[styles.text, styles.paragraph]}>{"     "}{CERTIFICATION_OPENING}</Text>
      <View style={styles.fields}>
        {certificate.fields.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={[styles.text, styles.bold, styles.label]}>{label}</Text>
            <Text style={[styles.text, styles.value]}>: {value}</Text>
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
  page: { backgroundColor: "#FFFFFF", padding: 24, width: "100%", maxWidth: 794, alignSelf: "center" },
  text: { color: "#000000", fontFamily: Platform.OS === "android" ? "sans-serif" : "Arial", fontSize: 14, lineHeight: 20, textAlign: "justify" },
  bold: { fontWeight: "700" },
  center: { textAlign: "center" },
  header: { flexDirection: "row", gap: 16, marginBottom: 30 },
  logo: { width: 80, height: 96, textAlign: "center", textAlignVertical: "center" },
  office: { flex: 1, paddingRight: 16 },
  title: { textAlign: "center", fontSize: 19, fontWeight: "700", letterSpacing: 1.3, marginBottom: 30 },
  paragraph: { marginBottom: 16 },
  fields: { marginVertical: 12 },
  row: { flexDirection: "row", marginBottom: 6 },
  label: { width: "42%", textAlign: "left", paddingRight: 8 },
  value: { flex: 1, textAlign: "left" },
  section: { marginTop: 18, marginBottom: 12 },
  disposition: { marginVertical: 18, gap: 6 },
  signature: { width: "55%", alignSelf: "flex-end", marginTop: 24 },
  name: { marginTop: 48 },
});
