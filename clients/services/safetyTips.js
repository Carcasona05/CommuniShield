export const SAFETY_RADIUS_KM = 2;
export const SAFETY_REPORT_MAX_AGE_DAYS = 7;

const severityRank = { Unknown: 0, Low: 1, Medium: 2, High: 3, Critical: 4 };
const inactiveStatuses = new Set(["resolved", "rejected", "archived", "marked fake", "fake"]);

export function normalizeSeverity(value) {
  const severity = String(value || "").trim().toLowerCase();
  if (severity === "moderate") return "Medium";
  return Object.keys(severityRank).find((key) => key.toLowerCase() === severity) || "Unknown";
}

export function formatSafetyReportAge(dateValue, now = Date.now()) {
  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

const validCoordinate = (value, limit) =>
  value !== null && value !== undefined && String(value).trim() !== "" &&
  Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;

export function safetyDistanceKm(lat1, lng1, lat2, lng2) {
  const radians = (value) => value * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) *
    Math.sin(radians(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function tipsForIncident(incidentType, severity) {
  const type = String(incidentType || "").toLowerCase();
  let advice;
  if (/fire/.test(type)) {
    advice = "Keep away from smoke and flames. Use a clear exit route and do not enter affected buildings.";
  } else if (/flood|drainage/.test(type)) {
    advice = "Avoid floodwater and flooded roads. Move to higher ground by a safe route and stay away from fallen power lines.";
  } else if (/accident|driving|parking|road obstruction|traffic/.test(type)) {
    advice = "Use an alternate route where possible. Stay clear of the roadway and leave access open for responders.";
  } else if (/theft|robbery|shoplifting/.test(type)) {
    advice = "Keep valuables out of sight and secure your belongings. Use well-lit, busy routes; do not pursue or confront anyone.";
  } else if (/assault|harassment|disturbance|violence/.test(type)) {
    advice = "Keep your distance and move toward a staffed, public place. Avoid confrontation and ask someone you trust for help.";
  } else if (/unattended|abandoned object/.test(type)) {
    advice = "Do not touch or move the object. Keep your distance and notify local authorities from a safe location.";
  } else if (/suspicious|trespass|loitering|unusual behavior/.test(type)) {
    advice = "Stay in well-lit, populated areas. Do not approach or investigate; report concerning behavior from a safe place.";
  } else if (/streetlight/.test(type)) {
    advice = "Choose a well-lit alternate route, watch your footing, and avoid isolated areas after dark.";
  } else if (/garbage|sanitation/.test(type)) {
    advice = "Avoid contact with waste or contaminated water. Keep children and pets away and wash hands after possible exposure.";
  } else if (/vandalism|property damage/.test(type)) {
    advice = "Stay clear of damaged structures, broken glass, and exposed wiring. Do not confront anyone damaging property.";
  } else if (/scam|online|cyber|misinformation/.test(type)) {
    advice = "Verify information through official sources. Do not share passwords, verification codes, or money with unknown contacts.";
  } else if (/missing pet/.test(type)) {
    advice = "Do not chase or corner an unfamiliar animal. Share sightings with the owner or local authorities from a safe distance.";
  } else if (/lost/.test(type)) {
    advice = "Check your belongings and avoid sharing personal details publicly. Turn found items over to a trusted local office.";
  } else {
    advice = "Stay aware of your surroundings, keep a safe distance from the reported area, and follow official local guidance.";
  }

  const level = normalizeSeverity(severity);
  const urgency = level === "Critical"
    ? "Avoid entering the affected area. If you are nearby, move away if safe and follow emergency instructions."
    : level === "High"
      ? "Reduce time in the affected area and plan a safer route. Follow instructions from local responders."
      : level === "Medium"
        ? "Use extra caution and consider an alternate route while checking official updates."
        : level === "Low"
          ? "Stay observant and take these precautions without approaching the incident."
          : "Use caution and check official updates for more information about the reported incident.";
  return [advice, urgency];
}

export function buildNearbySafety(reports, position, now = Date.now()) {
  if (!Array.isArray(position) || !validCoordinate(position[0], 90) || !validCoordinate(position[1], 180)) return null;
  const cutoff = now - SAFETY_REPORT_MAX_AGE_DAYS * 86400000;
  const nearby = (reports || []).flatMap((report) => {
    if (inactiveStatuses.has(String(report.status || "").trim().toLowerCase())) return [];
    if (!validCoordinate(report.latitude, 90) || !validCoordinate(report.longitude, 180)) return [];
    const postedAt = new Date(report.datePosted ?? report.created_at).getTime();
    if (!Number.isFinite(postedAt) || postedAt < cutoff || postedAt > now) return [];
    const distanceKm = safetyDistanceKm(Number(position[0]), Number(position[1]), Number(report.latitude), Number(report.longitude));
    if (distanceKm > SAFETY_RADIUS_KM) return [];
    const severity = normalizeSeverity(report.severity);
    const incidentType = report.incidentType || report.incident_type || "Reported incident";
    return [{ ...report, incidentType, severity, distanceKm, postedAt }];
  });
  nearby.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] ||
    a.distanceKm - b.distanceKm || b.postedAt - a.postedAt);
  if (!nearby.length) return null;

  // Keep the strongest advice for each incident type, rather than repeating it.
  const seenTypes = new Set();
  const incidents = nearby.filter((report) => {
    const key = report.incidentType.toLowerCase().trim();
    if (seenTypes.has(key)) return false;
    seenTypes.add(key);
    return true;
  }).slice(0, 3).map((report) => ({
    ...report,
    tips: tipsForIncident(report.incidentType, report.severity),
  }));
  const latestReportedAt = Math.max(...nearby.map((report) => report.postedAt));
  return { count: nearby.length, highestSeverity: nearby[0].severity, latestReportedAt, incidents };
}
