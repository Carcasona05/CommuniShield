import { supabaseAdmin } from "../config/supabaseAdmin.js";

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

    const rows = (data ?? []) as FacilityRow[];

    if (rows.length === 0) {
      console.warn(
        "[facilities] emergency_facilities table is empty - run DB_Schema/emergency_facilities_schema.sql"
      );
    }

    const radiusKm = radius / 1000;

    const sorted: Facility[] = rows
      .filter((row) => row && row.latitude != null && row.longitude != null)
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