import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
  Platform,
  Linking,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import MapView from "../../components/MapView";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import useScrollToTop from "../../hooks/useScrollToTop";
import { subscribeRefresh } from "../../services/refreshBus";
import { getCache, setCache } from "../../services/dataStore";

const COMMUNISHIELD_BLUE = "#294880";

const { width } = Dimensions.get("window");

const FACILITY_TYPES = ["All", "Police Station", "Fire Department"];

const DEFAULT_ARGAO = { lat: 9.8816, lng: 123.5953 };

const CEBU_BOUNDS = { south: 9.45, west: 123.05, north: 11.45, east: 124.05 };

const clampToCebu = (lat, lng) => [
  Math.min(Math.max(lat, CEBU_BOUNDS.south), CEBU_BOUNDS.north),
  Math.min(Math.max(lng, CEBU_BOUNDS.west), CEBU_BOUNDS.east),
];

const formatDistance = (km) => {
  if (km === undefined || km === null || Number.isNaN(km)) return "—";
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m away`;
  return `${km.toFixed(1)} km away`;
};

const getTypeLabel = (type) =>
  type === "fire" ? "Fire Department" : "Police Station";

const getFacilityIconName = (type) => {
  if (type === "fire" || type === "Fire Department") return "flame";
  if (type === "police" || type === "Police Station") return "shield-checkmark";
  return "location";
};

const getResponseNote = (type) =>
  type === "fire"
    ? "Nearest fire response for fire and emergency incidents."
    : "Nearest police assistance for public safety concerns.";

const UserMap = () => {
  const [searchText, setSearchText] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [facilities, setFacilities] = useState(() => {
    const cached = getCache("api:/facilities/nearby");
    return cached?.facilities || [];
  });
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useScrollToTop();
  const [userPosition, setUserPosition] = useState(null);
  const mapViewRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const requestLocation = async () => {
      if (Platform.OS === "web") return;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (!cancelled) {
          setUserPosition([current.coords.latitude, current.coords.longitude]);
        }
      } catch (err) {
        console.warn("Location error:", err.message);
      }
    };

    requestLocation();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasLoadedFacilitiesRef = useRef(false);

  const loadFacilities = useCallback(async () => {
    try {
      if (!hasLoadedFacilitiesRef.current) setFacilitiesLoading(true);

      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const cached = getCache("api:/facilities/nearby");
      if (cached !== undefined) {
        const cachedList = cached?.facilities ?? [];
        setFacilities(cachedList);
        setSelectedFacility((prev) => {
          if (prev && cachedList.some((f) => f.id === prev.id)) return prev;
          return cachedList[0] ?? null;
        });
      }

      const anchor = userPosition
        ? clampToCebu(userPosition[0], userPosition[1])
        : [DEFAULT_ARGAO.lat, DEFAULT_ARGAO.lng];

      const res = await apiClient.get("/facilities/nearby", {
        params: { lat: anchor[0], lng: anchor[1], radius: 8000 },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
      });

      setCache("api:/facilities/nearby", res.data ?? {});

      const list = res.data?.facilities ?? [];
      setFacilities(list);

      setSelectedFacility((prev) => {
        if (prev && list.some((f) => f.id === prev.id)) return prev;
        return list[0] ?? null;
      });
    } catch (err) {
      console.warn("Failed to load facilities:", err.message);
    } finally {
      hasLoadedFacilitiesRef.current = true;
      setFacilitiesLoading(false);
      setRefreshing(false);
    }
  }, [userPosition]);

  useAutoRefresh(loadFacilities, 30000);

  useEffect(() => subscribeRefresh(loadFacilities), [loadFacilities]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadFacilities();
  }, [loadFacilities]);

  useEffect(() => {
    if (userPosition) loadFacilities();
  }, [userPosition, loadFacilities]);

  const filteredFacilities = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return facilities.filter((facility) => {
      const matchesType =
        selectedType === "All" || getTypeLabel(facility.type) === selectedType;

      const matchesSearch =
        normalizedSearch === "" ||
        facility.name.toLowerCase().includes(normalizedSearch) ||
        facility.address.toLowerCase().includes(normalizedSearch) ||
        getTypeLabel(facility.type).toLowerCase().includes(normalizedSearch);

      return matchesType && matchesSearch;
    });
  }, [facilities, searchText, selectedType]);

  const nearestPolice = facilities.find((f) => f.type === "police");

  const nearestFire = facilities.find((f) => f.type === "fire");

  const mapPosition = userPosition
    ? clampToCebu(userPosition[0], userPosition[1])
    : null;

  const openDirections = (facility) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`;
    Linking.openURL(url).catch(() => {});
  };

  const openCall = (facility) => {
    const phone = (facility.phone || "").replace(/[^0-9+]/g, "");
    if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const handleSelectType = (type) => {
    setSelectedType(type);
    setShowFilters(false);

    const firstMatch = facilities.find((f) => {
      return type === "All" || getTypeLabel(f.type) === type;
    });

    if (firstMatch) {
      setSelectedFacility(firstMatch);
    }
  };

  const resetFilters = () => {
    setSelectedType("All");
    setSearchText("");
    setSelectedFacility(facilities[0] ?? null);
  };

  const getFacilityIcon = getFacilityIconName;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.screenScroll}
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COMMUNISHIELD_BLUE]}
            tintColor={COMMUNISHIELD_BLUE}
          />
        }
      >
        <View style={styles.mapWrapper}>
          <MapView
            ref={mapViewRef}
            style={styles.map}
            position={mapPosition}
            markers={filteredFacilities.map((facility) => ({
              id: facility.id,
              lat: facility.lat,
              lng: facility.lng,
              label: facility.name,
              color: facility.type === "police" ? COMMUNISHIELD_BLUE : "#D9534F",
            }))}
            onMarkerPress={(id) => {
              const facility = facilities.find((f) => f.id === id);
              if (facility) setSelectedFacility(facility);
            }}
            onLocation={setUserPosition}
          />

          <View style={styles.topBar}>
            <TextInput
              style={styles.searchBar}
              placeholder="Search police or fire station..."
              placeholderTextColor="#8E8E93"
              value={searchText}
              onChangeText={setSearchText}
            />

            <TouchableOpacity
              style={styles.filterIconButton}
              activeOpacity={0.8}
              onPress={() => setShowFilters(true)}
            >
              <Ionicons name="options-outline" size={22} color={COMMUNISHIELD_BLUE} />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.legendRow}
            contentContainerStyle={styles.legendContent}
          >
            <View style={styles.legendChip}>
              <View style={[styles.legendDot, styles.policeDot]} />
              <ThemedText style={styles.legendText}>Police Station</ThemedText>
            </View>

            <View style={styles.legendChip}>
              <View style={[styles.legendDot, styles.fireDot]} />
              <ThemedText style={styles.legendText}>Fire Department</ThemedText>
            </View>

            <View style={styles.legendChip}>
              <View style={[styles.legendDot, styles.userDotSmall]} />
              <ThemedText style={styles.legendText}>Your Location</ThemedText>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={styles.recenterButton}
            activeOpacity={0.8}
            onPress={() => mapViewRef.current?.recenter()}
          >
            <Ionicons name="locate-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {selectedFacility && (
          <View style={styles.facilityCard}>
            <View style={styles.facilityHeader}>
              <View style={styles.facilityTitleRow}>
                <View
                  style={[
                    styles.facilityIconBox,
                    selectedFacility.type === "police"
                      ? styles.policeIconBox
                      : styles.fireIconBox,
                  ]}
                >
                  <Ionicons
                    name={getFacilityIcon(selectedFacility.type)}
                    size={18}
                    color="#FFFFFF"
                  />
                </View>

                <View style={styles.facilityTitleWrap}>
                  <ThemedText style={styles.facilityName}>
                    {selectedFacility.name}
                  </ThemedText>

                  <ThemedText style={styles.facilityType}>
                    {getTypeLabel(selectedFacility.type)}
                  </ThemedText>
                </View>
              </View>

              <ThemedText style={styles.distanceText}>
                {formatDistance(selectedFacility.distanceKm)}
              </ThemedText>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color="#6B7280" />
              <ThemedText style={styles.infoText}>
                {selectedFacility.address || selectedFacility.name}
              </ThemedText>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={16} color="#6B7280" />
              <ThemedText style={styles.infoText}>
                {selectedFacility.phone || "911 / Local Hotline"}
              </ThemedText>
            </View>

            <ThemedText style={styles.responseNote}>
              {getResponseNote(selectedFacility.type)}
            </ThemedText>

            <View style={styles.cardButtons}>
              <TouchableOpacity
                style={styles.primaryButton}
                activeOpacity={0.8}
                onPress={() => openDirections(selectedFacility)}
              >
                <Ionicons name="navigate-outline" size={16} color="#FFFFFF" />
                <ThemedText style={styles.primaryButtonText}>
                  Get Directions
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                activeOpacity={0.8}
                onPress={() => openCall(selectedFacility)}
              >
                <Ionicons name="call-outline" size={16} color={COMMUNISHIELD_BLUE} />
                <ThemedText style={styles.secondaryButtonText}>
                  Call
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.bottomPanel}>
          <View style={styles.filtersTag}>
            <ThemedText style={styles.filtersTagText}>
              Showing: {selectedType}
            </ThemedText>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <View style={[styles.summaryIcon, styles.policeIconBox]}>
                <Ionicons name="shield-checkmark" size={17} color="#FFFFFF" />
              </View>

              <View style={styles.summaryTextWrap}>
                <ThemedText style={styles.summaryLabel}>
                  Nearest Police
                </ThemedText>

                <ThemedText numberOfLines={1} style={styles.summaryValue}>
                  {nearestPolice
                    ? formatDistance(nearestPolice.distanceKm)
                    : facilitiesLoading
                      ? "Searching…"
                      : "—"}
                </ThemedText>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <View style={[styles.summaryIcon, styles.fireIconBox]}>
                <Ionicons name="flame" size={17} color="#FFFFFF" />
              </View>

              <View style={styles.summaryTextWrap}>
                <ThemedText style={styles.summaryLabel}>
                  Nearest Fire Dept.
                </ThemedText>

                <ThemedText numberOfLines={1} style={styles.summaryValue}>
                  {nearestFire
                    ? formatDistance(nearestFire.distanceKm)
                    : facilitiesLoading
                      ? "Searching…"
                      : "—"}
                </ThemedText>
              </View>
            </View>
          </View>

          <ThemedText style={styles.bottomNote}>
            Facility pins are loaded from the CommuniShield database for Argao, Cebu.
          </ThemedText>
        </View>
      </ScrollView>

      <Modal
        visible={showFilters}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilters(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowFilters(false)}
        >
          <Pressable style={styles.filterModal} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Map Filter</ThemedText>

              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.sectionTitle}>
              Emergency Location Type
            </ThemedText>

            {FACILITY_TYPES.map((type) => {
              const active = selectedType === type;

              return (
                <TouchableOpacity
                  key={type}
                  activeOpacity={0.8}
                  style={[styles.filterOption, active && styles.activeOption]}
                  onPress={() => handleSelectType(type)}
                >
                  <View style={styles.filterOptionLeft}>
                    <View
                      style={[
                        styles.radioCircle,
                        active && styles.radioCircleActive,
                      ]}
                    >
                      {active && <View style={styles.radioInner} />}
                    </View>

                    <ThemedText
                      style={[
                        styles.filterOptionText,
                        active && styles.filterOptionTextActive,
                      ]}
                    >
                      {type}
                    </ThemedText>
                  </View>

                  {type !== "All" && (
                    <Ionicons
                      name={getFacilityIcon(type)}
                      size={18}
                      color={active ? COMMUNISHIELD_BLUE : "#9CA3AF"}
                    />
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.resetButton}
                activeOpacity={0.8}
                onPress={resetFilters}
              >
                <ThemedText style={styles.resetButtonText}>Reset</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.applyButton}
                activeOpacity={0.8}
                onPress={() => setShowFilters(false)}
              >
                <ThemedText style={styles.applyButtonText}>Apply</ThemedText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F6FA",
  },

  screenScroll: {
    flex: 1,
  },

  screenContent: {
    paddingBottom: 120,
  },

  mapWrapper: {
    width: "100%",
    height: 560,
    position: "relative",
    backgroundColor: "#DCE7F3",
    overflow: "hidden",
  },

  map: {
    width: "100%",
    height: "100%",
  },

  topBar: {
    position: "absolute",
    top: 14,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
  },

  searchBar: {
    flex: 1,
    height: 46,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: "PoppinsRegular",
    color: "#1E1E1E",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },

  filterIconButton: {
    width: 46,
    height: 46,
    marginLeft: 8,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },

  legendRow: {
    position: "absolute",
    top: 70,
    left: 12,
    right: 12,
    maxHeight: 42,
    zIndex: 10,
  },

  legendContent: {
    paddingRight: 20,
  },

  legendChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginRight: 8,
    elevation: 2,
  },

  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 10,
    marginRight: 6,
  },

  policeDot: {
    backgroundColor: COMMUNISHIELD_BLUE,
  },

  fireDot: {
    backgroundColor: "#D9534F",
  },

  userDotSmall: {
    backgroundColor: "#2F80ED",
  },

  legendText: {
    fontSize: 11,
    fontFamily: "PoppinsMedium",
    color: "#4A4A4A",
  },

  recenterButton: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COMMUNISHIELD_BLUE,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 10,
  },

  facilityCard: {
    marginHorizontal: 14,
    marginTop: -78,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 20,
  },

  facilityHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  facilityTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },

  facilityIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  policeIconBox: {
    backgroundColor: COMMUNISHIELD_BLUE,
  },

  fireIconBox: {
    backgroundColor: "#D9534F",
  },

  facilityTitleWrap: {
    flex: 1,
  },

  facilityName: {
    fontSize: 15,
    fontFamily: "PoppinsSemiBold",
    color: "#1F2937",
  },

  facilityType: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: "PoppinsRegular",
    color: "#6B7280",
  },

  distanceText: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
    color: COMMUNISHIELD_BLUE,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },

  infoText: {
    flex: 1,
    marginLeft: 7,
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#4B5563",
  },

  responseNote: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: "PoppinsRegular",
    color: "#6B7280",
    lineHeight: 18,
  },

  cardButtons: {
    flexDirection: "row",
    marginTop: 13,
  },

  primaryButton: {
    flex: 1.3,
    height: 40,
    borderRadius: 999,
    backgroundColor: COMMUNISHIELD_BLUE,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginRight: 8,
  },

  primaryButtonText: {
    marginLeft: 6,
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "PoppinsMedium",
  },

  secondaryButton: {
    flex: 0.8,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  secondaryButtonText: {
    marginLeft: 6,
    color: COMMUNISHIELD_BLUE,
    fontSize: 12,
    fontFamily: "PoppinsMedium",
  },

  bottomPanel: {
    marginHorizontal: 10,
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 20,
    padding: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },

  filtersTag: {
    alignSelf: "flex-start",
    backgroundColor: "#EEF2FF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
  },

  filtersTagText: {
    fontSize: 12,
    fontFamily: "PoppinsMedium",
    color: COMMUNISHIELD_BLUE,
  },

  summaryRow: {
    flexDirection: "row",
    gap: 8,
  },

  summaryCard: {
    flex: 1,
    minHeight: 66,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5EAF3",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  summaryTextWrap: {
    flex: 1,
  },

  summaryLabel: {
    fontSize: 11,
    fontFamily: "PoppinsRegular",
    color: "#6B7280",
  },

  summaryValue: {
    marginTop: 3,
    fontSize: 13,
    fontFamily: "PoppinsMedium",
    color: "#1F2937",
  },

  bottomNote: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: "PoppinsRegular",
    color: "#6B7280",
    lineHeight: 17,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 92,
    paddingRight: 14,
  },

  filterModal: {
    width: Math.min(width - 28, 320),
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    elevation: 10,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  modalTitle: {
    fontSize: 20,
    fontFamily: "PoppinsSemiBold",
    color: "#222222",
  },

  sectionTitle: {
    marginTop: 16,
    marginBottom: 10,
    fontSize: 14,
    fontFamily: "PoppinsMedium",
    color: "#3A3A3A",
  },

  filterOption: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5EAF3",
    backgroundColor: "#FAFBFF",
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  activeOption: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C9D8F5",
  },

  filterOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  radioCircleActive: {
    borderColor: COMMUNISHIELD_BLUE,
  },

  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COMMUNISHIELD_BLUE,
  },

  filterOptionText: {
    fontSize: 13,
    fontFamily: "PoppinsRegular",
    color: "#4B5563",
  },

  filterOptionTextActive: {
    fontFamily: "PoppinsMedium",
    color: COMMUNISHIELD_BLUE,
  },

  modalButtonsRow: {
    flexDirection: "row",
    marginTop: 16,
  },

  resetButton: {
    flex: 1,
    marginRight: 8,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#EEF2FF",
  },

  resetButtonText: {
    color: COMMUNISHIELD_BLUE,
    fontSize: 14,
    fontFamily: "PoppinsMedium",
  },

  applyButton: {
    flex: 1.3,
    backgroundColor: COMMUNISHIELD_BLUE,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },

  applyButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "PoppinsMedium",
  },
});

export default UserMap;