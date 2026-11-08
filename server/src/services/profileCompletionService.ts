import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { isValidPhone } from "./validation.js";
import { parseProfileAddress } from "./profileAddressService.js";

type Profile = { role?: string; first_name?: string | null; last_name?: string | null; user_name?: string | null;
  phone?: string | null; birthdate?: string | null; location?: string | null };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function profileBirthdateCutoff(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map(part => [part.type, part.value]));
  const year = Number(parts.year) - 16;
  const month = Number(parts.month);
  const day = Math.min(Number(parts.day), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function validProfileBirthdate(value: unknown, now = new Date()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" && value <= profileBirthdateCutoff(now);
}
export function missingProfileFields(profile: Profile, email: unknown) {
  if (["admin", "super_admin"].includes(profile.role || "")) return [];
  const missing: string[] = [];
  if (!text(profile.first_name)) missing.push("First name");
  if (!text(profile.last_name)) missing.push("Last name");
  if (!text(profile.user_name)) missing.push("Username");
  if (!validProfileBirthdate(profile.birthdate)) missing.push("Birthdate");
  if (!isValidPhone(profile.phone)) missing.push("Contact number (11 digits)");
  if (!text(email)) missing.push("Email");
  if (parseProfileAddress(profile.location).error) missing.push("Address");
  return missing;
}

export const profileCompletionService = {
  async check(userId: string, profile: Profile, email: unknown) {
    void userId;
    if (["admin", "super_admin"].includes(profile.role || "")) return { data: { complete: true, missing: [], locationConfirmed: false }, error: null };
    if (profile.role !== "user") return { data: null, error: "Account verification unavailable." };
    const missing = missingProfileFields(profile, email);
    return { data: { complete: missing.length === 0, missing,
      locationConfirmed: false, addressSource: "user-provided" }, error: null };
  },
  async saveAddress(userId: string, address: { location: string }) {
    const profile = await supabaseAdmin.from("profiles").update(address).eq("id", userId).select("id").maybeSingle();
    if (profile.error || !profile.data) return { error: "Could not save your address." };
    return { error: null };
  },
};
