export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAppId(value: unknown) {
  return cleanText(value).replace(/\s+/g, "").toUpperCase();
}

export function normalizePackageName(value: unknown) {
  return cleanText(value).toLowerCase();
}

export function normalizeBundleId(value: unknown) {
  return cleanText(value);
}

export function normalizeLocale(value: unknown) {
  const cleaned = cleanText(value).replace(/_/g, "-").toLowerCase();
  return cleaned.replace(/[^a-z0-9-]/g, "");
}

export function primaryLocaleCode(value: unknown) {
  return normalizeLocale(value).split("-")[0] || "";
}

export function normalizeDeviceId(value: unknown) {
  return cleanText(value);
}

export function normalizeFirebaseProjectId(value: unknown) {
  return cleanText(value);
}
