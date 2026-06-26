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
