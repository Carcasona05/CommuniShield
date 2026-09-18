import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";

export default function TermsAndConditions() {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);

  const handleScroll = (event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const offsetY = contentOffset.y;
    const contentHeight = contentSize.height;
    const viewHeight = layoutMeasurement.height;

    if (offsetY + viewHeight >= contentHeight - 50) {
      setHasScrolledToBottom(true);
    }
  };

  const TERMS_VERSION = "1.0";

  const handleAccept = () => {
    if (hasScrolledToBottom) {
      setIsAccepted(true);
      router.back({ params: { termsAccepted: 'true', termsVersion: TERMS_VERSION } });
    }
  };

  const handleDecline = () => {
    setIsAccepted(false);
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={28} color="#294880" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Terms & Conditions</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Introduction</Text>
            <Text style={styles.bodyText}>
              Welcome to ARGUS (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;). These Terms and Conditions (&ldquo;Terms&rdquo;) constitute a legally binding agreement between you (&ldquo;User,&rdquo; &ldquo;you,&rdquo; or &ldquo;your&rdquo;) and ARGUS governing your access to and use of our mobile application and related services (collectively, the &ldquo;Service&rdquo;).
            </Text>
            <Text style={styles.bodyText}>
              By registering for an account and using the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms, including the Non-Disclosure Agreement (&ldquo;NDA&rdquo;) and Data Privacy Act (&ldquo;DPA&rdquo;) Compliance provisions set forth below. If you do not agree to these Terms, you must not register for or use the Service.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Non-Disclosure Agreement (NDA)</Text>
            
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>2.1 Definition of Confidential Information</Text>
              <Text style={styles.bodyText}>
                &ldquo;Confidential Information&rdquo; means any and all non-public information, data, or knowledge, whether oral, written, electronic, or in any other form, disclosed by either party to the other, directly or indirectly, including but not limited to: trade secrets, business plans, financial data, technical data, algorithms, source code, user data, proprietary methodologies, customer lists, pricing structures, and any information marked as confidential or that a reasonable person would understand to be confidential given the nature of the information and the circumstances of disclosure.
              </Text>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>2.2 Obligations of the User</Text>
              <Text style={styles.bodyText}>
                As a User of the Service, you agree to:
              </Text>
              <Text style={styles.bulletPoint}>• Hold all Confidential Information in strict confidence and not disclose it to any third party without prior written consent;</Text>
              <Text style={styles.bulletPoint}>• Use Confidential Information solely for the purpose of accessing and using the Service as intended;</Text>
              <Text style={styles.bulletPoint}>• Implement reasonable security measures to protect Confidential Information from unauthorized access, use, or disclosure;</Text>
              <Text style={styles.bulletPoint}>• Not reverse engineer, decompile, disassemble, or attempt to derive the source code of any software comprising the Service;</Text>
              <Text style={styles.bulletPoint}>• Promptly notify ARGUS of any unauthorized use or disclosure of Confidential Information of which you become aware.</Text>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>2.3 Exclusions</Text>
              <Text style={styles.bodyText}>
                The obligations under this NDA shall not apply to information that: (a) is or becomes publicly available through no fault of the User; (b) was lawfully known to the User prior to disclosure; (c) is independently developed by the User without reference to Confidential Information; (d) is rightfully received from a third party without restriction on disclosure; or (e) is required to be disclosed by law or court order, provided the User gives prompt written notice to ARGUS.
              </Text>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>2.4 Term and Survival</Text>
              <Text style={styles.bodyText}>
                This NDA shall remain in effect for a period of five (5) years from the date of your acceptance of these Terms, or such longer period as may be required by applicable law. The obligations of confidentiality shall survive termination of your account and these Terms.
              </Text>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>2.5 Remedies</Text>
              <Text style={styles.bodyText}>
                You acknowledge that any breach of this NDA may cause irreparable harm to ARGUS for which monetary damages may be inadequate. ARGUS shall be entitled to seek injunctive relief, specific performance, and any other equitable remedies available at law or in equity, in addition to all other rights and remedies.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Data Privacy Act (DPA) Compliance</Text>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>3.1 Commitment to Data Protection</Text>
              <Text style={styles.bodyText}>
                ARGUS is committed to protecting your personal information in compliance with the Data Privacy Act of 2012 (Republic Act No. 10173) of the Philippines, its Implementing Rules and Regulations, and all other applicable data privacy laws and regulations (collectively, &ldquo;Data Privacy Laws&rdquo;).
              </Text>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>3.2 Personal Information Collected</Text>
              <Text style={styles.bodyText}>
                In connection with your registration and use of the Service, we may collect the following personal information:
              </Text>
              <Text style={styles.bulletPoint}>• Account credentials: username, email address, password (securely hashed);</Text>
              <Text style={styles.bulletPoint}>• Profile information: name, contact details, role, organization affiliation;</Text>
              <Text style={styles.bulletPoint}>• Usage data: access logs, activity timestamps, feature interactions, device information;</Text>
              <Text style={styles.bulletPoint}>• Location data: when you use location-based features of the Service;</Text>
              <Text style={styles.bulletPoint}>• Communications: messages, support requests, and correspondence with our team.</Text>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>3.3 Purpose of Processing</Text>
              <Text style={styles.bodyText}>
                We process your personal information for the following lawful purposes:
              </Text>
              <Text style={styles.bulletPoint}>• Providing, maintaining, and improving the Service;</Text>
              <Text style={styles.bulletPoint}>• Authenticating and authorizing your access to the Service;</Text>
              <Text style={styles.bulletPoint}>• Communicating with you regarding your account, updates, and support;</Text>
              <Text style={styles.bulletPoint}>• Ensuring security, fraud prevention, and compliance with legal obligations;</Text>
              <Text style={styles.bulletPoint}>• Analytics and performance monitoring to enhance user experience;</Text>
              <Text style={styles.bulletPoint}>• Fulfilling contractual obligations and enforcing these Terms.</Text>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>3.4 Data Subject Rights</Text>
              <Text style={styles.bodyText}>
                Under the Data Privacy Act, you have the following rights regarding your personal information:
              </Text>
              <Text style={styles.bulletPoint}>• Right to be informed about the collection and processing of your data;</Text>
              <Text style={styles.bulletPoint}>• Right to access your personal information and obtain a copy thereof;</Text>
              <Text style={styles.bulletPoint}>• Right to rectify inaccurate or incomplete personal information;</Text>
              <Text style={styles.bulletPoint}>• Right to erasure or blocking of personal information under certain conditions;</Text>
              <Text style={styles.bulletPoint}>• Right to data portability in a structured, commonly used format;</Text>
              <Text style={styles.bulletPoint}>• Right to object to processing, including for direct marketing;</Text>
              <Text style={styles.bulletPoint}>• Right to damages for violations of your data privacy rights;</Text>
              <Text style={styles.bulletPoint}>• Right to lodge a complaint with the National Privacy Commission (NPC).</Text>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>3.5 Data Retention</Text>
              <Text style={styles.bodyText}>
                We retain your personal information only for as long as necessary to fulfill the purposes outlined in Section 3.3, comply with legal obligations, resolve disputes, and enforce our agreements. Account data is retained for the duration of your active account plus a period of three (3) years following account termination, unless a longer retention period is required by law.
              </Text>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>3.6 Data Security</Text>
              <Text style={styles.bodyText}>
                We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction, including encryption, access controls, regular security assessments, and staff training. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
              </Text>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>3.7 Third-Party Processors</Text>
              <Text style={styles.bodyText}>
                We may engage third-party service providers (e.g., cloud hosting, analytics, authentication) who process personal information on our behalf. All such processors are contractually bound to comply with Data Privacy Laws and implement adequate security measures.
              </Text>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>3.8 Data Breach Notification</Text>
              <Text style={styles.bodyText}>
                In the event of a personal data breach likely to result in a risk to your rights and freedoms, we shall notify the National Privacy Commission and affected data subjects within seventy-two (72) hours of becoming aware of the breach, as required by the Data Privacy Act.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. User Responsibilities</Text>
            <Text style={styles.bodyText}>
              You agree to: (a) provide accurate, current, and complete registration information; (b) maintain the confidentiality of your account credentials; (c) immediately notify us of any unauthorized use of your account; (d) comply with all applicable laws and regulations in your use of the Service; (e) not use the Service for any illegal, harmful, or unauthorized purpose; (f) not interfere with or disrupt the Service or servers connected to the Service.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. Intellectual Property</Text>
            <Text style={styles.bodyText}>
              All rights, title, and interest in and to the Service, including all software, designs, trademarks, logos, content, and intellectual property rights therein, are owned by or licensed to ARGUS. These Terms grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Service for your personal or internal business purposes only.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. Disclaimer of Warranties</Text>
            <Text style={styles.bodyText}>
              THE SERVICE IS PROVIDED &ldquo;AS IS&ldquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ACCURACY. ARGUS DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. Limitation of Liability</Text>
            <Text style={styles.bodyText}>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, ARGUS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OR INABILITY TO USE THE SERVICE, EVEN IF ARGUS HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. ARGUS&ldquo;S TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU, IF ANY, FOR THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>8. Indemnification</Text>
            <Text style={styles.bodyText}>
              You agree to defend, indemnify, and hold harmless ARGUS and its officers, directors, employees, and agents from and against any claims, damages, obligations, losses, liabilities, costs, and expenses (including reasonable attorney&ldquo;s fees) arising out of or related to: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any third-party right; or (d) any personal information you submit that is false, inaccurate, or misleading.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>9. Termination</Text>
            <Text style={styles.bodyText}>
              We may suspend or terminate your account and access to the Service at any time, with or without cause, with or without notice, effective immediately. Upon termination, your right to use the Service ceases immediately. Sections 2, 3, 5, 6, 7, 8, 10, and 11 shall survive termination.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>10. Governing Law and Dispute Resolution</Text>
            <Text style={styles.bodyText}>
              These Terms shall be governed by and construed in accordance with the laws of the Republic of the Philippines. Any dispute arising out of or relating to these Terms shall be resolved through good-faith negotiation. If unresolved within thirty (30) days, the dispute shall be submitted to the appropriate courts of the Philippines, with venue in the city where ARGUS&ldquo;s principal office is located.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>11. General Provisions</Text>
            <Text style={styles.bodyText}>
              These Terms constitute the entire agreement between you and ARGUS regarding the Service. If any provision is found unenforceable, the remaining provisions shall continue in full force. Our failure to enforce any right shall not constitute a waiver. We may assign these Terms without your consent. You may not assign these Terms without our prior written consent. Headings are for convenience only.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>12. Contact Information</Text>
            <Text style={styles.bodyText}>
              For questions, concerns, or to exercise your data subject rights, contact our Data Protection Officer at:
            </Text>
            <Text style={styles.contactInfo}>Email: dpo@argus.example.com</Text>
            <Text style={styles.contactInfo}>Address: ARGUS Data Privacy Office, [Company Address], Philippines</Text>
          </View>

          <View style={styles.lastUpdated}>
            <Text style={styles.lastUpdatedText}>Last Updated: September 13, 2026</Text>
            <Text style={styles.lastUpdatedText}>Version: 1.0</Text>
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[
              styles.declineButton,
              { opacity: isAccepted ? 0.5 : 1 },
            ]}
            onPress={handleDecline}
            activeOpacity={0.7}
            disabled={isAccepted}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.acceptButton,
              !hasScrolledToBottom && styles.acceptButtonDisabled,
            ]}
            onPress={handleAccept}
            activeOpacity={0.7}
            disabled={!hasScrolledToBottom || isAccepted}
          >
            <Text style={[
              styles.acceptButtonText,
              !hasScrolledToBottom && styles.acceptButtonTextDisabled,
            ]}>
              {isAccepted ? "Accepted" : "I Have Read & Accept"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E4EC",
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#294880",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#294880",
    marginBottom: 10,
  },
  subSection: {
    marginBottom: 14,
    marginLeft: 4,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3A5BA0",
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#3D4A6B",
    textAlign: "justify",
  },
  bulletPoint: {
    fontSize: 13,
    lineHeight: 20,
    color: "#3D4A6B",
    marginLeft: 12,
    marginBottom: 4,
    textAlign: "justify",
  },
  contactInfo: {
    fontSize: 13,
    lineHeight: 20,
    color: "#3D4A6B",
    marginLeft: 12,
    marginBottom: 4,
    fontStyle: "italic",
  },
  lastUpdated: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E0E4EC",
    alignItems: "center",
  },
  lastUpdatedText: {
    fontSize: 11,
    color: "#8A9BB8",
    marginBottom: 2,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E4EC",
    gap: 12,
  },
  declineButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F0F2F7",
    borderWidth: 1,
    borderColor: "#C8CFE0",
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#5A6F9E",
  },
  acceptButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#294880",
  },
  acceptButtonDisabled: {
    backgroundColor: "#A8B6D4",
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  acceptButtonTextDisabled: {
    color: "#D0D8E8",
  },
});