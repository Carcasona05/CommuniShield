export const BLOTTER_FORM_SECTIONS = [
  {
    title: "POLICE BLOTTER INFORMATION",
    fields: [
      { key: "incidentType", column: "incident_type", label: "Nature of Case / Incident", placeholder: "Nature of the recorded case or incident", required: true },
      { key: "incidentDateTime", column: "incident_datetime", label: "Date/Time of Occurrence", type: "datetime" },
      { key: "location", column: "location", label: "Place of Occurrence", placeholder: "Exact place of occurrence", required: true },
    ],
  },
  {
    title: "FACTS AND DISPOSITION",
    description: "Use an objective, chronological account based on the record. Separate narrative paragraphs with a blank line.",
    fields: [
      { key: "incidentDescription", column: "incident_description", label: "Facts of the Case", placeholder: "Detailed narrative from the official record", required: true, multiline: true },
      { key: "actionTaken", column: "action_taken", label: "Disposition", placeholder: "Recorded disposition or action taken", required: true, multiline: true },
      { key: "blotterOfficer", column: "blotter_officer", label: "Attended By", placeholder: "Attending officer's name", required: true },
    ],
  },
  {
    title: "PURPOSE AND ISSUANCE",
    fields: [
      { key: "requestedBy", column: "requested_by", label: "Requested By", placeholder: "Concerned person's full name" },
      { key: "certificationPurpose", column: "certification_purpose", label: "Intended Purpose", placeholder: "Purpose for requesting this certification" },
      { key: "issuanceDate", column: "issuance_date", label: "Date of Issuance", type: "date" },
    ],
  },
  {
    title: "SIGNATURE BLOCK",
    fields: [
      { key: "commanderName", column: "commander_name", label: "Commander's Full Name", placeholder: "Full name for the signature block" },
      { key: "commanderRank", column: "commander_rank", label: "Police Rank", placeholder: "Police rank, including the word Police" },
      { key: "commanderPosition", column: "commander_position", label: "Official Position", placeholder: "Official position" },
    ],
  },
];

const fields = BLOTTER_FORM_SECTIONS.flatMap((section) => section.fields);
const dateIsValid = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
};

export const getBlotterFormValues = (record = {}) => {
  const source = record || {};
  const values = Object.fromEntries(fields.map(({ key, column }) => [key, String(source[key] ?? source[column] ?? "")]));
  // Keep the existing complainant as the requester when editing older records.
  values.requestedBy = String(source.requestedBy ?? source.requested_by ?? source.complainantName ?? source.complainant_name ?? "");
  values.incidentDescription = String(source.incidentDescription ?? source.incident_description ?? source.details ?? "");
  if (values.incidentDateTime) {
    const parsed = new Date(values.incidentDateTime);
    // Stored timestamps have an offset; display them in local time for editing.
    // Already-local values are retained without manufacturing a date.
    if (/(?:Z|[+-]\d{2}:\d{2})$/.test(values.incidentDateTime) && !Number.isNaN(parsed.getTime())) {
      const pad = (value) => String(value).padStart(2, "0");
      values.incidentDateTime = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
    }
  }
  return values;
};

export const validateBlotterForm = (form) => {
  const errors = {};
  for (const { key, label, required } of fields) {
    if (required && !String(form[key] ?? "").trim()) errors[key] = `${label} is required.`;
  }
  const occurrence = String(form.incidentDateTime ?? "").trim();
  if (occurrence) {
    const [date, time] = occurrence.split("T");
    if (!dateIsValid(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "") || occurrence.split("T").length !== 2) {
      errors.incidentDateTime = "Select a valid occurrence date and time.";
    }
  }
  const issuance = String(form.issuanceDate ?? "").trim();
  if (issuance && !dateIsValid(issuance)) errors.issuanceDate = "Select a valid issuance date.";
  return errors;
};
