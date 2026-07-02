const APP_ID_PATTERN = /^([a-z]+)0*(\d+)$/;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSearchText(value: unknown) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactSearchText(value: unknown) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

export function searchTextVariants(value: unknown) {
  const raw = clean(value);
  const normalized = normalizeSearchText(raw);
  const compact = compactSearchText(raw);
  const variants = new Set<string>();

  [raw, normalized, compact].forEach((item) => {
    const cleaned = item.trim();
    if (cleaned) variants.add(cleaned);
  });

  const compactWithWordBreaks = compact
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .trim();
  if (compactWithWordBreaks) variants.add(compactWithWordBreaks);

  const appIdMatch = compact.match(APP_ID_PATTERN);
  if (appIdMatch) {
    const [, prefix, numeric] = appIdMatch;
    const padded = numeric.padStart(3, "0");
    [numeric, padded].forEach((suffix) => {
      variants.add(`${prefix}${suffix}`);
      variants.add(`${prefix}-${suffix}`);
      variants.add(`${prefix} ${suffix}`);
    });
  }

  return Array.from(variants);
}

export function valuesMatchSearch(
  values: Array<string | number | null | undefined>,
  search?: string | null,
) {
  const normalizedQuery = normalizeSearchText(search);
  if (!normalizedQuery) return true;

  const compactQuery = compactSearchText(search);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const haystacks = values.flatMap((value) => {
    const normalized = normalizeSearchText(value == null ? "" : String(value));
    if (!normalized) return [];
    return [normalized, normalized.replace(/\s+/g, "")];
  });

  if (!haystacks.length) return false;
  if (compactQuery && haystacks.some((text) => text.includes(compactQuery))) {
    return true;
  }

  return queryTokens.every((token) =>
    haystacks.some((text) => text.includes(token)),
  );
}
