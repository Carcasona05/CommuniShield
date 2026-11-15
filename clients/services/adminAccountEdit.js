const EDITABLE_FIELDS = ["name", "email", "role", "department", "phone"];

export function adminEditValues(admin = {}) {
  return Object.fromEntries(EDITABLE_FIELDS.map(key => [key,
    key === "email" ? String(admin[key] || "").trim().toLowerCase() : String(admin[key] || "").trim(),
  ]));
}

// Compare current values, not whether a field was ever touched. Sending only
// changed editable fields also avoids overwriting a newer account status.
export function adminEditChanges(original, draft) {
  if (!original?.id || original.id !== draft?.id) return {};
  const before = adminEditValues(original), after = adminEditValues(draft);
  return Object.fromEntries(EDITABLE_FIELDS.filter(key => before[key] !== after[key]).map(key => [key, after[key]]));
}
