export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAppId(value: unknown) {
  return cleanText(value).replace(/\s+/g, "").toLowerCase();
}

export function normalizePackageName(value: unknown) {
  return cleanText(value).toLowerCase();
}

export function normalizeBundleId(value: unknown) {
  return cleanText(value);
}

export function normalizeDeviceType(value: unknown) {
  return cleanText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase();
}

export function normalizeAppIdentifier(input: {
  appId?: unknown;
  bundleId?: unknown;
  packageName?: unknown;
  platform?: unknown;
  productAppId?: unknown;
}) {
  if (input.platform === "android") {
    return normalizePackageName(input.packageName)
      || normalizeAppId(input.productAppId)
      || normalizeAppId(input.appId);
  }

  if (input.platform === "ios") {
    return normalizeBundleId(input.bundleId)
      || normalizeAppId(input.productAppId)
      || normalizeAppId(input.appId);
  }

  return normalizePackageName(input.packageName)
    || normalizeBundleId(input.bundleId)
    || normalizeAppId(input.productAppId)
    || normalizeAppId(input.appId);
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
