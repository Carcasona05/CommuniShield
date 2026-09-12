import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../../services/apiClient";
import { getCache, setCache } from "../../services/dataStore";
import useAutoRefresh from "../../hooks/useAutoRefresh";

import SAdmin_Layout from "../../components/SAdmin_Compo/SAdmin_Layout";
import { ListSkeleton } from "../../components/PageSkeletons";
import Admin_AddAdmin from "../../components/modals/Admin_AddAdmin";
import Admin_EditAdminReq from "../../components/modals/SuperAdmin_EditReq";
import ToastProvider, { useToast } from "../../components/Toast";

function StatusBadge({ label }) {
  const isActive = label === "Active";
  const isPending = label === "Pending";

  return (
    <View
      style={[
        styles.statusBadge,
        isActive && styles.activeBadge,
        isPending && styles.pendingBadge,
        !isActive && !isPending && styles.disabledBadge,
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          isActive && styles.activeBadgeText,
          isPending && styles.pendingBadgeText,
          !isActive && !isPending && styles.disabledBadgeText,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function AdminAccountRow({ admin, isLast, onEdit, onDelete, onToggleStatus }) {
  return (
    <View style={[styles.adminRow, !isLast && styles.adminRowBorder]}>
      <View style={styles.adminLeft}>
        <View style={styles.avatarBox}>
          <Text style={styles.avatarText}>
            {admin.name
              .split(" ")
              .map((item) => item[0])
              .join("")
              .slice(0, 2)}
          </Text>
        </View>

        <View style={styles.adminInfo}>
          <Text style={styles.adminName}>{admin.name}</Text>
          <Text style={styles.adminEmail}>{admin.email}</Text>

          <View style={styles.adminMetaRow}>
            <Text style={styles.adminMeta}>{admin.role}</Text>
            <Text style={styles.adminDot}>•</Text>
            <Text style={styles.adminMeta}>{admin.department}</Text>
          </View>
        </View>
      </View>

      <View style={styles.adminRight}>
        <StatusBadge label={admin.status} />

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.smallButton}
            onPress={() => onToggleStatus(admin.id, admin.email)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={
                admin.status === "Active" ? "pause-outline" : "checkmark-outline"
              }
              size={16}
              color="#294880"
            />
            <Text style={styles.smallButtonText}>
              {admin.status === "Active" ? "Disable" : "Activate"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onEdit(admin)}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={17} color="#294880" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => onDelete(admin.id, admin.email)}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={17} color="#E45757" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function SAdmin_AdminAccountsWrapper() {
  return (
    <ToastProvider>
      <SAdmin_AdminAccounts />
    </ToastProvider>
  );
}

function SAdmin_AdminAccounts() {
  const toast = useToast();
  const [loading, setLoading] = useState(() => getCache("api:/admin/accounts") === undefined);
  const [searchText, setSearchText] = useState("");
  const [isAddAdminVisible, setIsAddAdminVisible] = useState(false);
  const [isEditRequestVisible, setIsEditRequestVisible] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const [fontsLoaded] = useFonts({
    PoppinsRegular: require("../../assets/fonts/Poppins-Regular.ttf"),
    PoppinsMedium: require("../../assets/fonts/Poppins-Medium.ttf"),
    PoppinsSemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  });

  const [adminAccounts, setAdminAccounts] = useState(() => {
    const cached = getCache("api:/admin/accounts");
    return cached?.accounts || [];
  });

  const currentAdminEmail = (globalThis.adminAccount?.email || "").toLowerCase();

  const visibleAdmins = adminAccounts.filter(
    (admin) => (admin.email || "").toLowerCase() !== currentAdminEmail
  );

  const fetchAccounts = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/admin/accounts");
      if (cached && Array.isArray(cached.accounts)) {
        setAdminAccounts(cached.accounts);
      }

      const res = await apiClient.get("/admin/accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCache("api:/admin/accounts", res.data ?? {});
      setAdminAccounts(res.data?.accounts || []);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(fetchAccounts, 30000);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  if (!fontsLoaded) {
    return null;
  }

  if (loading) {
    return (
      <SAdmin_Layout>
        <ListSkeleton />
      </SAdmin_Layout>
    );
  }

  const filteredAdmins = visibleAdmins.filter((admin) => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      (admin.name || "").toLowerCase().includes(query) ||
      (admin.email || "").toLowerCase().includes(query) ||
      (admin.role || "").toLowerCase().includes(query) ||
      (admin.department || "").toLowerCase().includes(query) ||
      (admin.status || "").toLowerCase().includes(query)
    );
  });

  const activeCount = visibleAdmins.filter(
    (admin) => admin.status === "Active"
  ).length;

  const disabledCount = visibleAdmins.filter(
    (admin) => admin.status === "Disabled"
  ).length;

  const superAdminCount = visibleAdmins.filter((admin) =>
    (admin.role || "").toLowerCase().includes("super")
  ).length;

  const getTokenHeaders = async () => {
    const token = await AsyncStorage.getItem("access_token");
    return {
      headers: { Authorization: `Bearer ${token}` },
    };
  };

  const showMessage = (title, message) => {
    const fullMessage = `${title}. ${message}`;
    if (title === "Error" || title === "Restricted") {
      toast.error(fullMessage);
    } else {
      toast.success(fullMessage);
    }
  };

  const handleAddAdmin = async (newAdmin) => {
    try {
      const config = await getTokenHeaders();
      await apiClient.post(
        "/admin/register",
        {
          name: newAdmin.name,
          email: newAdmin.email,
          password: newAdmin.password,
          role: newAdmin.role,
          department: newAdmin.department,
          phone: newAdmin.phone,
        },
        config
      );

      setIsAddAdminVisible(false);
      showMessage("Admin Added", "New admin account has been added successfully.");
      fetchAccounts();
    } catch (error) {
      showMessage("Error", error.response?.data?.error || "Failed to add admin");
    }
  };

  const handleOpenEdit = (admin) => {
    if ((admin.email || "").toLowerCase() === currentAdminEmail) {
      showMessage("Restricted", "You cannot edit your own account here. Use Settings instead.");
      return;
    }
    setSelectedAdmin(admin);
    setIsEditRequestVisible(true);
  };

  const handleSaveEdit = async (updatedAdmin) => {
    if ((updatedAdmin.email || "").toLowerCase() === currentAdminEmail) {
      showMessage("Restricted", "You cannot edit your own account here. Use Settings instead.");
      return;
    }
    try {
      const config = await getTokenHeaders();
      await apiClient.put(`/admin/accounts/${updatedAdmin.id}`, updatedAdmin, config);

      setSelectedAdmin(null);
      setIsEditRequestVisible(false);
      showMessage("Edit Request Saved", "The admin account was updated successfully.");
      fetchAccounts();
    } catch (error) {
      showMessage("Error", error.response?.data?.error || "Failed to update admin");
    }
  };

  const handleDeleteAdmin = (adminId, adminEmail) => {
    if ((adminEmail || "").toLowerCase() === currentAdminEmail) {
      showMessage("Restricted", "You cannot delete your own account.");
      return;
    }

    setPendingDeleteId(adminId);
    setShowDeleteModal(true);
  };

  const confirmDeleteAdmin = async () => {
    if (!pendingDeleteId) return;

    try {
      const config = await getTokenHeaders();
      await apiClient.delete(`/admin/accounts/${pendingDeleteId}`, config);
      showMessage("Admin Deleted", "The admin account has been removed.");
      fetchAccounts();
    } catch (error) {
      showMessage("Error", error.response?.data?.error || "Failed to delete admin");
    } finally {
      setShowDeleteModal(false);
      setPendingDeleteId(null);
    }
  };

  const handleToggleStatus = async (adminId, adminEmail) => {
    if ((adminEmail || "").toLowerCase() === currentAdminEmail) {
      showMessage("Restricted", "You cannot disable or change your own account status.");
      return;
    }

    try {
      const config = await getTokenHeaders();
      const res = await apiClient.patch(`/admin/accounts/${adminId}/status`, {}, config);
      showMessage("Status Updated", `Account is now ${res.data?.status || "updated"}.`);
      fetchAccounts();
    } catch (error) {
      showMessage("Error", error.response?.data?.error || "Failed to toggle status");
    }
  };

  return (
    <SAdmin_Layout>
      <View style={styles.mainWrapper}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageHeader}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setIsAddAdminVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add Admin</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <View style={styles.summaryIconBox}>
                <Ionicons name="people-outline" size={24} color="#294880" />
              </View>

              <View>
                <Text style={styles.summaryValue}>{visibleAdmins.length}</Text>
                <Text style={styles.summaryLabel}>Total Accounts</Text>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.successIconBox}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={24}
                  color="#22A06B"
                />
              </View>

              <View>
                <Text style={styles.summaryValue}>{activeCount}</Text>
                <Text style={styles.summaryLabel}>Active Admins</Text>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.warningIconBox}>
                <Ionicons name="star-outline" size={24} color="#C98A2E" />
              </View>

              <View>
                <Text style={styles.summaryValue}>{superAdminCount}</Text>
                <Text style={styles.summaryLabel}>SuperAdmins</Text>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.dangerIconBox}>
                <Ionicons
                  name="person-remove-outline"
                  size={24}
                  color="#E45757"
                />
              </View>

              <View>
                <Text style={styles.summaryValue}>{disabledCount}</Text>
                <Text style={styles.summaryLabel}>Disabled</Text>
              </View>
            </View>
          </View>

          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <View>
                <Text style={styles.sectionTitle}>Account List</Text>
                <Text style={styles.sectionSubtitle}>
                  Search, edit, disable, or delete admin accounts.
                </Text>
              </View>

              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={18} color="#5D6F92" />

                <TextInput
                  style={styles.searchInput}
                  placeholder="Search admin..."
                  placeholderTextColor="#8A98B3"
                  value={searchText}
                  onChangeText={setSearchText}
                />
              </View>
            </View>

            {filteredAdmins.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={38} color="#5D6F92" />
                <Text style={styles.emptyTitle}>No admin found</Text>
                <Text style={styles.emptyText}>
                  Try searching with another name, email, role, or status.
                </Text>
              </View>
            ) : (
              filteredAdmins.map((admin, index) => (
                <AdminAccountRow
                  key={admin.id}
                  admin={admin}
                  isLast={index === filteredAdmins.length - 1}
                  onEdit={handleOpenEdit}
                  onDelete={handleDeleteAdmin}
                  onToggleStatus={handleToggleStatus}
                />
              ))
            )}
          </View>
        </ScrollView>

        <Admin_AddAdmin
          visible={isAddAdminVisible}
          onClose={() => setIsAddAdminVisible(false)}
          onSubmit={handleAddAdmin}
        />

        <Admin_EditAdminReq
          visible={isEditRequestVisible}
          admin={selectedAdmin}
          onClose={() => {
            setSelectedAdmin(null);
            setIsEditRequestVisible(false);
          }}
          onSave={handleSaveEdit}
        />

        <Modal
          visible={showDeleteModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeleteModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="trash-outline" size={28} color="#DC2626" />
              </View>

              <Text style={styles.modalTitle}>Delete Admin Account</Text>

              <Text style={styles.modalSubtitle}>
                Are you sure you want to delete this admin account? This action cannot be undone.
              </Text>

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setShowDeleteModal(false);
                    setPendingDeleteId(null);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalConfirmButton}
                  onPress={confirmDeleteAdmin}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalConfirmText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SAdmin_Layout>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: "#F5F8FC",
  },

  container: {
    flex: 1,
    backgroundColor: "#F5F8FC",
  },

  scrollContent: {
    paddingBottom: 30,
  },

  pageHeader: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 18,
    padding: 22,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 16,
  },

  pageTitle: {
    fontSize: 24,
    color: "#294880",
    fontFamily: "PoppinsSemiBold",
    marginBottom: 6,
  },

  pageSubtitle: {
    fontSize: 14,
    color: "#5D6F92",
    fontFamily: "PoppinsRegular",
    lineHeight: 21,
    maxWidth: 720,
  },

  addButton: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#294880",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  addButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "PoppinsMedium",
  },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 16,
  },

  summaryCard: {
    flex: 1,
    minWidth: 210,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
  },

  summaryIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  successIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EAF8F1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  warningIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFF4E5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  dangerIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFF5F5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  summaryValue: {
    fontSize: 22,
    fontFamily: "PoppinsSemiBold",
    color: "#2F4267",
  },

  summaryLabel: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    marginTop: 4,
  },

  tableCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2F0",
    borderRadius: 16,
    overflow: "hidden",
  },

  tableHeader: {
    minHeight: 78,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#D9E2F0",
    backgroundColor: "#F7F9FD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  sectionTitle: {
    fontSize: 17,
    fontFamily: "PoppinsSemiBold",
    color: "#294880",
    marginBottom: 4,
  },

  sectionSubtitle: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
  },

  searchBox: {
    width: 260,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },

  searchInput: {
    flex: 1,
    height: "100%",
    marginLeft: 8,
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    color: "#294880",
    outlineStyle: Platform.OS === "web" ? "none" : undefined,
  },

  adminRow: {
    minHeight: 96,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },

  adminRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#E4EAF3",
  },

  adminLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },

  avatarBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#294880",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  avatarText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
  },

  adminInfo: {
    flex: 1,
    minWidth: 0,
  },

  adminName: {
    fontSize: 15,
    fontFamily: "PoppinsSemiBold",
    color: "#2F4267",
    marginBottom: 4,
  },

  adminEmail: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    marginBottom: 5,
  },

  adminMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },

  adminMeta: {
    fontSize: 12,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
  },

  adminDot: {
    fontSize: 12,
    fontFamily: "PoppinsRegular",
    color: "#8A98B3",
  },

  adminRight: {
    alignItems: "flex-end",
    gap: 10,
  },

  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },

  statusBadgeText: {
    fontSize: 12,
    fontFamily: "PoppinsSemiBold",
  },

  activeBadge: {
    backgroundColor: "#EAF8F1",
  },

  activeBadgeText: {
    color: "#22A06B",
  },

  pendingBadge: {
    backgroundColor: "#FFF4E5",
  },

  pendingBadgeText: {
    color: "#C98A2E",
  },

  disabledBadge: {
    backgroundColor: "#FFF5F5",
  },

  disabledBadgeText: {
    color: "#E45757",
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  smallButton: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  smallButtonText: {
    color: "#294880",
    fontSize: 12,
    fontFamily: "PoppinsMedium",
  },

  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },

  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FFF5F5",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyState: {
    paddingVertical: 44,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    fontSize: 16,
    fontFamily: "PoppinsSemiBold",
    color: "#2F4267",
    marginTop: 10,
    marginBottom: 4,
  },

  emptyText: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    textAlign: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E7ECF3",
  },

  modalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FDEBEC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  modalTitle: {
    fontSize: 20,
    fontFamily: "PoppinsSemiBold",
    color: "#16233A",
    marginBottom: 8,
    textAlign: "center",
  },

  modalSubtitle: {
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    color: "#5D6F92",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },

  modalButtonRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },

  modalCancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  modalCancelText: {
    fontSize: 14,
    fontFamily: "PoppinsMedium",
    color: "#475467",
  },

  modalConfirmButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },

  modalConfirmText: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#FFFFFF",
  },
});