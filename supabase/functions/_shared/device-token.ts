import {
  clean,
  corsHeaders,
  createAdminClient,
  jsonResponse as json,
  resolveMobileAppConfig,
  type MobilePlatform,
  type StorePlatform,
  type SupabaseAdminClient,
} from "./edge-config.ts";
import { requirePublicApiKey } from "./mobile-api-auth.ts";
import { sha256Hex } from "./mobile-crypto.ts";
import {
  normalizeAppIdentifier,
  normalizeAppId,
  normalizeBundleId,
  normalizeDeviceId,
  normalizeDeviceType,
  normalizeFirebaseProjectId,
  normalizeLocale,
  normalizePackageName,
} from "./mobile-normalize.ts";

type DeviceTokenRequest = {
  action?: "register" | "heartbeat" | "unregister" | "mark_invalid";
  appId?: string;
  app_id?: string;
  productAppId?: string;
  storePlatform?: StorePlatform;
  platform?: MobilePlatform;
  packageName?: string;
  bundleId?: string;
  firebaseAppId?: string;
  firebaseProjectId?: string;
  fcmToken?: string;
  deviceId?: string;
  appVersion?: string;
  osVersion?: string;
  locale?: string;
  languageCode?: string;
  language_code?: string;
  deviceType?: string;
  device_type?: string;
  deviceModel?: string;
  deviceManufacturer?: string;
  errorCode?: string;
  errorDetail?: string;
};

const safeColumns =
  "id,user_id,app_id,device_id,platform,firebase_app_id,firebase_project_id,app_identifier,app_version,os_version,locale,status,last_seen_at,store_platform,store_account_name,product_app_id,package_name,bundle_id,device_type,device_model,device_manufacturer,created_at,updated_at";

const LAST_SEEN_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const trackedColumns = [
  "app_id",
  "app_identifier",
  "app_version",
  "bundle_id",
  "device_id",
  "device_manufacturer",
  "device_model",
  "device_type",
  "firebase_app_id",
  "firebase_project_id",
  "locale",
  "os_version",
  "package_name",
  "platform",
  "product_app_id",
  "store_account_name",
  "store_platform",
  "user_id",
];

function requestAppId(payload: DeviceTokenRequest) {
  return normalizeAppId(payload.appId) || normalizeAppId(payload.app_id);
}

function requestLocale(payload: DeviceTokenRequest) {
  return normalizeLocale(payload.locale) || normalizeLocale(payload.languageCode) || normalizeLocale(payload.language_code);
}

function inferredStorePlatform(platform: MobilePlatform): StorePlatform {
  return platform === "android" ? "google_play" : "apple_app_store";
}

async function findIntegration(
  supabase: SupabaseAdminClient,
  payload: DeviceTokenRequest,
  expectedPlatform: MobilePlatform
) {
  const appId = requestAppId(payload);
  const app = await resolveMobileAppConfig(supabase, {
    appId,
    appName: normalizeAppId(payload.productAppId) || appId,
    bundleId: normalizeBundleId(payload.bundleId),
    packageName: normalizePackageName(payload.packageName),
    platform: expectedPlatform,
    productAppId: normalizeAppId(payload.productAppId) || appId,
  });

  if (!app) return null;

  return {
    id: app.id,
    bundle_id: app.bundleId,
    firebase_app_id: null,
    firebase_project_id: null,
    package_name: app.packageName,
    platform: expectedPlatform,
    product_app_id: app.appId || app.appName,
    store_account_name: app.storeAccountName,
    store_platform: app.storePlatform,
  };
}

async function writeInvalidEvent(
  supabase: SupabaseAdminClient,
  payload: DeviceTokenRequest,
  platform: MobilePlatform,
  deviceId: string | null
) {
  await supabase.from("notification_events").insert({
    notification_id: requestAppId(payload) || normalizeAppId(payload.productAppId) || normalizePackageName(payload.packageName) || normalizeBundleId(payload.bundleId) || `device-token-${platform}`,
    event_type: "token_invalid",
    device_id: deviceId,
    platform,
    error_code: clean(payload.errorCode) || "client_mark_invalid",
    error_detail: clean(payload.errorDetail) || null,
    metadata: {
      productAppId: normalizeAppId(payload.productAppId) || null,
      appId: requestAppId(payload) || null,
      packageName: normalizePackageName(payload.packageName) || null,
      bundleId: normalizeBundleId(payload.bundleId) || null,
    },
  });
}

function validateAppIdentifier(payload: DeviceTokenRequest, expectedPlatform: MobilePlatform) {
  if (requestAppId(payload)) return null;
  if (normalizeAppId(payload.productAppId)) return null;
  if (expectedPlatform === "android" && normalizePackageName(payload.packageName)) return null;
  if (expectedPlatform === "ios" && normalizeBundleId(payload.bundleId)) return null;
  return expectedPlatform === "android" ? "app_id_or_package_name_required" : "app_id_or_bundle_id_required";
}

function errorRecord(error: unknown) {
  return error && typeof error === "object" && !Array.isArray(error)
    ? error as Record<string, unknown>
    : {};
}

function errorString(error: unknown, key: string) {
  const value = errorRecord(error)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deviceTokenError(error: unknown, expectedPlatform: MobilePlatform) {
  const message = error instanceof Error
    ? error.message
    : errorString(error, "message")
      ?? errorString(error, "error")
      ?? `Unknown device-token-${expectedPlatform} error`;
  const details = errorString(error, "details");
  const hint = errorString(error, "hint");
  const code = errorString(error, "code");

  return {
    code,
    details,
    error: message.slice(0, 500),
    hint,
  };
}

function comparable(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isLastSeenStale(value: unknown, nowMs: number) {
  const timestamp = Date.parse(comparable(value));
  return !Number.isFinite(timestamp)
    || nowMs - timestamp >= LAST_SEEN_REFRESH_INTERVAL_MS;
}

function changedColumns(
  existing: Record<string, unknown>,
  row: Record<string, unknown>,
) {
  return trackedColumns.filter((column) => comparable(existing[column]) !== comparable(row[column]));
}

function deviceTokenUpdatePayload(
  existing: Record<string, unknown>,
  row: Record<string, unknown>,
  now: string,
  nowMs: number,
) {
  const updatePayload: Record<string, unknown> = {};

  changedColumns(existing, row).forEach((column) => {
    updatePayload[column] = row[column];
  });

  if (comparable(existing.status) !== "active") {
    updatePayload.status = "active";
  }

  if (isLastSeenStale(existing.last_seen_at, nowMs)) {
    updatePayload.last_seen_at = now;
  }

  if (Object.keys(updatePayload).length) {
    updatePayload.updated_at = now;
  }

  return updatePayload;
}

function isUniqueViolation(error: unknown) {
  return errorString(error, "code") === "23505";
}

async function deactivatePreviousActiveTokens(
  supabase: SupabaseAdminClient,
  input: {
    currentId: string;
    deviceId: string;
    platform: MobilePlatform;
    row: Record<string, unknown>;
    updatedAt: string;
  },
) {
  if (!input.currentId || !input.deviceId) return;

  let query = supabase
    .from("device_tokens")
    .update({
      status: "inactive",
      updated_at: input.updatedAt,
    })
    .eq("platform", input.platform)
    .eq("device_id", input.deviceId)
    .eq("status", "active")
    .neq("id", input.currentId);

  if (comparable(input.row.app_identifier)) {
    query = query.eq("app_identifier", comparable(input.row.app_identifier));
  } else if (comparable(input.row.package_name)) {
    query = query.eq("package_name", comparable(input.row.package_name));
  } else if (comparable(input.row.bundle_id)) {
    query = query.eq("bundle_id", comparable(input.row.bundle_id));
  } else if (comparable(input.row.product_app_id)) {
    query = query.eq("product_app_id", comparable(input.row.product_app_id));
  } else if (comparable(input.row.app_id)) {
    query = query.eq("app_id", comparable(input.row.app_id));
  } else {
    return;
  }

  const { error } = await query;
  if (error) throw error;
}

export function serveDeviceToken(expectedPlatform: MobilePlatform) {
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
      const payload = (await request.json()) as DeviceTokenRequest;
      const action = payload.action ?? "register";
      const appId = requestAppId(payload);
      const fcmToken = clean(payload.fcmToken);
      const requestedDeviceId = normalizeDeviceId(payload.deviceId);

      if (payload.platform && payload.platform !== expectedPlatform) {
        return json({ ok: false, error: `use_device_token_${payload.platform}_endpoint` }, 400);
      }

      const identifierError = validateAppIdentifier(payload, expectedPlatform);
      if (identifierError) {
        return json({ ok: false, error: identifierError }, 400);
      }

      if ((action === "register" || action === "heartbeat") && !appId) {
        return json({ ok: false, error: "app_id_required" }, 400);
      }

      if (action === "register" && !fcmToken) {
        return json({ ok: false, error: "fcm_token_required" }, 400);
      }

      const supabase = createAdminClient();
      const integration = await findIntegration(supabase, payload, expectedPlatform);
      const tokenHash = fcmToken ? await sha256Hex(fcmToken) : null;
      const deviceId = requestedDeviceId || (tokenHash ? tokenHash.slice(0, 24) : "");
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();

      if (action === "unregister" || action === "mark_invalid") {
        if (!tokenHash && !deviceId) {
          return json({ ok: false, error: "token_or_device_required" }, 400);
        }

        let query = supabase
          .from("device_tokens")
          .update({
            last_seen_at: now,
            status: action === "unregister" ? "unregistered" : "invalid",
            updated_at: now,
          })
          .eq("platform", expectedPlatform);

        query = tokenHash ? query.eq("token_hash", tokenHash) : query.eq("device_id", deviceId);

        const { data, error } = await query.select(safeColumns).limit(1);
        if (error) throw error;

        if (action === "mark_invalid") {
          await writeInvalidEvent(supabase, payload, expectedPlatform, deviceId || null);
        }

        return json({ ok: true, action, platform: expectedPlatform, devices: data ?? [] });
      }

      if (!tokenHash) {
        return json({ ok: false, error: "fcm_token_required" }, 400);
      }

      const integrationAppId = normalizeAppId(integration?.product_app_id);
      const resolvedAppId = integrationAppId || appId;
      const productAppId = integrationAppId || normalizeAppId(payload.productAppId) || resolvedAppId;
      const integrationStorePlatform = clean(integration?.store_platform) as StorePlatform;
      const storePlatform = payload.storePlatform ?? (integrationStorePlatform || inferredStorePlatform(expectedPlatform));
      const packageName = expectedPlatform === "android" ? normalizePackageName(payload.packageName) || normalizePackageName(integration?.package_name) || null : null;
      const bundleId = expectedPlatform === "ios" ? normalizeBundleId(payload.bundleId) || normalizeBundleId(integration?.bundle_id) || null : null;
      const appIdentifier = normalizeAppIdentifier({
        appId,
        bundleId,
        packageName,
        platform: expectedPlatform,
        productAppId,
      }) || null;
      const deviceType = normalizeDeviceType(payload.deviceType) || normalizeDeviceType(payload.device_type) || null;
      const userId = `app:${resolvedAppId}:device:${deviceId || tokenHash.slice(0, 12)}`;

      const row = {
        user_id: userId,
        app_id: resolvedAppId,
        device_id: deviceId,
        platform: expectedPlatform,
        firebase_app_id: clean(payload.firebaseAppId) || clean(integration?.firebase_app_id) || null,
        firebase_project_id: normalizeFirebaseProjectId(payload.firebaseProjectId) || normalizeFirebaseProjectId(integration?.firebase_project_id) || null,
        app_identifier: appIdentifier,
        token_hash: tokenHash,
        fcm_token: fcmToken,
        app_version: clean(payload.appVersion) || null,
        os_version: clean(payload.osVersion) || null,
        locale: requestLocale(payload) || null,
        status: "active",
        last_seen_at: now,
        store_platform: storePlatform,
        store_account_name: clean(integration?.store_account_name) || null,
        product_app_id: productAppId,
        package_name: packageName,
        bundle_id: bundleId,
        device_type: deviceType,
        device_model: clean(payload.deviceModel) || null,
        device_manufacturer: clean(payload.deviceManufacturer) || null,
        updated_at: now,
      };

      const { data: existing, error: existingError } = await supabase
        .from("device_tokens")
        .select(safeColumns)
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (existingError) throw existingError;

      let data = existing;
      let skipped = false;
      let inserted = false;

      if (existing) {
        const updatePayload = deviceTokenUpdatePayload(existing, row, now, nowMs);

        if (Object.keys(updatePayload).length) {
          const { data: updated, error } = await supabase
            .from("device_tokens")
            .update(updatePayload)
            .eq("id", comparable(existing.id))
            .select(safeColumns)
            .single();

          if (error) throw error;
          data = updated;
        } else {
          skipped = true;
        }
      } else {
        const { data: insertedData, error } = await supabase
          .from("device_tokens")
          .insert(row)
          .select(safeColumns)
          .single();

        if (error) {
          if (!isUniqueViolation(error)) throw error;

          const { data: racedExisting, error: racedSelectError } = await supabase
            .from("device_tokens")
            .select(safeColumns)
            .eq("token_hash", tokenHash)
            .single();

          if (racedSelectError) throw racedSelectError;

          const updatePayload = deviceTokenUpdatePayload(racedExisting, row, now, nowMs);
          if (Object.keys(updatePayload).length) {
            const { data: updated, error: updateError } = await supabase
              .from("device_tokens")
              .update(updatePayload)
              .eq("id", comparable(racedExisting.id))
              .select(safeColumns)
              .single();

            if (updateError) throw updateError;
            data = updated;
          } else {
            data = racedExisting;
            skipped = true;
          }
        } else {
          data = insertedData;
          inserted = true;
        }
      }

      if (inserted && data) {
        await deactivatePreviousActiveTokens(supabase, {
          currentId: comparable(data.id),
          deviceId,
          platform: expectedPlatform,
          row,
          updatedAt: now,
        });
      }

      return json({
        ok: true,
        action,
        platform: expectedPlatform,
        device: data,
        skipped,
        app: {
          appId,
          appIdentifier,
          productAppId,
          packageName: row.package_name,
          bundleId: row.bundle_id,
          firebaseProjectId: row.firebase_project_id,
        },
      });
    } catch (error) {
      const responseError = deviceTokenError(error, expectedPlatform);
      console.error(`[device-token-${expectedPlatform}] request failed`, {
        code: responseError.code,
        details: responseError.details,
        error: responseError.error,
        hint: responseError.hint,
      });

      return json(
        {
          ok: false,
          ...responseError,
        },
        500
      );
    }
  });
}
