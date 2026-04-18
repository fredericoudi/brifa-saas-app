export function normalizePhoneNumber(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function isValidPhoneNumber(value: string | null | undefined) {
  if (!value) return false;
  return /^\d{10,15}$/.test(value);
}
