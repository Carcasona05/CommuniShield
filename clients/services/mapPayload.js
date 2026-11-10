// Only the fields needed by Leaflet. Full comments, images, narratives and
// analysis stay in React and are fetched only when a report is inspected.
export const mapPayload = reports => reports.map(({ id, latitude, longitude, severity, status, incident_type, location, ai_score }) =>
  ({ id, latitude, longitude, severity, status, incident_type, location, ai_score }));
