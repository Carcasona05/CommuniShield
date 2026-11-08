export function profileBirthdateCutoff(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map(part => [part.type, part.value]));
  const year = Number(parts.year) - 16;
  const month = Number(parts.month);
  const day = Math.min(Number(parts.day), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function validProfileBirthdate(value, now = new Date()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" && value <= profileBirthdateCutoff(now);
}

export function profileDetailsMissing(details, dateString, now = new Date()) {
  const missing = [];
  if (!details.firstName?.trim()) missing.push("First name");
  if (!details.lastName?.trim()) missing.push("Last name");
  if (!details.username?.trim()) missing.push("Username");
  const value = dateString(details.birthdate);
  if (!validProfileBirthdate(value, now)) missing.push("Birthdate");
  if (!/^\d{11}$/.test(details.contactNumber || "")) missing.push("Contact number (11 digits)");
  if (!details.email?.trim()) missing.push("Email");
  if (typeof details.location !== "string" || !details.location.trim() || details.location.trim().length > 500) missing.push("Address");
  return missing;
}

export function hasProfileDetailsChanges(saved, draft, dateString) {
  const text = value => String(value ?? "").trim();
  const fields = ["firstName", "middleName", "lastName", "username", "contactNumber", "location"];
  if (fields.some(field => text(saved[field]) !== text(draft[field]))) return true;
  // Date pickers create new Date instances even when the calendar day is the same.
  if (dateString(saved.birthdate) !== dateString(draft.birthdate)) return true;
  return false;
}
