import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { isValidPhone } from "./validation.js";

type Profile = { role?: string; first_name?: string | null; last_name?: string | null; user_name?: string | null;
  phone?: string | null; birthdate?: string | null; location?: string | null };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function validProfileBirthdate(value: unknown, now = new Date()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" && value <= now.toISOString().slice(0, 10);
}
export function missingProfileFields(profile: Profile, email: unknown, confirmedAddress?: string | null) {
  if (["admin", "super_admin"].includes(profile.role || "")) return [];
  const missing: string[] = [];
  if (!text(profile.first_name)) missing.push("First name");
  if (!text(profile.last_name)) missing.push("Last name");
  if (!text(profile.user_name)) missing.push("Username");
  if (!validProfileBirthdate(profile.birthdate)) missing.push("Birthdate");
  if (!isValidPhone(profile.phone)) missing.push("Contact number (11 digits)");
  if (!text(email)) missing.push("Email");
  if (!text(profile.location) || text(profile.location) !== text(confirmedAddress)) missing.push("Address & location permission");
  return missing;
}

export const profileCompletionService = {
  async check(userId: string, profile: Profile, email: unknown) {
    if (["admin", "super_admin"].includes(profile.role || "")) return { data: { complete: true, missing: [], locationConfirmed: false }, error: null };
    if (profile.role !== "user") return { data: null, error: "Account verification unavailable." };
    const result = await supabaseAdmin.from("profile_location_verifications").select("address").eq("user_id", userId).maybeSingle();
    if (result.error) return { data: null, error: "Profile location setup is unavailable. Please contact support." };
    const missing = missingProfileFields(profile, email, result.data?.address);
    return { data: { complete: missing.length === 0, missing,
      locationConfirmed: Boolean(text(profile.location) && text(profile.location) === text(result.data?.address)) }, error: null };
  },
  async saveLocation(userId: string, latitude: number, longitude: number, address: string) {
    const profile = await supabaseAdmin.from("profiles").update({ location: address }).eq("id", userId).select("id").maybeSingle();
    if (profile.error || !profile.data) return { error: "Could not save your address." };
    const proof = await supabaseAdmin.from("profile_location_verifications").upsert({ user_id: userId, latitude, longitude,
      address, confirmed_at: new Date().toISOString() }, { onConflict: "user_id" });
    return { error: proof.error ? "Could not confirm your address. Please retry the location lookup." : null };
  },
};
