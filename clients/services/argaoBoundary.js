import boundaries from "../constants/argaoBarangayBoundaries.json" with { type: "json" };

export const hasReportCoordinates = (report) => {
  const valid = (value, limit) => (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;
  return valid(report?.latitude, 90) && valid(report?.longitude, 180);
};

// -1 = outside, 0 = edge, 1 = inside. Holes must not count as land.
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) <= 1e-12 && x >= Math.min(ax, bx) - 1e-10 && x <= Math.max(ax, bx) + 1e-10 && y >= Math.min(ay, by) - 1e-10 && y <= Math.max(ay, by) + 1e-10) return 0;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? 1 : -1;
}

export function barangaysAtCoordinates(latitude, longitude) {
  if (!hasReportCoordinates({ latitude, longitude })) return [];
  const x = Number(longitude);
  const y = Number(latitude);
  return boundaries.features.filter(({ bounds: [west, south, east, north], polygons }) => {
    if (x < west || x > east || y < south || y > north) return false;
    return polygons.some(([outer, ...holes]) => pointInRing(x, y, outer) >= 0 && !holes.some((hole) => pointInRing(x, y, hole) === 1));
  }).map(({ name }) => name);
}
