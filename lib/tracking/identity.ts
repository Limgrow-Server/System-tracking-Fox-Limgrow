export function cleanIdentityText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAppId(value: unknown) {
  return cleanIdentityText(value).replace(/\s+/g, "").toLowerCase();
}

export function nullableAppId(value: unknown) {
  const normalized = normalizeAppId(value);
  return normalized || null;
}

export function normalizeAppleAppStoreId(value: unknown) {
  const cleaned = cleanIdentityText(value).replace(/\s+/g, "");
  return /^\d+$/.test(cleaned) ? cleaned : null;
}

export function parseAppleAppStoreIdFromUrl(value: unknown) {
  const text = cleanIdentityText(value);
  if (!text) return null;

  const pathMatch = text.match(/(?:^|\/)id(\d+)(?=$|[/?#&])/i);
  if (pathMatch?.[1]) return pathMatch[1];

  const queryMatch = text.match(/[?&]id=(\d+)(?=$|[&#])/i);
  return queryMatch?.[1] ?? null;
}

export function firstAppleAppStoreId(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeAppleAppStoreId(value);
    if (normalized) return normalized;

    const parsed = parseAppleAppStoreIdFromUrl(value);
    if (parsed) return parsed;
  }

  return null;
}

export function firstAppId(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeAppId(value);
    if (normalized) return normalized;
  }

  return null;
}

export function normalizeScopeKey(value: unknown) {
  return cleanIdentityText(value).toLowerCase();
}

export function normalizeScopeList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(value.map(normalizeScopeKey).filter(Boolean)),
  );
}
