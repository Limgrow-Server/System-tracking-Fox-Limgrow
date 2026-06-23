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

type DeviceTokenRequest = {
  action?: "register" | "heartbeat" | "unregister" | "mark_invalid";
  productAppId?: string;
  storePlatform?: StorePlatform;
  platform?: MobilePlatform;
  packageName?: string;
  bundleId?: string;
  firebaseAppId?: string;
  firebaseProjectId?: string;
  fcmToken?: string;
  userId?: string;
  deviceId?: string;
  appVersion?: string;
  osVersion?: string;
  locale?: string;
  deviceModel?: string;
  deviceManufacturer?: string;
  errorCode?: string;
  errorDetail?: string;
};

const safeColumns =
  "id,user_id,device_id,platform,firebase_app_id,firebase_project_id,app_version,os_version,locale,status,last_seen_at,store_platform,store_account_name,product_app_id,package_name,bundle_id,device_model,device_manufacturer,created_at,updated_at";

function inferredStorePlatform(platform: MobilePlatform): StorePlatform {
  return platform === "android" ? "google_play" : "apple_app_store";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function findIntegration(
  supabase: SupabaseAdminClient,
  payload: DeviceTokenRequest,
  expectedPlatform: MobilePlatform
) {
  const app = await resolveMobileAppConfig(supabase, {
    appName: payload.productAppId,
    bundleId: payload.bundleId,
    packageName: payload.packageName,
    platform: expectedPlatform,
    productAppId: payload.productAppId,
  });

  if (!app) return null;

  return {
    id: app.id,
    bundle_id: app.bundleId,
    firebase_app_id: null,
    firebase_project_id: null,
    package_name: app.packageName,
    platform: expectedPlatform,
    product_app_id: app.appName,
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
    notification_id: clean(payload.productAppId) || clean(payload.packageName) || clean(payload.bundleId) || `device-token-${platform}`,
    event_type: "token_invalid",
    device_id: deviceId,
    platform,
    error_code: clean(payload.errorCode) || "client_mark_invalid",
    error_detail: clean(payload.errorDetail) || null,
    metadata: {
      productAppId: clean(payload.productAppId) || null,
      packageName: clean(payload.packageName) || null,
      bundleId: clean(payload.bundleId) || null,
    },
  });
}

function validateAppIdentifier(payload: DeviceTokenRequest, expectedPlatform: MobilePlatform) {
  if (clean(payload.productAppId)) return null;
  if (expectedPlatform === "android" && clean(payload.packageName)) return null;
  if (expectedPlatform === "ios" && clean(payload.bundleId)) return null;
  return expectedPlatform === "android" ? "product_app_id_or_package_name_required" : "product_app_id_or_bundle_id_required";
}

export function serveDeviceToken(expectedPlatform: MobilePlatform) {
  Deno.serve(async (request) => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    try {
      const payload = (await request.json()) as DeviceTokenRequest;
      const action = payload.action ?? "register";
      const fcmToken = clean(payload.fcmToken);
      const requestedDeviceId = clean(payload.deviceId);

      if (payload.platform && payload.platform !== expectedPlatform) {
        return json({ ok: false, error: `use_device_token_${payload.platform}_endpoint` }, 400);
      }

      const identifierError = validateAppIdentifier(payload, expectedPlatform);
      if (identifierError) {
        return json({ ok: false, error: identifierError }, 400);
      }

      if (action === "register" && !fcmToken) {
        return json({ ok: false, error: "fcm_token_required" }, 400);
      }

      const supabase = createAdminClient();
      const integration = await findIntegration(supabase, payload, expectedPlatform);
      const tokenHash = fcmToken ? await sha256(fcmToken) : null;
      const deviceId = requestedDeviceId || (tokenHash ? tokenHash.slice(0, 24) : "");

      if (action === "unregister" || action === "mark_invalid") {
        if (!tokenHash && !deviceId) {
          return json({ ok: false, error: "token_or_device_required" }, 400);
        }

        let query = supabase
          .from("device_tokens")
          .update({
            status: action === "unregister" ? "unregistered" : "invalid",
            last_seen_at: new Date().toISOString(),
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

      const productAppId = clean(payload.productAppId) || clean(integration?.product_app_id);
      const integrationStorePlatform = clean(integration?.store_platform) as StorePlatform;
      const storePlatform = payload.storePlatform ?? (integrationStorePlatform || inferredStorePlatform(expectedPlatform));
      const userId = clean(payload.userId) || `anonymous:${tokenHash.slice(0, 12)}`;

      const row = {
        user_id: userId,
        device_id: deviceId,
        platform: expectedPlatform,
        firebase_app_id: clean(payload.firebaseAppId) || clean(integration?.firebase_app_id) || null,
        firebase_project_id: clean(payload.firebaseProjectId) || clean(integration?.firebase_project_id) || null,
        token_hash: tokenHash,
        fcm_token: fcmToken,
        app_version: clean(payload.appVersion) || null,
        os_version: clean(payload.osVersion) || null,
        locale: clean(payload.locale) || null,
        status: "active",
        last_seen_at: new Date().toISOString(),
        store_platform: storePlatform,
        store_account_name: clean(integration?.store_account_name) || null,
        product_app_id: productAppId,
        package_name: expectedPlatform === "android" ? clean(payload.packageName) || clean(integration?.package_name) || null : null,
        bundle_id: expectedPlatform === "ios" ? clean(payload.bundleId) || clean(integration?.bundle_id) || null : null,
        device_model: clean(payload.deviceModel) || null,
        device_manufacturer: clean(payload.deviceManufacturer) || null,
      };

      const { data, error } = await supabase
        .from("device_tokens")
        .upsert(row, { onConflict: "token_hash" })
        .select(safeColumns)
        .single();

      if (error) throw error;

      return json({
        ok: true,
        action,
        platform: expectedPlatform,
        device: data,
        app: {
          productAppId,
          packageName: row.package_name,
          bundleId: row.bundle_id,
          firebaseProjectId: row.firebase_project_id,
        },
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error: error instanceof Error ? error.message : `Unknown device-token-${expectedPlatform} error`,
        },
        500
      );
    }
  });
}
