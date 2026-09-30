export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (value: unknown): boolean =>
  typeof value === "string" && EMAIL_REGEX.test(value.trim());

export const isValidPhone = (value: unknown): boolean =>
  typeof value === "string" && /^\d{11}$/.test(value.trim());

export const passwordPolicyError = (value: unknown): string => {
  if (typeof value !== "string" || !value) return "Password is required.";
  if (value.length < 8 || value.length > 16) return "Password must be 8 to 16 characters.";
  if (!/[A-Z]/.test(value)) return "Password must contain at least one uppercase letter.";
  if (!/\d/.test(value)) return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(value)) return "Password must contain at least one special character.";
  return "";
};
