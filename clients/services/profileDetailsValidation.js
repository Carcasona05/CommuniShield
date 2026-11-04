export function profileDetailsMissing(details, dateString) {
  const missing = [];
  if (!details.firstName?.trim()) missing.push("First name");
  if (!details.lastName?.trim()) missing.push("Last name");
  if (!details.username?.trim()) missing.push("Username");
  const value = dateString(details.birthdate);
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value || value < "1900-01-01" || value > new Date().toISOString().slice(0, 10)) missing.push("Birthdate");
  if (!/^\d{11}$/.test(details.contactNumber || "")) missing.push("Contact number (11 digits)");
  if (!details.email?.trim()) missing.push("Email");
  if (!details.location?.trim() || details.location.length > 500 || details.locationConfirmed !== true) missing.push("Address & location permission");
  return missing;
}
