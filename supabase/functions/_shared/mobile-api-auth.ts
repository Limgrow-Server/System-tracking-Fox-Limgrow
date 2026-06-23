import { clean, jsonResponse as json } from "./edge-config.ts";

function splitKeys(value: string | null | undefined) {
  if (!value) return [];

  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function publicApiKeysFromDictionary() {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? Deno.env.get("SUPABASE_API_KEYS");
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => clean(item)).filter(Boolean);
    }

    if (parsed && typeof parsed === "object") {
      return Object.values(parsed as Record<string, unknown>).map((item) => clean(item)).filter(Boolean);
    }
  } catch {
    return splitKeys(raw);
  }

  return [];
}

function configuredPublicApiKeys() {
  return Array.from(new Set([
    ...splitKeys(Deno.env.get("MOBILE_DEVICE_TOKEN_API_KEYS")),
    ...splitKeys(Deno.env.get("MOBILE_NOTIFICATION_EVENT_API_KEYS")),
    ...publicApiKeysFromDictionary(),
    clean(Deno.env.get("SUPABASE_PUBLISHABLE_KEY")),
    clean(Deno.env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")),
    clean(Deno.env.get("SUPABASE_ANON_KEY")),
  ].filter(Boolean)));
}

function bearerValue(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return clean(match?.[1]);
}

function requestApiKey(request: Request) {
  return clean(request.headers.get("apikey")) || clean(request.headers.get("x-api-key")) || bearerValue(request);
}

export function requirePublicApiKey(request: Request) {
  const apiKey = requestApiKey(request);
  if (!apiKey) {
    return json({ ok: false, error: "apikey_required" }, 401);
  }

  const acceptedKeys = configuredPublicApiKeys();
  if (!acceptedKeys.length) {
    return json({ ok: false, error: "public_api_key_not_configured" }, 500);
  }

  if (!acceptedKeys.includes(apiKey)) {
    return json({ ok: false, error: "invalid_apikey" }, 401);
  }

  return null;
}
