import { ARGAO_BARANGAYS } from "../constants/argaoMapData.js";
import { barangaysAtCoordinates, hasReportCoordinates } from "./argaoBoundary.js";

const clean = (value) => String(value ?? "").trim();
const canonicalBarangay = (value) => {
  const name = clean(value).replace(/^(?:barangay|brgy\.?)\s+/i, "");
  return ARGAO_BARANGAYS.find((item) => item.name.toLowerCase() === name.toLowerCase())?.name || "";
};

export function getReportBarangay(report) {
  const explicit = canonicalBarangay(report?.barangay) || canonicalBarangay(report?.barangay_name);
  let addressBarangay = "";
  for (const segment of clean(report?.location).split(",")) {
    const barangay = canonicalBarangay(segment);
    if (barangay) { addressBarangay = barangay; break; }
  }
  if (hasReportCoordinates(report)) {
    const matches = barangaysAtCoordinates(report.latitude, report.longitude);
    if (matches.length === 1) return matches[0];
    // A named barangay may disambiguate a shared edge, but cannot override a
    // pin inside another polygon or invent an assignment outside Argao.
    if (matches.includes(explicit)) return explicit;
    if (matches.includes(addressBarangay)) return addressBarangay;
    return "";
  }
  return explicit || addressBarangay;
}

export function getReportLocationHierarchy(report) {
  const barangay = getReportBarangay(report);
  const location = clean(report?.location);
  const street = clean(report?.street) || location.split(",").map(clean).find((part) =>
    /\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|highway|sitio|purok)\b/i.test(part)
  ) || "";
  return {
    barangay,
    street,
    label: barangay ? (street ? `${barangay} → ${street}` : barangay) : location || "Location not specified",
  };
}
