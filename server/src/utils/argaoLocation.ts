import boundaries from "../data/argaoBarangayBoundaries.json" with { type: "json" };

// Keep canonical names aligned with clients/constants/argaoMapData.js.
export const ARGAO_BARANGAY_NAMES = [
  "Alambijud", "Anajao", "Apo", "Balaas", "Balisong", "Binlod", "Bogo", "Bug-ot",
  "Bulasa", "Butong", "Calagasan", "Canbantug", "Canbanua", "Cansuje", "Capio-an",
  "Casay", "Catang", "Colawin", "Conalum", "Guiwanon", "Gutlang", "Jampang",
  "Jomgao", "Lamacan", "Langtad", "Langub", "Lapay", "Lengigon", "Linut-od",
  "Mabasa", "Mandilikit", "Mompeller", "Panadtaran", "Poblacion", "Sua", "Sumaguan",
  "Tabayag", "Talaga", "Talaytay", "Talo-ot", "Tiguib", "Tulang", "Tulic", "Ubaub", "Usmad",
];

export function canonicalBarangay(value: string): string {
  const name = value.trim().replace(/^(?:barangay|brgy\.?)\s+/i, "");
  return ARGAO_BARANGAY_NAMES.find((item) => item.toLowerCase() === name.toLowerCase()) || "";
}

type LocationInput = { location?: string | null; barangay?: string | null; latitude?: unknown; longitude?: unknown };

export function hasReportCoordinates(report: LocationInput): boolean {
  const valid = (value: unknown, limit: number) => (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;
  return valid(report.latitude, 90) && valid(report.longitude, 180);
}

export function pointInRing(x: number, y: number, ring: number[][]): number {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax = 0, ay = 0] = ring[j]!;
    const [bx = 0, by = 0] = ring[i]!;
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) <= 1e-12 && x >= Math.min(ax, bx) - 1e-10 && x <= Math.max(ax, bx) + 1e-10 && y >= Math.min(ay, by) - 1e-10 && y <= Math.max(ay, by) + 1e-10) return 0;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? 1 : -1;
}

export function barangaysAtCoordinates(latitude: unknown, longitude: unknown): string[] {
  if (!hasReportCoordinates({ latitude, longitude })) return [];
  const x = Number(longitude);
  const y = Number(latitude);
  return boundaries.features.filter(({ bounds, polygons }) => {
    const [west = 0, south = 0, east = 0, north = 0] = bounds;
    if (x < west || x > east || y < south || y > north) return false;
    return polygons.some(([outer, ...holes]) => outer && pointInRing(x, y, outer) >= 0 && !holes.some((hole) => pointInRing(x, y, hole) === 1));
  }).map(({ name }) => name);
}

export function deriveBarangay(location: string, coordinates?: LocationInput): string {
  let addressBarangay = canonicalBarangay(coordinates?.barangay || "");
  for (const segment of (location || "").split(",")) {
    const name = canonicalBarangay(segment);
    if (!addressBarangay && name) addressBarangay = name;
  }
  if (coordinates && hasReportCoordinates(coordinates)) {
    const matches = barangaysAtCoordinates(coordinates.latitude, coordinates.longitude);
    if (matches.length === 1) return matches[0]!;
    return matches.includes(addressBarangay) ? addressBarangay : "";
  }
  return addressBarangay;
}
