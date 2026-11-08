export const isSampleFacility = (facility) => /^(?:sample|demo|synthetic|test)(?:[\s:_-]|$)/i.test(String(facility?.name || "").trim()) || facility?.is_sample === true;

export const validMapPosition = (lat, lng) => [lat, lng].every(value =>
  (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value))) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;

export function mapDistanceKm(lat1, lng1, lat2, lng2) {
  const rad = value => value * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function facilityIdentity(facility) {
  let name = String(facility.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (facility.type === "police" && ["argaomunicipalpolicestation", "argaopolicestation"].includes(name)) name = "argaopolicestation";
  if (facility.type === "fire" && ["argaofirestation", "argaofirestationoldrailwaystn"].includes(name)) name = "argaofirestation";
  return `${facility.type}:${name}`;
}

export function mergeMapFacilities(remote, local, barangays, position) {
  const known = new Map();
  // Bundled, sourced records take precedence over old database seed locations.
  // Never suppress a distinct hospital/clinic merely because it is nearby.
  for (const facility of [...local, ...remote, ...barangays]) {
    if (!facility || isSampleFacility(facility) || facility.type === "help" || !validMapPosition(facility.lat, facility.lng)) continue;
    const key = facilityIdentity(facility);
    if (!known.has(key)) known.set(key, facility);
  }
  const hasPosition = Array.isArray(position) && validMapPosition(position[0], position[1]);
  const anchor = hasPosition ? position : [9.8816, 123.5953];
  return [...known.values()].map(facility => ({
    ...facility, lat: Number(facility.lat), lng: Number(facility.lng),
    distanceKm: hasPosition ? mapDistanceKm(anchor[0], anchor[1], Number(facility.lat), Number(facility.lng)) : undefined,
  })).sort((a, b) => mapDistanceKm(anchor[0], anchor[1], a.lat, a.lng) - mapDistanceKm(anchor[0], anchor[1], b.lat, b.lng));
}

export function facilityDirectionsUrl(facility) {
  if (facility.locationKind === "barangay-area") return facility.mapsUrl;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${facility.lat},${facility.lng}`)}`;
}

export function facilityPhoneUrl(facility) {
  const phone = String(facility.phone || "").replace(/[^0-9+]/g, "");
  return phone ? `tel:${phone}` : null;
}
