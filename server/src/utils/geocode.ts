import { canonicalBarangay, deriveBarangay } from "./argaoLocation.js";

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";

type NominatimAddress = {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  town?: string;
  city?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
  display_name?: string;
};

type NominatimResponse = {
  address?: NominatimAddress;
  display_name?: string;
  error?: string;
};

export function formatGeocodedAddress(addr: NominatimAddress, coordinates?: { latitude: number; longitude: number }): string {
  const locality = [addr.suburb, addr.village, addr.neighbourhood]
    .map((value) => canonicalBarangay(value || "")).find(Boolean);
  const road = (addr.road || "").trim();
  const barangay = deriveBarangay(locality || "", coordinates);
  const city = (addr.town || addr.city || addr.county || "").trim();
  const province = (addr.state || addr.region || "").trim();
  const parts: string[] = [];
  // Barangay is the parent; retain the street as a more specific detail.
  [barangay, road, city, province].forEach((part) => {
    if (part && !parts.some((item) => item.toLowerCase() === part.toLowerCase())) parts.push(part);
  });
  return parts.join(", ");
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<string | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  try {
    const url = `${NOMINATIM_ENDPOINT}?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "CommuniShield-App/1.0",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = (await res.json()) as NominatimResponse;
    const addr = data.address;

    if (addr) {
      const location = formatGeocodedAddress(addr, { latitude, longitude });
      if (location) return location;
    }

    if (data.display_name) {
      return data.display_name.split(",").slice(0, 4).join(",").trim();
    }

    return null;
  } catch {
    return null;
  }
}
