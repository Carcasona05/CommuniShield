export const PROFILE_ADDRESS_MAX = 500;

export function parseProfileAddress(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > PROFILE_ADDRESS_MAX) {
    return { error: "Enter your full address (up to 500 characters), including barangay, city/municipality and province." };
  }
  return { data: { location: value.trim() }, error: null };
}
