import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import MapView from "../../components/MapView";
import { MapSkeleton } from "../../components/PageSkeletons";
import apiClient from "../../services/apiClient";
import useAutoRefresh from "../../hooks/useAutoRefresh";
import { getCache, setCache } from "../../services/dataStore";
import {
  ARGAO_BARANGAYS,
  ARGAO_HELP_FACILITIES,
  MAP_TYPE_META,
  MAP_TYPE_BY_LABEL,
  MAP_FILTER_TYPES,
} from "../../constants/argaoMapData";

const COMMUNISHIELD_BLUE = "#294880";

const { width } = Dimensions.get("window");

const DEFAULT_ARGAO = { lat: 9.8816, lng: 123.5953 };

const CEBU_BOUNDS = { south: 9.45, west: 123.05, north: 11.45, east: 124.05 };

const clampToCebu = (lat, lng) => [
  Math.min(Math.max(lat, CEBU_BOUNDS.south), CEBU_BOUNDS.north),
  Math.min(Math.max(lng, CEBU_BOUNDS.west), CEBU_BOUNDS.east),
];

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const formatDistance = (km) => {
  if (km === undefined || km === null || Number.isNaN(km)) return "—";
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m away`;
  return `${km.toFixed(1)} km away`;
};

const metaFor = (type) => MAP_TYPE_META[type] || MAP_TYPE_META.police;

const UserMap = () => {
  const [selectedType, setSelectedType] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [facilities, setFacilities] = useState(() => {
    const cached = getCache("api:/facilities/nearby");
    return cached?.facilities || [];
  });
  const [loading, setLoading] = useState(() => getCache("api:/facilities/nearby") === undefined);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);
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
        setFacilities(cached?.facilities ?? []);
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

      setFacilities(res.data?.facilities ?? []);
    } catch (err) {
      console.warn("Failed to load facilities:", err.message);
    } finally {
      hasLoadedFacilitiesRef.current = true;
      setFacilitiesLoading(false);
      setLoading(false);
    }
  }, [userPosition]);

  useAutoRefresh(loadFacilities, 60000);

  useEffect(() => {
    if (userPosition) loadFacilities();
  }, [userPosition, loadFacilities]);

  const mergedFacilities = useMemo(() => {
    const anchor = userPosition
      ? clampToCebu(userPosition[0], userPosition[1])
      : [DEFAULT_ARGAO.lat, DEFAULT_ARGAO.lng];

    const staticFacilities = ARGAO_HELP_FACILITIES.filter(
      (s) =>
        !facilities.some(
          (f) =>
            f.type === s.type &&
            haversineKm(f.lat, f.lng, s.lat, s.lng) < 2.5
        )
    ).map((s) => ({
      ...s,
      distanceKm: haversineKm(anchor[0], anchor[1], s.lat, s.lng),
    }));

    const all = [
      ...facilities.map((f) => ({ ...f })),
      ...ARGAO_BARANGAYS.map((b) => ({
        ...b,
        distanceKm: haversineKm(anchor[0], anchor[1], b.lat, b.lng),
      })),
      ...staticFacilities,
    ];

    all.sort(
      (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)
    );
    return all;
  }, [facilities, userPosition]);

  useEffect(() => {
    setSelectedFacility((prev) =>
      prev && mergedFacilities.some((f) => f.id === prev.id)
        ? prev
        : mergedFacilities[0] ?? null
    );
  }, [mergedFacilities]);

  const filteredFacilities = useMemo(() => {
    if (selectedType === "All") return mergedFacilities;
    const type = MAP_TYPE_BY_LABEL[selectedType];
    if (!type) return mergedFacilities;
    return mergedFacilities.filter((facility) => facility.type === type);
  }, [mergedFacilities, selectedType]);

  const mapMarkers = useMemo(
    () =>
      filteredFacilities.map((facility) => ({
        id: facility.id,
        lat: facility.lat,
        lng: facility.lng,
        label: facility.name,
        type: facility.type,
        color: metaFor(facility.type).color,
      })),
    [filteredFacilities]
  );

  const nearestPolice = mergedFacilities.find((f) => f.type === "police");

  const nearestFire = mergedFacilities.find((f) => f.type === "fire");

  const mapPosition = userPosition
    ? clampToCebu(userPosition[0], userPosition[1])
    : null;

  const openDirections = (facility) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`;
    Linking.openURL(url).catch(() => {});
  };

  const openCall = (facility) => {
    const phone = (facility.phone || "911").replace(/[^0-9+]/g, "");
    if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const handleSelectType = (type) => {
    setSelectedType(type);
    setShowFilters(false);

    const targetType = MAP_TYPE_BY_LABEL[type];
    const firstMatch =
      type === "All"
        ? mergedFacilities[0]
        : mergedFacilities.find((f) => f.type === targetType);

    if (firstMatch) {
      setSelectedFacility(firstMatch);
    }
  };

  const resetFilters = () => {
    setSelectedType("All");
    setSelectedFacility(mergedFacilities[0] ?? null);
  };

  const selectedMeta = selectedFacility
    ? metaFor(selectedFacility.type)
    : null;

  if (loading) {
    return (
      <ThemedView style={{ backgroundColor: "#F8F8F8" }}>
        <MapSkeleton />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.fullMap}>
        <MapView
          ref={mapViewRef}
          style={styles.fullMap}
          position={mapPosition}
          markers={mapMarkers}
          onMarkerPress={(id) => {
            const facility = mergedFacilities.find((f) => f.id === id);
            if (facility) {
              setSelectedFacility(facility);
              setShowPanel(true);
            }
          }}
          onMapPress={() => setShowPanel(false)}
          onLocation={setUserPosition}
        />

          <View style={styles.legendContainer}>
            <View style={styles.legendHeader}>
              <Ionicons name="information-circle-outline" size={13} color="#5D6F92" />
              <ThemedText style={styles.legendTitle}>Legend</ThemedText>
            </View>
            {Object.values(MAP_TYPE_META).map((meta) => (
              <View key={meta.label} style={styles.legendItem}>
                <Ionicons name={meta.icon} size={13} color={meta.color} />
                <ThemedText style={styles.legendText}>{meta.label}</ThemedText>
              </View>
            ))}
            <View style={styles.legendItem}>
              <Ionicons name="location" size={13} color="#2F80ED" />
              <ThemedText style={styles.legendText}>Your Location</ThemedText>
            </View>
          </View>

        <TouchableOpacity
          style={styles.recenterButton}
          activeOpacity={0.8}
          onPress={() => mapViewRef.current?.recenter()}
        >
          <Ionicons name="locate-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {showPanel && selectedFacility && selectedMeta && (
        <View style={styles.panelOverlay} pointerEvents="box-none">
          <View style={styles.facilityCard}>
            <View style={styles.facilityHeader}>
              <View style={styles.facilityTitleRow}>
                <View
                  style={[
                    styles.facilityIconBox,
                    { backgroundColor: selectedMeta.color },
                  ]}
                >
                  <Ionicons
                    name={selectedMeta.icon}
                    size={18}
                    color="#FFFFFF"
                  />
                </View>

                <View style={styles.facilityTitleWrap}>
                  <ThemedText style={styles.facilityName}>
                    {selectedFacility.name}
                  </ThemedText>

                  <ThemedText style={styles.facilityType}>
                    {selectedMeta.label}
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
              {selectedMeta.responseNote}
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
              Pins cover all 45 barangays of Argao plus hospitals, clinics,
              police, fire, and help stations.
            </ThemedText>
          </View>
        </View>
      )}

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

            {MAP_FILTER_TYPES.map((type) => {
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
                      name={MAP_TYPE_META[MAP_TYPE_BY_LABEL[type]].icon}
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

  fullMap: {
    flex: 1,
  },

  legendContainer: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 10,
    gap: 5,
  },

  legendHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },

  legendTitle: {
    fontSize: 14,
    fontFamily: "PoppinsSemiBold",
    color: "#5D6F92",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
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

  panelOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingBottom: 120,
  },

  facilityCard: {
    marginHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    marginBottom: 6,
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
    backgroundColor: "#F4511E",
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
    marginHorizontal: 14,
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