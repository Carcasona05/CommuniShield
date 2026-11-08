import { supabaseAdmin } from "../config/supabaseAdmin.js";
import argaoEmergencyFacilities from "../data/argaoEmergencyFacilities.json" with { type: "json" };

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type FacilityRow = {
  id: string;
  type: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  phone: string;
};

export type Facility = {
  id: string;
  type: "police" | "fire";
  name: string;
  lat: number;
  lng: number;
  address: string;
  phone: string;
  distanceKm: number;
};

const cache = new Map<string, { at: number; data: Facility[] }>();

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
};

export const facilityService = {
  async getNearby(lat: number, lng: number, radius: number) {
    const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radius}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { data: hit.data };
    }

    const { data, error } = await supabaseAdmin
      .from("emergency_facilities")
      .select("id, name, type, latitude, longitude, address, phone")
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);

    const oldStationNames = new Set(["argao municipal police station", "argao police station", "argao fire station", "argao fire station (old railway stn)"]);
    const rows = [
      ...argaoEmergencyFacilities,
      ...((data ?? []) as FacilityRow[]).filter(row => !oldStationNames.has(row.name.trim().toLowerCase()) && !/^(?:sample|demo|synthetic|test)(?:[\s:_-]|$)/i.test(row.name.trim())),
    ];

    const radiusKm = radius / 1000;

    const sorted: Facility[] = rows
      .filter((row) => row && ["police", "fire"].includes(row.type) && row.latitude != null && row.longitude != null && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)) && Math.abs(Number(row.latitude)) <= 90 && Math.abs(Number(row.longitude)) <= 180)
      .map((row): Facility => ({
        id: row.id,
        type: row.type === "fire" ? "fire" : "police",
        name: row.name,
        lat: row.latitude,
        lng: row.longitude,
        address: row.address ?? "",
        phone: row.phone ?? "",
        distanceKm: haversineKm(lat, lng, row.latitude, row.longitude),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const withinRadius = sorted.filter(
      (facility) => facility.distanceKm <= radiusKm
    );
    const facilities =
      withinRadius.length > 0 ? withinRadius : sorted.slice(0, 10);

    if (facilities.length > 0) {
      cache.set(key, { at: Date.now(), data: facilities });
    }

    return { data: facilities };
  },
};
