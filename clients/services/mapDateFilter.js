export const MAP_DATE_PERIODS = ["All dates", "Today", "Past 7 days", "Past 30 days"];

export function createMapDateFilter(period = "All dates", now = new Date()) {
  const end = now.getTime();
  const day = 24 * 60 * 60 * 1000;
  const offset = 8 * 60 * 60 * 1000;
  // Argao's calendar day is always UTC+8, independent of the viewer's timezone.
  const start = period === "Today" ? Math.floor((end + offset) / day) * day - offset
    : period === "Past 7 days" ? end - 7 * day
      : period === "Past 30 days" ? end - 30 * day : null;

  return createdAt => {
    if (start === null) return true;
    const date = Date.parse(createdAt);
    return Number.isFinite(date) && date >= start && date <= end;
  };
}
