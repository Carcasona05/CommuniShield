export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (email) => EMAIL_REGEX.test(String(email || "").trim());

export const isValidPhone = (phone) => /^\d{11}$/.test(String(phone || "").trim());

export const digitsOnly = (text) => String(text || "").replace(/\D/g, "").slice(0, 11);

export const passwordPolicyError = (value) => {
  if (!value) return "Password is required.";
  if (value.length < 8 || value.length > 16) return "Password must be 8 to 16 characters.";
  if (!/[A-Z]/.test(value)) return "Password must contain at least one uppercase letter.";
  if (!/\d/.test(value)) return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(value)) return "Password must contain at least one special character.";
  return "";
};

export const joinFullName = (parts) =>
  [parts?.firstName, parts?.middleName, parts?.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
