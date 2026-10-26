const BLOTTER_TEXT_FIELDS: Record<string, string> = {
  location: "location",
  incidentType: "incident_type",
  incidentDateTime: "incident_datetime",
  incidentDescription: "incident_description",
  actionTaken: "action_taken",
  blotterOfficer: "blotter_officer",
  requestedBy: "requested_by",
  certificationPurpose: "certification_purpose",
  issuanceDate: "issuance_date",
  issuanceCity: "issuance_city",
  issuanceProvince: "issuance_province",
  commanderName: "commander_name",
  commanderRank: "commander_rank",
  commanderPosition: "commander_position",
  // Retain support for existing records and callers without requiring these
  // unrelated fields in the police certification form.
  barangay: "barangay",
  complainantName: "complainant_name",
  complainantAge: "complainant_age",
  complainantContact: "complainant_contact",
  respondent: "respondent",
  reportedBy: "reported_by",
  dateReported: "date_reported",
  dateRecorded: "date_recorded",
};

// The database assigns entry/page numbers; office details are station-wide.
const REQUIRED_FIELDS = ["location", "incidentType", "incidentDescription", "actionTaken", "blotterOfficer"];

const validCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
};

export const buildBlotterUpdates = (
  body: Record<string, unknown>,
  creating = false,
): { error?: string; updates?: Record<string, unknown> } => {
  const values = { ...body };
  if (!("incidentDescription" in values) && typeof values.details === "string") values.incidentDescription = values.details;
  if (creating) {
    const missing = REQUIRED_FIELDS.filter((key) => typeof values[key] !== "string" || !String(values[key]).trim());
    if (missing.length) return { error: `Complete all required blotter fields: ${missing.join(", ")}.` };
  }
  const updates: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(BLOTTER_TEXT_FIELDS)) {
    if (!(key in values)) continue;
    const value = values[key];
    if (typeof value !== "string") return { error: `${key} must be text.` };
    const trimmed = value.trim();
    if (REQUIRED_FIELDS.includes(key) && !trimmed) return { error: `${key} is required.` };
    if (trimmed && key === "issuanceDate" && !validCalendarDate(trimmed)) {
      return { error: "issuanceDate must be a valid date using YYYY-MM-DD." };
    }
    if (trimmed && ["incidentDateTime", "dateReported", "dateRecorded"].includes(key)) {
      const validTime = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(trimmed);
      if (!validTime || !validCalendarDate(trimmed.slice(0, 10)) || Number.isNaN(new Date(trimmed).getTime())) {
        return { error: `${key} must be a valid date and time.` };
      }
    }
    updates[column] = trimmed || null;
  }
  if (Object.keys(updates).length === 0) return { error: "No blotter fields to update." };
  return { updates };
};
