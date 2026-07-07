import { NextResponse } from "next/server";

import { ApiError, unknownToApiError } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import type { DeviceTokenRequest } from "@/lib/server/services/mobile/device-token.service";
import {
  enqueueDeviceTokenIngest,
  enqueueNotificationEventIngest,
} from "@/lib/server/services/mobile/mobile-ingest-queue.service";
import type { MobilePlatform } from "@/lib/server/services/mobile/mobile-shared";
import type { NotificationEventRequest } from "@/lib/server/services/mobile/notification-event.service";

const mobileCorsHeaders = {
  "access-control-allow-headers": "authorization, x-client-info, apikey, x-api-key, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
};

function splitKeys(value: string | null | undefined) {
  if (!value) return [];

  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function publicApiKeysFromDictionary() {
  const raw = process.env.SUPABASE_PUBLISHABLE_KEYS ?? process.env.SUPABASE_API_KEYS;
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
    ...splitKeys(process.env.MOBILE_DEVICE_TOKEN_API_KEYS),
    ...splitKeys(process.env.MOBILE_NOTIFICATION_EVENT_API_KEYS),
    ...publicApiKeysFromDictionary(),
    clean(process.env.SUPABASE_PUBLISHABLE_KEY),
    clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    clean(process.env.SUPABASE_ANON_KEY),
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

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: mobileCorsHeaders,
    status,
  });
}

function requirePublicApiKey(request: Request) {
  const apiKey = requestApiKey(request);
  if (!apiKey) {
    return jsonResponse({ ok: false, error: "apikey_required" }, 401);
  }

  const acceptedKeys = configuredPublicApiKeys();
  if (!acceptedKeys.length) {
    return jsonResponse({ ok: false, error: "public_api_key_not_configured" }, 500);
  }

  if (!acceptedKeys.includes(apiKey)) {
    return jsonResponse({ ok: false, error: "invalid_apikey" }, 401);
  }

  return null;
}

function errorJson(error: unknown, fallbackMessage: string) {
  const apiError = error instanceof ApiError ? error : unknownToApiError(error, fallbackMessage);

  return jsonResponse(
    { ok: false, error: apiError.message },
    apiError.status,
  );
}

export function handleMobileOptions() {
  return new Response("ok", { headers: mobileCorsHeaders });
}

export async function handleMobileDeviceTokenPost(request: Request, platform: MobilePlatform) {
  const authError = requirePublicApiKey(request);
  if (authError) return authError;

  try {
    const payload = await parseJsonBody<DeviceTokenRequest>(request);
    return jsonResponse(await enqueueDeviceTokenIngest(payload, platform));
  } catch (error) {
    console.error(`[mobile-device-token-${platform}] request failed`, {
      error: error instanceof Error ? error.message : String(error),
    });

    return errorJson(error, `Unknown device-token-${platform} error`);
  }
}

export async function handleMobileNotificationEventPost(request: Request) {
  const authError = requirePublicApiKey(request);
  if (authError) return authError;

  try {
    const payload = await parseJsonBody<NotificationEventRequest>(request);
    return jsonResponse(await enqueueNotificationEventIngest(payload));
  } catch (error) {
    console.error("[mobile-notification-event] request failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return errorJson(error, "Unknown notification-event error");
  }
}
