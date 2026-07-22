export type StoreProviderEndpointKey =
  | "adjust"
  | "androidPublisher"
  | "appStoreConnect"
  | "appleStoreKitProduction"
  | "appleStoreKitSandbox"
  | "firebaseFcm"
  | "ga4DebugMeasurement"
  | "ga4Measurement"
  | "googleOAuthToken";

export type StoreProviderEndpointContext = {
  appId?: string | null;
  appIdentifier?: string | null;
  bundleId?: string | null;
  firebaseAppId?: string | null;
  firebaseProjectId?: string | null;
  packageName?: string | null;
  platform?: string | null;
  productAppId?: string | null;
  projectId?: string | null;
  storeAccountName?: string | null;
  storeProfileId?: string | null;
};

type EndpointMap = Partial<Record<StoreProviderEndpointKey, string>>;
type JsonRecord = Record<string, unknown>;

type StoreProviderEndpointConfig = {
  apps: Record<string, EndpointMap>;
  default: EndpointMap;
  stores: Record<string, EndpointMap>;
};

const EMPTY_CONFIG: StoreProviderEndpointConfig = {
  apps: {},
  default: {},
  stores: {},
};

const ENDPOINT_ALIASES: Record<StoreProviderEndpointKey, string[]> = {
  adjust: ["adjust", "adjustBaseUrl", "adjustEndpoint", "adjustS2s"],
  androidPublisher: [
    "androidPublisher",
    "androidPublisherBaseUrl",
    "googlePlay",
    "googlePlayBaseUrl",
    "googlePlayDeveloper",
  ],
  appStoreConnect: [
    "appStoreConnect",
    "appStoreConnectBaseUrl",
    "appleAppStoreConnect",
  ],
  appleStoreKitProduction: [
    "appleStoreKitProduction",
    "appleStoreKitProductionBaseUrl",
    "appleStoreKit",
    "appleStoreKitBaseUrl",
    "storeKitProduction",
  ],
  appleStoreKitSandbox: [
    "appleStoreKitSandbox",
    "appleStoreKitSandboxBaseUrl",
    "storeKitSandbox",
  ],
  firebaseFcm: ["firebaseFcm", "firebaseFcmBaseUrl", "fcm", "fcmBaseUrl"],
  ga4DebugMeasurement: [
    "ga4DebugMeasurement",
    "ga4DebugMeasurementBaseUrl",
    "ga4Debug",
    "ga4DebugBaseUrl",
  ],
  ga4Measurement: [
    "ga4Measurement",
    "ga4MeasurementBaseUrl",
    "googleAnalyticsMeasurement",
    "googleAnalyticsMeasurementBaseUrl",
  ],
  googleOAuthToken: [
    "googleOAuthToken",
    "googleOAuthTokenBaseUrl",
    "googleOAuth",
    "googleOAuthBaseUrl",
    "oauth2",
    "oauth2BaseUrl",
  ],
};

let cachedRawConfig = "";
let cachedConfig = EMPTY_CONFIG;
let warnedInvalidConfig = false;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = clean(process.env[name]);
    if (value) return value;
  }

  return "";
}

function normalizeLookupKey(value: unknown) {
  return clean(value).toLowerCase();
}

function endpointMapFromRecord(record: unknown): EndpointMap {
  if (!isRecord(record)) return {};

  const normalized: EndpointMap = {};
  for (const key of Object.keys(
    ENDPOINT_ALIASES,
  ) as StoreProviderEndpointKey[]) {
    for (const alias of ENDPOINT_ALIASES[key]) {
      const value = clean(record[alias]);
      if (value) {
        normalized[key] = value;
        break;
      }
    }
  }

  return normalized;
}

function endpointMapSection(section: unknown) {
  if (!isRecord(section)) return {};

  const normalized: Record<string, EndpointMap> = {};
  for (const [key, value] of Object.entries(section)) {
    const lookupKey = normalizeLookupKey(key);
    const endpointMap = endpointMapFromRecord(value);
    if (lookupKey && Object.keys(endpointMap).length) {
      normalized[lookupKey] = endpointMap;
    }
  }

  return normalized;
}

function parseConfig(raw: string): StoreProviderEndpointConfig {
  if (!raw) return EMPTY_CONFIG;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return EMPTY_CONFIG;

    const nestedDefaults = endpointMapFromRecord(parsed.default);
    const topLevelDefaults = endpointMapFromRecord(parsed);

    return {
      apps: {
        ...endpointMapSection(parsed.apps),
        ...endpointMapSection(parsed.applications),
        ...endpointMapSection(parsed.packages),
        ...endpointMapSection(parsed.bundles),
        ...endpointMapSection(parsed.projects),
      },
      default: {
        ...topLevelDefaults,
        ...nestedDefaults,
      },
      stores: {
        ...endpointMapSection(parsed.stores),
        ...endpointMapSection(parsed.storeProfiles),
        ...endpointMapSection(parsed.androidStores),
        ...endpointMapSection(parsed.iosStores),
      },
    };
  } catch (error) {
    if (!warnedInvalidConfig) {
      warnedInvalidConfig = true;
      console.warn(
        "[store-provider-endpoints] Invalid outbound endpoint JSON",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
    return EMPTY_CONFIG;
  }
}

function readConfig() {
  const raw = firstEnv(
    "STORE_OUTBOUND_ENDPOINTS_JSON",
    "STORE_PROVIDER_ENDPOINTS_JSON",
    "STORE_OUTBOUND_PROXY_CONFIG_JSON",
  );

  if (raw === cachedRawConfig) return cachedConfig;

  cachedRawConfig = raw;
  cachedConfig = parseConfig(raw);
  warnedInvalidConfig = false;

  return cachedConfig;
}

function uniqueNormalizedKeys(values: unknown[]) {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const key = normalizeLookupKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }

  return keys;
}

function mergeEndpointMaps(
  base: EndpointMap,
  section: Record<string, EndpointMap>,
  keys: string[],
) {
  const merged = { ...base };
  for (const key of keys) {
    Object.assign(merged, section[key] ?? {});
  }

  return merged;
}

export function storeProviderEndpointBaseUrl(
  key: StoreProviderEndpointKey,
  context: StoreProviderEndpointContext = {},
) {
  const config = readConfig();
  const storeKeys = uniqueNormalizedKeys([
    context.storeProfileId,
    context.storeAccountName,
  ]);
  const appKeys = uniqueNormalizedKeys([
    context.appId,
    context.productAppId,
    context.appIdentifier,
    context.packageName,
    context.bundleId,
    context.firebaseAppId,
    context.firebaseProjectId,
    context.projectId,
  ]);

  const storeResolved = mergeEndpointMaps(
    config.default,
    config.stores,
    storeKeys,
  );
  const appResolved = mergeEndpointMaps(storeResolved, config.apps, appKeys);

  return clean(appResolved[key]);
}

function mergedSearch(base: URL, original: URL) {
  const searchParams = new URLSearchParams(base.search);
  original.searchParams.forEach((value, key) => {
    searchParams.append(key, value);
  });

  return searchParams.toString();
}

function normalizedPath(pathname: string) {
  return pathname === "/" ? "" : pathname.replace(/\/+$/, "");
}

function urlAlreadyTargetsOverride(original: URL, override: URL) {
  if (original.origin !== override.origin) return false;

  const overridePath = normalizedPath(override.pathname);
  return (
    !overridePath ||
    original.pathname === overridePath ||
    original.pathname.startsWith(`${overridePath}/`)
  );
}

export function rewriteStoreProviderUrl(
  key: StoreProviderEndpointKey,
  originalUrl: string | URL,
  context: StoreProviderEndpointContext = {},
) {
  const original =
    typeof originalUrl === "string"
      ? new URL(originalUrl)
      : new URL(originalUrl.toString());
  const endpointBase = storeProviderEndpointBaseUrl(key, context);
  if (!endpointBase) return original.toString();

  const override = new URL(endpointBase);
  if (urlAlreadyTargetsOverride(original, override)) return original.toString();

  const basePath = normalizedPath(override.pathname);
  override.pathname = `${basePath}${original.pathname}` || "/";
  override.search = mergedSearch(override, original);
  override.hash = original.hash;

  return override.toString();
}
