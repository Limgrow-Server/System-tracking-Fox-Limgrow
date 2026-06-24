import {
  clean,
  corsHeaders,
  createAdminClient,
  jsonResponse as json,
  resolveMobileAppConfig,
  type MobilePlatform,
  type SupabaseAdminClient,
} from "../_shared/edge-config.ts";
import { requirePublicApiKey } from "../_shared/mobile-api-auth.ts";
import { sha256Hex } from "../_shared/mobile-crypto.ts";
import {
  normalizeAppId,
  normalizeBundleId,
  normalizeDeviceId,
  normalizeLocale,
  normalizePackageName,
  primaryLocaleCode,
} from "../_shared/mobile-normalize.ts";

type NotificationEventRequest = {
  action?: string;
  appId?: string;
  app_id?: string;
  appVersion?: string;
  bundleId?: string;
  deviceId?: string;
  eventType?: string;
  fcmToken?: string;
  locale?: string;
  languageCode?: string;
  language_code?: string;
  metadata?: unknown;
  notificationId?: string;
  notificationJobId?: string;
  osVersion?: string;
  packageName?: string;
  platform?: MobilePlatform;
  productAppId?: string;
  providerMessageId?: string;
  messageId?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenColumns =
  "id,device_id,platform,app_id,product_app_id,package_name,bundle_id,locale,status,fcm_token,token_hash";

function requestAppId(payload: NotificationEventRequest) {
  return normalizeAppId(payload.appId) || normalizeAppId(payload.app_id);
}

function requestLocale(payload: NotificationEventRequest) {
  return normalizeLocale(payload.locale) || normalizeLocale(payload.languageCode) || normalizeLocale(payload.language_code);
}

function inferPlatform(payload: NotificationEventRequest): MobilePlatform {
  if (payload.platform === "ios" || payload.platform === "android") return payload.platform;
  if (normalizeBundleId(payload.bundleId)) return "ios";
  return "android";
}

function normalizeEventType(value: unknown) {
  const event = clean(value).toLowerCase().replace(/[\s-]+/g, "_");

  if (["open", "opened", "tap", "clicked", "notification_open", "notification_tap", "notification_clicked"].includes(event)) {
    return "notification_opened";
  }

  if (["receive", "received", "delivery", "delivered", "notification_received", "notification_delivered"].includes(event)) {
    return "notification_received";
  }

  if (["impression", "display", "displayed", "shown", "notification_impression", "notification_displayed", "notification_shown"].includes(event)) {
    return "notification_impression";
  }

  return event || "notification_opened";
}

function eventStatus(eventType: string) {
  if (eventType.includes("open")) return "opened";
  if (eventType.includes("impression") || eventType.includes("display") || eventType.includes("shown")) return "impression";
  if (eventType.includes("received") || eventType.includes("delivered")) return "received";
  return "logged";
}

function objectMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function uuidOrNull(value: unknown) {
  const cleaned = clean(value);
  return uuidPattern.test(cleaned) ? cleaned : null;
}

async function findDeviceToken(
  supabase: SupabaseAdminClient,
  payload: NotificationEventRequest,
  platform: MobilePlatform,
  tokenHash: string | null
) {
  if (tokenHash) {
    const { data, error } = await supabase
      .from("device_tokens")
      .select(tokenColumns)
      .eq("platform", platform)
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as Record<string, unknown>;
  }

  const deviceId = normalizeDeviceId(payload.deviceId);
  if (!deviceId) return null;

  let query = supabase
    .from("device_tokens")
    .select(tokenColumns)
    .eq("platform", platform)
    .eq("device_id", deviceId)
    .limit(1);

  const appId = requestAppId(payload) || normalizeAppId(payload.productAppId);
  const packageName = normalizePackageName(payload.packageName);
  const bundleId = normalizeBundleId(payload.bundleId);

  if (appId) {
    query = query.or(`app_id.eq.${appId},product_app_id.eq.${appId}`);
  } else if (platform === "android" && packageName) {
    query = query.eq("package_name", packageName);
  } else if (platform === "ios" && bundleId) {
    query = query.eq("bundle_id", bundleId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? data as Record<string, unknown> : null;
}

async function touchDeviceToken(
  supabase: SupabaseAdminClient,
  device: Record<string, unknown> | null,
  locale: string
) {
  const id = clean(device?.id);
  if (!id) return;

  const updatePayload: Record<string, unknown> = {
    last_seen_at: new Date().toISOString(),
  };
  if (locale) updatePayload.locale = locale;

  const { error } = await supabase.from("device_tokens").update(updatePayload).eq("id", id);
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const authError = requirePublicApiKey(request);
  if (authError) return authError;

  try {
    const payload = (await request.json()) as NotificationEventRequest;
    const platform = inferPlatform(payload);
    const appId = requestAppId(payload);
    const productAppId = normalizeAppId(payload.productAppId) || appId;
    const packageName = normalizePackageName(payload.packageName);
    const bundleId = normalizeBundleId(payload.bundleId);
    const locale = requestLocale(payload);
    const eventType = normalizeEventType(payload.eventType ?? payload.action);
    const providerMessageId = clean(payload.providerMessageId) || clean(payload.messageId) || null;
    const notificationId = clean(payload.notificationJobId) || clean(payload.notificationId) || providerMessageId || appId || productAppId || packageName || bundleId;

    if (!notificationId) {
      return json({ ok: false, error: "notification_id_or_app_identifier_required" }, 400);
    }

    const supabase = createAdminClient();
    const app = await resolveMobileAppConfig(supabase, {
      appId,
      appName: productAppId,
      bundleId,
      packageName,
      platform,
      productAppId,
    });
    const fcmToken = clean(payload.fcmToken);
    const tokenHash = fcmToken ? await sha256Hex(fcmToken) : null;
    const device = await findDeviceToken(supabase, payload, platform, tokenHash);
    const deviceId = clean(device?.device_id) || normalizeDeviceId(payload.deviceId) || null;

    await touchDeviceToken(supabase, device, locale);

    const metadata = {
      ...objectMetadata(payload.metadata),
      appId: app?.appId ?? appId ?? null,
      appMappingId: app?.id ?? null,
      appName: app?.appName ?? null,
      appVersion: clean(payload.appVersion) || null,
      bundleId: app?.bundleId ?? bundleId ?? null,
      deviceTokenId: clean(device?.id) || null,
      fcmToken: fcmToken || clean(device?.fcm_token) || null,
      locale: locale || clean(device?.locale) || null,
      localeCode: primaryLocaleCode(locale || clean(device?.locale)),
      osVersion: clean(payload.osVersion) || null,
      packageName: app?.packageName ?? packageName ?? null,
      productAppId: productAppId || clean(device?.product_app_id) || null,
      source: "mobile",
      tokenHash,
    };

    const { data, error } = await supabase
      .from("notification_events")
      .insert({
        notification_id: notificationId,
        job_id: uuidOrNull(payload.notificationJobId) || uuidOrNull(payload.notificationId),
        event_type: eventType,
        device_id: deviceId,
        platform,
        target_type: "device",
        target_value: deviceId,
        status: eventStatus(eventType),
        provider_message_id: providerMessageId,
        metadata,
      })
      .select("*")
      .single();

    if (error) throw error;

    return json({
      ok: true,
      event: data,
      matchedDevice: Boolean(device),
      normalized: {
        appId: app?.appId ?? appId ?? null,
        bundleId: app?.bundleId ?? bundleId ?? null,
        deviceId,
        locale: locale || clean(device?.locale) || null,
        packageName: app?.packageName ?? packageName ?? null,
        platform,
      },
    });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown notification-event error",
    }, 500);
  }
});
