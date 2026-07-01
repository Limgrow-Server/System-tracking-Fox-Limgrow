import {
  clean,
  getFirebaseAdminConfig,
  stringValue,
  type MobilePlatform,
  type SupabaseAdminClient,
} from "../_shared/edge-config.ts";
import { normalizeAppId, normalizeAppIdentifier } from "../_shared/mobile-normalize.ts";

export type TargetType = "topic" | "device";

export type LocaleNotificationInput = {
  enabled?: boolean;
  languageCode?: string;
  message?: string;
  topicCode?: string;
  title?: string;
};

export type SendNotificationRequest = {
  appId?: string;
  appName?: string;
  bundleId?: string;
  credentialRef?: string;
  data?: unknown;
  deviceIds?: string[];
  deviceTokenIds?: string[];
  imageUrl?: string;
  jobId?: string;
  message?: string;
  notifications?: LocaleNotificationInput[];
  packageName?: string;
  platform?: MobilePlatform;
  productAppId?: string;
  queuedBatchId?: string;
  scheduleId?: string;
  storeAccountName?: string;
  storeProfileId?: string;
  targetType?: TargetType;
  title?: string;
  topicBase?: string;
};

export type Caller = {
  authUserId: string;
  email: string;
  memberId: string;
};

type LocaleNotification = {
  body: string;
  title: string;
  topicCode: string;
};

export type SendResult = {
  credentialProjectId: string | null;
  deviceAppId: string | null;
  deviceAppIdentifier: string | null;
  deviceBundleId: string | null;
  deviceFirebaseProjectId: string | null;
  deviceId: string | null;
  devicePackageName: string | null;
  deviceProductAppId: string | null;
  deviceTokenId: string | null;
  error: string | null;
  fcmErrorCode: string | null;
  fcmToken: string | null;
  invalidToken: boolean;
  ok: boolean;
  providerMessageId: string | null;
  status: number;
  targetType: TargetType;
  targetValue: string;
  topicCode: string | null;
};

type DeviceTarget = {
  appIdentifier: string | null;
  appId: string | null;
  bundleId: string | null;
  deviceId: string;
  firebaseProjectId: string | null;
  id: string;
  fcmToken: string;
  locale: string | null;
  packageName: string | null;
  productAppId: string | null;
};

function errorForLog(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object" && !Array.isArray(error)) {
    return error as Record<string, unknown>;
  }

  return { message: String(error) };
}

function errorString(error: unknown, key: string) {
  const record = errorForLog(error);
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error
    ? error.message
    : errorString(error, "message")
      ?? errorString(error, "error")
      ?? fallback;
}

function logSendFailure(message: string, details: Record<string, unknown>) {
  console.error(`[send-notification] ${message}`, details);
}

function logTargetValue(input: {
  deviceId?: string | null;
  targetType: TargetType;
  targetValue: string;
}) {
  if (input.targetType === "device") return input.deviceId ?? "fcm-token-redacted";
  return input.targetValue;
}

function primaryLocale(locales: LocaleNotification[]) {
  return locales.find((locale) => locale.topicCode === "en") ?? locales[0];
}

const TITLE_MAX_LENGTH = 45;
const MESSAGE_MAX_LENGTH = 90;
const MAX_DEVICE_TARGETS = 1000;
const DEVICE_TOKEN_QUERY_BATCH_SIZE = 50;
const DB_WRITE_BATCH_SIZE = 100;
const DEFAULT_FCM_SEND_CONCURRENCY = 10;
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

function chunks<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function intDenoEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(Deno.env.get(name));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function fcmSendConcurrency() {
  return intDenoEnv("FCM_SEND_CONCURRENCY", DEFAULT_FCM_SEND_CONCURRENCY, 1, 50);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }));

  return results;
}

function base64Url(input: string | ArrayBuffer) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function signGoogleJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKeyPem: string) {
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64Url(signature)}`;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return clean(match?.[1]);
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

export async function requireAdminCaller(supabase: SupabaseAdminClient, request: Request): Promise<Caller> {
  const token = bearerToken(request);
  if (!token) throw new Error("authorization_bearer_token_required");

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user?.id || !user.email) {
    throw new Error("valid_supabase_user_token_required");
  }

  const select = "id,email,role,status,auth_user_id";
  const { data: byAuthUser, error: authError } = await supabase
    .from("team_members")
    .select(select)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (authError) throw authError;

  const email = normalizeEmail(user.email);
  const byEmail = byAuthUser
    ? null
    : await supabase
      .from("team_members")
      .select(select)
      .eq("email", email)
      .maybeSingle();
  if (byEmail?.error) throw byEmail.error;

  const member = (byAuthUser ?? byEmail?.data) as Record<string, unknown> | null;
  if (!member || clean(member.role).toLowerCase() !== "admin" || clean(member.status) !== "active") {
    throw new Error("admin_role_required");
  }

  return {
    authUserId: user.id,
    email,
    memberId: clean(member.id),
  };
}

export async function requireAdminOrInternalCaller(supabase: SupabaseAdminClient, request: Request): Promise<Caller> {
  const expectedSecret = clean(Deno.env.get("NOTIFICATION_DISPATCH_SECRET")) || clean(Deno.env.get("NOTIFICATION_QUEUE_SECRET"));
  const providedSecret = clean(request.headers.get("x-dispatch-secret")) || clean(request.headers.get("x-notification-queue-secret"));

  if (expectedSecret && providedSecret && expectedSecret === providedSecret) {
    return {
      authUserId: "notification-worker",
      email: "notification-worker@system.local",
      memberId: "notification-worker",
    };
  }

  return requireAdminCaller(supabase, request);
}

function inferPlatform(payload: SendNotificationRequest): MobilePlatform {
  if (payload.platform === "android" || payload.platform === "ios") return payload.platform;
  if (clean(payload.bundleId)) return "ios";
  return "android";
}

function topicSegment(value: unknown) {
  return clean(value)
    .replace(/^\/topics\//i, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9\-_.~%]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeTargetType(value: unknown): TargetType {
  return clean(value) === "device" ? "device" : "topic";
}

function normalizeDeviceIds(value: unknown) {
  const rawItems = Array.isArray(value) ? value : [];
  return Array.from(new Set(rawItems.map((item) => clean(item)).filter(Boolean))).slice(0, MAX_DEVICE_TARGETS);
}

function normalizeDeviceTokenIds(value: unknown) {
  const rawItems = Array.isArray(value) ? value : [];
  return Array.from(new Set(rawItems.map((item) => clean(item)).filter(Boolean))).slice(0, MAX_DEVICE_TARGETS);
}

function notificationAppId(payload: SendNotificationRequest) {
  return normalizeAppId(payload.appId) || normalizeAppId(payload.productAppId) || clean(payload.appName);
}

function normalizeLocaleNotifications(payload: SendNotificationRequest): LocaleNotification[] {
  const fromRows = Array.isArray(payload.notifications)
    ? payload.notifications
      .filter((item) => item.enabled !== false)
      .map((item) => ({
        body: clean(item.message),
        title: clean(item.title),
        topicCode: topicSegment(clean(item.topicCode) || clean(item.languageCode)).toLowerCase(),
      }))
    : [];

  const rows = fromRows.length
    ? fromRows
    : [{
      body: clean(payload.message),
      title: clean(payload.title),
      topicCode: "en",
    }];

  if (!rows.length) throw new Error("notification_payload_required");

  rows.forEach((row) => {
    if (!row.topicCode) throw new Error("topic_code_required");
    if (!row.title || !row.body) throw new Error(`missing_title_or_message_for_${row.topicCode}`);
    if (row.title.length > TITLE_MAX_LENGTH) {
      throw new Error(`title_too_long_for_${row.topicCode}_max_${TITLE_MAX_LENGTH}`);
    }
    if (row.body.length > MESSAGE_MAX_LENGTH) {
      throw new Error(`message_too_long_for_${row.topicCode}_max_${MESSAGE_MAX_LENGTH}`);
    }
  });

  return rows;
}

function objectPayload(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error("data_payload_must_be_a_json_object");
}

function fcmDataPayload(value: Record<string, unknown>) {
  return Object.entries(value).reduce<Record<string, string>>((items, [key, rawValue]) => {
    const cleanedKey = clean(key);
    if (!cleanedKey || rawValue === undefined || rawValue === null) return items;
    items[cleanedKey] = typeof rawValue === "object" ? JSON.stringify(rawValue) : String(rawValue);
    return items;
  }, {});
}

async function googleAccessToken(serviceAccount: Record<string, unknown>) {
  const clientEmail = stringValue(serviceAccount.client_email);
  const privateKey = stringValue(serviceAccount.private_key);
  const tokenUri = stringValue(serviceAccount.token_uri) ?? "https://oauth2.googleapis.com/token";

  if (!clientEmail || !privateKey) {
    throw new Error("Firebase service account must include client_email and private_key");
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await signGoogleJwt(
    { alg: "RS256", typ: "JWT" },
    {
      aud: tokenUri,
      exp: now + 3600,
      iat: now,
      iss: clientEmail,
      scope: FCM_SCOPE,
    },
    privateKey
  );

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(`Google OAuth failed: ${JSON.stringify(body)}`);
  }

  const accessToken = stringValue(body.access_token);
  if (!accessToken) throw new Error("Google OAuth response did not include access_token");
  return accessToken;
}

function fcmPayload(input: {
  body: string;
  data: Record<string, string>;
  imageUrl: string;
  targetType: TargetType;
  targetValue: string;
  title: string;
}) {
  const notification: Record<string, string> = {
    body: input.body,
    title: input.title,
  };
  const message: Record<string, unknown> = {
    data: input.data,
    notification,
    [input.targetType === "device" ? "token" : "topic"]: input.targetValue,
  };

  if (input.imageUrl) {
    notification.image = input.imageUrl;
    message.android = {
      notification: {
        image: input.imageUrl,
      },
    };
    message.apns = {
      fcm_options: {
        image: input.imageUrl,
      },
      payload: {
        aps: {
          "mutable-content": 1,
        },
      },
    };
  }

  return { message };
}

function redactedFcmPayload(payload: ReturnType<typeof fcmPayload>) {
  const message = { ...payload.message };
  if ("token" in message) {
    message.token = "fcm-token-redacted";
  }

  return {
    ...payload,
    message,
  };
}

function logIosFcmPayload(
  input: {
    deviceId?: string | null;
    platform: MobilePlatform;
    projectId: string;
    targetType: TargetType;
    targetValue: string;
    topicCode?: string | null;
  },
  payload: ReturnType<typeof fcmPayload>
) {
  if (input.platform !== "ios") return;

  console.info("[send-notification] iOS FCM request payload", {
    deviceId: input.deviceId ?? null,
    fcmPayload: redactedFcmPayload(payload),
    platform: input.platform,
    projectId: input.projectId,
    targetType: input.targetType,
    targetValue: logTargetValue(input),
    topicCode: input.topicCode ?? null,
  });
}

function formatFcmError(body: unknown, projectId: string, clientEmail: string | null) {
  const message =
    body && typeof body === "object" && "error" in body
      ? stringValue((body.error as Record<string, unknown>)?.message) ?? JSON.stringify(body)
      : typeof body === "string"
        ? body
        : JSON.stringify(body);

  if (message.includes("cloudmessaging.messages.create")) {
    return `${message}. Grant Firebase Cloud Messaging API Admin to ${clientEmail ?? "the service account"} in project ${projectId}.`;
  }

  return message.slice(0, 600);
}

function userFacingFcmError(code: string | null, formattedError: string) {
  if (code === "UNREGISTERED") return "Người dùng đã tắt thông báo.";
  if (code === "THIRD_PARTY_AUTH_ERROR") return "Thiếu hoặc sai APNs Auth Key/Certificate trong Firebase project của iOS app.";
  return formattedError;
}

function fcmDetailErrorCode(body: unknown) {
  const error = body && typeof body === "object" && "error" in body
    ? (body as Record<string, unknown>).error
    : null;
  if (!error || typeof error !== "object") return null;

  const errorRecord = error as Record<string, unknown>;
  const details = Array.isArray(errorRecord.details) ? errorRecord.details : [];
  for (const detail of details) {
    if (!detail || typeof detail !== "object") continue;
    const code = stringValue((detail as Record<string, unknown>).errorCode);
    if (code) return code;
  }

  return null;
}

function fcmErrorCode(body: unknown) {
  const detailCode = fcmDetailErrorCode(body);
  if (detailCode) return detailCode;

  const error = body && typeof body === "object" && "error" in body
    ? (body as Record<string, unknown>).error
    : null;
  if (!error || typeof error !== "object") return null;

  const errorRecord = error as Record<string, unknown>;
  return stringValue(errorRecord.status);
}

function isInvalidFcmTokenError(input: { body: unknown; formattedError: string; status: number }) {
  const code = fcmDetailErrorCode(input.body);
  if (code === "UNREGISTERED") return true;

  const message = input.formattedError.toLowerCase();
  if (code === "INVALID_ARGUMENT") {
    return message.includes("registration token") || message.includes("fcm token") || message.includes("token is not");
  }

  return false;
}

async function sendFcm(input: {
  accessToken: string;
  body: string;
  clientEmail: string | null;
  data: Record<string, string>;
  deviceAppId?: string | null;
  deviceAppIdentifier?: string | null;
  deviceBundleId?: string | null;
  deviceFirebaseProjectId?: string | null;
  deviceId?: string | null;
  devicePackageName?: string | null;
  deviceProductAppId?: string | null;
  deviceTokenId?: string | null;
  endpoint: string;
  imageUrl: string;
  platform: MobilePlatform;
  projectId: string;
  targetType: TargetType;
  targetValue: string;
  title: string;
  topicCode?: string | null;
}): Promise<SendResult> {
  const requestPayload = fcmPayload({
    body: input.body,
    data: input.data,
    imageUrl: input.imageUrl,
    targetType: input.targetType,
    targetValue: input.targetValue,
    title: input.title,
  });

  logIosFcmPayload(input, requestPayload);

  const response = await fetch(input.endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(requestPayload),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    const formattedError = formatFcmError(body, input.projectId, input.clientEmail);
    const code = fcmErrorCode(body);
    const error = userFacingFcmError(code, formattedError);
    const invalidToken = isInvalidFcmTokenError({ body, formattedError, status: response.status });
    logSendFailure("FCM request failed", {
      credentialProjectId: input.projectId,
      deviceAppId: input.deviceAppId ?? null,
      deviceAppIdentifier: input.deviceAppIdentifier ?? null,
      deviceBundleId: input.deviceBundleId ?? null,
      deviceFirebaseProjectId: input.deviceFirebaseProjectId ?? null,
      deviceId: input.deviceId ?? null,
      devicePackageName: input.devicePackageName ?? null,
      deviceProductAppId: input.deviceProductAppId ?? null,
      error,
      fcmErrorCode: code,
      fcmToken: input.targetType === "device" ? input.targetValue : null,
      invalidToken,
      projectId: input.projectId,
      status: response.status,
      targetType: input.targetType,
      targetValue: logTargetValue(input),
      topicCode: input.topicCode ?? null,
    });

    return {
      credentialProjectId: input.projectId,
      deviceAppId: input.deviceAppId ?? null,
      deviceAppIdentifier: input.deviceAppIdentifier ?? null,
      deviceBundleId: input.deviceBundleId ?? null,
      deviceFirebaseProjectId: input.deviceFirebaseProjectId ?? null,
      deviceId: input.deviceId ?? null,
      devicePackageName: input.devicePackageName ?? null,
      deviceProductAppId: input.deviceProductAppId ?? null,
      deviceTokenId: input.deviceTokenId ?? null,
      error,
      fcmErrorCode: code,
      fcmToken: input.targetType === "device" ? input.targetValue : null,
      invalidToken,
      ok: false,
      providerMessageId: null,
      status: response.status,
      targetType: input.targetType,
      targetValue: input.targetType === "device" ? input.deviceId ?? input.targetValue : input.targetValue,
      topicCode: input.topicCode ?? null,
    };
  }

  return {
    credentialProjectId: input.projectId,
    deviceAppId: input.deviceAppId ?? null,
    deviceAppIdentifier: input.deviceAppIdentifier ?? null,
    deviceBundleId: input.deviceBundleId ?? null,
    deviceFirebaseProjectId: input.deviceFirebaseProjectId ?? null,
    deviceId: input.deviceId ?? null,
    devicePackageName: input.devicePackageName ?? null,
    deviceProductAppId: input.deviceProductAppId ?? null,
    deviceTokenId: input.deviceTokenId ?? null,
    error: null,
    fcmErrorCode: null,
    fcmToken: input.targetType === "device" ? input.targetValue : null,
    invalidToken: false,
    ok: true,
    providerMessageId: stringValue(body?.name),
    status: response.status,
    targetType: input.targetType,
    targetValue: input.targetType === "device" ? input.deviceId ?? input.targetValue : input.targetValue,
    topicCode: input.topicCode ?? null,
  };
}

function localeForDevice(device: DeviceTarget, locales: LocaleNotification[]) {
  const code = clean(device.locale).split(/[-_]/)[0].toLowerCase();
  return locales.find((locale) => locale.topicCode === code)
    ?? locales.find((locale) => locale.topicCode === "en")
    ?? locales[0];
}

async function getDeviceTargets(
  supabase: SupabaseAdminClient,
  input: {
    appId?: string;
    appName?: string;
    bundleId?: string | null;
    deviceIds: string[];
    deviceTokenIds?: string[];
    packageName?: string | null;
    platform: MobilePlatform;
    productAppId?: string | null;
  }
) {
  if (!input.deviceIds.length && !input.deviceTokenIds?.length) return [];

  const rows: Record<string, unknown>[] = [];
  const select = "id,app_id,app_identifier,device_id,fcm_token,locale,package_name,bundle_id,product_app_id,firebase_project_id,status";

  if (input.deviceTokenIds?.length) {
    for (const tokenIdBatch of chunks(input.deviceTokenIds, DEVICE_TOKEN_QUERY_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("device_tokens")
        .select(select)
        .eq("platform", input.platform)
        .eq("status", "active")
        .in("id", tokenIdBatch);

      if (error) throw error;
      rows.push(...((data ?? []) as Record<string, unknown>[]));
    }
  } else {
    for (const deviceIdBatch of chunks(input.deviceIds, DEVICE_TOKEN_QUERY_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("device_tokens")
        .select(select)
        .eq("platform", input.platform)
        .eq("status", "active")
        .in("device_id", deviceIdBatch);

      if (error) throw error;
      rows.push(...((data ?? []) as Record<string, unknown>[]));
    }
  }

  const appId = normalizeAppId(input.appId);
  const appName = clean(input.appName);
  const packageName = clean(input.packageName);
  const bundleId = clean(input.bundleId);
  const productAppId = normalizeAppId(input.productAppId);
  const requestedAppIdentifier = normalizeAppIdentifier({
    appId,
    bundleId,
    packageName,
    platform: input.platform,
    productAppId,
  });
  const requestedAppKeys = Array.from(new Set([appId, productAppId, appId || productAppId ? "" : appName].filter(Boolean)));

  return rows.map((record) => {
    return {
      appIdentifier: stringValue(record.app_identifier),
      appId: stringValue(record.app_id),
      bundleId: stringValue(record.bundle_id),
      deviceId: clean(record.device_id),
      firebaseProjectId: stringValue(record.firebase_project_id),
      id: clean(record.id),
      fcmToken: clean(record.fcm_token),
      locale: stringValue(record.locale),
      packageName: stringValue(record.package_name),
      productAppId: stringValue(record.product_app_id),
    };
  }).filter((device) => {
    if (!device.id || !device.deviceId || !device.fcmToken) return false;
    const deviceAppKeys = [
      normalizeAppId(device.appId),
      normalizeAppId(device.productAppId),
    ].filter(Boolean);
    if (requestedAppKeys.length && deviceAppKeys.length) {
      return deviceAppKeys.some((deviceKey) => requestedAppKeys.includes(deviceKey));
    }
    if (requestedAppIdentifier && device.appIdentifier === requestedAppIdentifier) return true;
    if (packageName && device.packageName === packageName) return true;
    if (bundleId && device.bundleId === bundleId) return true;
    return !requestedAppKeys.length && !packageName && !bundleId;
  });
}

async function insertJob(
  supabase: SupabaseAdminClient,
  input: {
    actorEmail: string;
    dataPayload: Record<string, unknown>;
    imageUrl: string;
    locales: LocaleNotification[];
    payload: SendNotificationRequest;
    platform: MobilePlatform;
    targetType: TargetType;
    targetValues: string[];
    topicBase: string;
  },
) {
  const appName = clean(input.payload.appName) || clean(input.payload.productAppId) || input.topicBase || "unknown_app";
  const appId = normalizeAppId(input.payload.appId) || normalizeAppId(input.payload.productAppId) || null;
  const firstLocale = primaryLocale(input.locales);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("notification_jobs")
    .insert({
      app_name: appName,
      app_id: appId,
      bundle_id: input.platform === "ios" ? clean(input.payload.bundleId) || null : null,
      credential_ref: clean(input.payload.credentialRef) || null,
      data_payload: input.dataPayload,
      image_url: input.imageUrl || null,
      locale_payload: input.locales,
      message: firstLocale?.body ?? null,
      package_name: input.platform === "android" ? clean(input.payload.packageName) || null : null,
      platform: input.platform,
      requested_by: input.actorEmail,
      schedule_id: clean(input.payload.scheduleId) || null,
      status: "sending",
      store_account_name: clean(input.payload.storeAccountName) || null,
      store_profile_id: clean(input.payload.storeProfileId) || null,
      target_type: input.targetType,
      target_values: input.targetValues,
      title: firstLocale?.title ?? null,
      topic_base: input.topicBase || "device",
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as Record<string, unknown>;
}

async function getExistingJob(
  supabase: SupabaseAdminClient,
  jobId: string,
) {
  const { data, error } = await supabase
    .from("notification_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("notification_job_not_found");
  return data as Record<string, unknown>;
}

async function writeEvents(
  supabase: SupabaseAdminClient,
  input: {
    jobId: string;
    platform: MobilePlatform;
    results: SendResult[];
  },
) {
  const rows = input.results.map((result) => ({
    device_id: result.deviceId,
    error_code: result.ok ? null : result.invalidToken ? "fcm_token_invalid" : result.fcmErrorCode ?? `fcm_http_${result.status}`,
    error_detail: result.error,
    event_type: result.ok ? "fcm_sent" : "fcm_failed",
    job_id: input.jobId,
    metadata: {
      credentialProjectId: result.credentialProjectId,
      deviceAppId: result.deviceAppId,
      deviceAppIdentifier: result.deviceAppIdentifier,
      deviceBundleId: result.deviceBundleId,
      deviceFirebaseProjectId: result.deviceFirebaseProjectId,
      devicePackageName: result.devicePackageName,
      deviceProductAppId: result.deviceProductAppId,
      deviceTokenId: result.deviceTokenId,
      fcmErrorCode: result.fcmErrorCode,
      fcmToken: result.fcmToken,
      invalidToken: result.invalidToken,
      topicCode: result.topicCode,
    },
    notification_id: input.jobId,
    platform: input.platform,
    provider_message_id: result.providerMessageId,
    status: result.ok ? "sent" : "failed",
    target_type: result.targetType,
    target_value: result.targetValue,
  }));

  if (!rows.length) return;

  for (const rowBatch of chunks(rows, DB_WRITE_BATCH_SIZE)) {
    const { error } = await supabase.from("notification_events").insert(rowBatch);
    if (error) throw error;
  }
}

async function markInvalidDeviceTokens(
  supabase: SupabaseAdminClient,
  input: {
    platform: MobilePlatform;
    results: SendResult[];
  }
) {
  const invalidDeviceTokenIds = Array.from(new Set(input.results
    .filter((result) => result.invalidToken && result.deviceTokenId)
    .map((result) => result.deviceTokenId!)
  ));

  if (!invalidDeviceTokenIds.length) return;

  for (const tokenIdBatch of chunks(invalidDeviceTokenIds, DB_WRITE_BATCH_SIZE)) {
    const { error } = await supabase
      .from("device_tokens")
      .update({
        last_seen_at: new Date().toISOString(),
        status: "invalid",
      })
      .eq("platform", input.platform)
      .in("id", tokenIdBatch);

    if (error) throw error;
  }
}

async function updateJob(
  supabase: SupabaseAdminClient,
  input: {
    credentialRef?: string | null;
    errorCount: number;
    jobId: string;
    platform: MobilePlatform;
    projectId?: string | null;
    resolvedPayload?: SendNotificationRequest;
    sentCount: number;
    targetValues: string[];
  },
) {
  const status = input.sentCount > 0 ? "sent" : "failed";
  const updatePayload: Record<string, unknown> = {
    credential_ref: input.credentialRef ?? null,
    error_count: input.errorCount,
    project_id: input.projectId ?? null,
    sent_at: new Date().toISOString(),
    sent_count: input.sentCount,
    status,
    target_values: input.targetValues,
    updated_at: new Date().toISOString(),
  };

  if (input.resolvedPayload) {
    updatePayload.app_name = clean(input.resolvedPayload.appName) || clean(input.resolvedPayload.productAppId) || "unknown_app";
    updatePayload.app_id = normalizeAppId(input.resolvedPayload.appId) || normalizeAppId(input.resolvedPayload.productAppId) || null;
    updatePayload.bundle_id = input.platform === "ios" ? clean(input.resolvedPayload.bundleId) || null : null;
    updatePayload.package_name = input.platform === "android" ? clean(input.resolvedPayload.packageName) || null : null;
    updatePayload.store_account_name = clean(input.resolvedPayload.storeAccountName) || null;
    updatePayload.store_profile_id = clean(input.resolvedPayload.storeProfileId) || null;
  }

  const { data, error } = await supabase
    .from("notification_jobs")
    .update(updatePayload)
    .eq("id", input.jobId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Record<string, unknown>;
}

function failedResult(input: {
  credentialProjectId?: string | null;
  deviceAppId?: string | null;
  deviceAppIdentifier?: string | null;
  deviceBundleId?: string | null;
  deviceFirebaseProjectId?: string | null;
  deviceId?: string | null;
  devicePackageName?: string | null;
  deviceProductAppId?: string | null;
  deviceTokenId?: string | null;
  error: string;
  fcmErrorCode?: string | null;
  invalidToken?: boolean;
  targetType: TargetType;
  targetValue: string;
  topicCode?: string | null;
  status?: number;
}): SendResult {
  return {
    credentialProjectId: input.credentialProjectId ?? null,
    deviceAppId: input.deviceAppId ?? null,
    deviceAppIdentifier: input.deviceAppIdentifier ?? null,
    deviceBundleId: input.deviceBundleId ?? null,
    deviceFirebaseProjectId: input.deviceFirebaseProjectId ?? null,
    deviceId: input.deviceId ?? null,
    devicePackageName: input.devicePackageName ?? null,
    deviceProductAppId: input.deviceProductAppId ?? null,
    deviceTokenId: input.deviceTokenId ?? null,
    error: input.error,
    fcmErrorCode: input.fcmErrorCode ?? null,
    fcmToken: null,
    invalidToken: input.invalidToken ?? false,
    ok: false,
    providerMessageId: null,
    status: input.status ?? 500,
    targetType: input.targetType,
    targetValue: input.targetValue,
    topicCode: input.topicCode ?? null,
  };
}

export async function sendNotificationPayload(
  supabase: SupabaseAdminClient,
  payload: SendNotificationRequest,
  actorEmail: string,
) {
  const platform = inferPlatform(payload);
  const appId = notificationAppId(payload);
  const targetType = normalizeTargetType(payload.targetType);
  const locales = normalizeLocaleNotifications(payload);
  const dataPayload = objectPayload(payload.data);
  const baseFcmData = fcmDataPayload(dataPayload);
  const imageUrl = clean(payload.imageUrl);
  const deviceTokenIds = normalizeDeviceTokenIds(payload.deviceTokenIds);
  const deviceIds = normalizeDeviceIds(payload.deviceIds);
  const deviceTargetValues = deviceTokenIds.length ? deviceTokenIds : deviceIds;
  const targetValueKind = deviceTokenIds.length ? "device_token_id" : "device_id";
  const topicBase = topicSegment(
    clean(payload.topicBase) ||
    appId ||
    clean(payload.appName) ||
    clean(payload.productAppId) ||
    (platform === "android" ? clean(payload.packageName) : clean(payload.bundleId)) ||
    "notification"
  );
  const initialTargetValues = targetType === "device" ? deviceTargetValues : locales.map((locale) => `${topicBase}-${locale.topicCode}`);

  if (targetType === "device" && !deviceTargetValues.length) throw new Error("device_targets_required");
  if (targetType === "topic" && !topicBase) throw new Error("topic_base_required");

  const queuedJobId = clean(payload.jobId);
  const queuedBatchId = clean(payload.queuedBatchId);
  const usesExistingJob = Boolean(queuedJobId && queuedBatchId);
  const job = usesExistingJob
    ? await getExistingJob(supabase, queuedJobId)
    : await insertJob(supabase, {
      actorEmail,
      dataPayload,
      imageUrl,
      locales,
      payload,
      platform,
      targetType,
      targetValues: initialTargetValues,
      topicBase,
    });
  const jobId = clean(job.id);

  try {
    const config = await getFirebaseAdminConfig(supabase, {
      appId,
      appName: clean(payload.appName) || clean(payload.productAppId),
      bundleId: payload.bundleId,
      credentialRef: payload.credentialRef,
      packageName: payload.packageName,
      platform,
      productAppId: payload.productAppId,
      storeAccountName: payload.storeAccountName,
      storeProfileId: payload.storeProfileId,
    });
    const serviceAccount = config.firebaseAdmin.serviceAccount;
    const projectId = stringValue(serviceAccount.project_id) ?? config.firebaseAdmin.projectId;
    const clientEmail = stringValue(serviceAccount.client_email) ?? config.firebaseAdmin.clientEmail;

    if (!projectId) throw new Error("Firebase service account must include project_id");

    const resolvedPayload = {
      ...payload,
      appId: config.app?.appId ?? payload.appId,
      appName: config.app?.appName ?? payload.appName,
      bundleId: config.app?.bundleId ?? payload.bundleId,
      packageName: config.app?.packageName ?? payload.packageName,
      storeAccountName: config.app?.storeAccountName ?? payload.storeAccountName,
      storeProfileId: config.app?.storeProfileId ?? payload.storeProfileId,
    };
    const deliveryData = {
      ...baseFcmData,
      notificationAppId: normalizeAppId(resolvedPayload.appId) || appId || "",
      notificationId: jobId,
      notificationJobId: jobId,
      notificationPlatform: platform,
    };
    const accessToken = await googleAccessToken(serviceAccount);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
    const results: SendResult[] = [];

    if (targetType === "topic") {
      for (const locale of locales) {
        results.push(await sendFcm({
          accessToken,
          body: locale.body,
          clientEmail,
          data: {
            ...deliveryData,
            notificationLocale: locale.topicCode,
          },
          endpoint,
          imageUrl,
          platform,
          projectId,
          targetType,
          targetValue: `${topicBase}-${locale.topicCode}`,
          title: locale.title,
          topicCode: locale.topicCode,
        }));
      }
    } else {
      const devices = await getDeviceTargets(supabase, {
        appId: resolvedPayload.appId,
        appName: resolvedPayload.appName,
        bundleId: resolvedPayload.bundleId,
        deviceIds,
        deviceTokenIds,
        packageName: resolvedPayload.packageName,
        platform,
        productAppId: resolvedPayload.productAppId,
      });
      const devicesByTarget = new Map(devices.map((device) => [deviceTokenIds.length ? device.id : device.deviceId, device]));

      results.push(...await mapWithConcurrency(deviceTargetValues, fcmSendConcurrency(), async (targetValue) => {
        const device = devicesByTarget.get(targetValue);
        if (!device) {
          logSendFailure("No active FCM token found for requested device", {
            appId: normalizeAppId(resolvedPayload.appId) || appId || null,
            bundleId: clean(resolvedPayload.bundleId) || null,
            deviceId: targetValueKind === "device_id" ? targetValue : null,
            deviceTokenId: targetValueKind === "device_token_id" ? targetValue : null,
            packageName: clean(resolvedPayload.packageName) || null,
            platform,
            targetType,
            targetValueKind,
          });

          return failedResult({
            deviceId: targetValueKind === "device_id" ? targetValue : null,
            error: `No active ${platform} FCM token found for ${targetValueKind} ${targetValue}`,
            status: 404,
            targetType,
            targetValue,
          });
        }

        const locale = localeForDevice(device, locales);
        return sendFcm({
          accessToken,
          body: locale.body,
          clientEmail,
          data: {
            ...deliveryData,
            notificationLocale: locale.topicCode,
          },
          deviceAppId: device.appId,
          deviceAppIdentifier: device.appIdentifier,
          deviceBundleId: device.bundleId,
          deviceFirebaseProjectId: device.firebaseProjectId,
          deviceId: device.deviceId,
          devicePackageName: device.packageName,
          deviceProductAppId: device.productAppId,
          deviceTokenId: device.id,
          endpoint,
          imageUrl,
          platform,
          projectId,
          targetType,
          targetValue: device.fcmToken,
          title: locale.title,
          topicCode: locale.topicCode,
        });
      }));
    }

    const sentCount = results.filter((result) => result.ok).length;
    const errorCount = results.length - sentCount;
    if (errorCount > 0) {
      logSendFailure("Notification job finished with failed targets", {
        appId: normalizeAppId(resolvedPayload.appId) || appId || null,
        errorCount,
        failedTargets: results
          .filter((result) => !result.ok)
          .slice(0, 20)
          .map((result) => ({
            credentialProjectId: result.credentialProjectId,
            deviceAppId: result.deviceAppId,
            deviceAppIdentifier: result.deviceAppIdentifier,
            deviceBundleId: result.deviceBundleId,
            deviceFirebaseProjectId: result.deviceFirebaseProjectId,
            deviceId: result.deviceId,
            devicePackageName: result.devicePackageName,
            deviceProductAppId: result.deviceProductAppId,
            error: result.error,
            fcmErrorCode: result.fcmErrorCode,
            invalidToken: result.invalidToken,
            status: result.status,
            targetType: result.targetType,
            targetValue: result.targetType === "device" ? result.deviceId ?? "fcm-token-redacted" : result.targetValue,
            topicCode: result.topicCode,
          })),
        credentialProjectId: projectId,
        credentialRef: config.firebaseAdmin.credential.credentialRef,
        jobId,
        platform,
        sentCount,
        targetType,
        totalTargets: results.length,
      });
    }

    await writeEvents(supabase, { jobId, platform, results });
    await markInvalidDeviceTokens(supabase, { platform, results });
    const updatedJob = usesExistingJob
      ? job
      : await updateJob(supabase, {
        credentialRef: config.firebaseAdmin.credential.credentialRef,
        errorCount,
        jobId,
        platform,
        projectId,
        resolvedPayload,
        sentCount,
        targetValues: targetType === "device" ? initialTargetValues : results.map((result) => result.targetValue),
      });

    return {
      app: config.app,
      credentialRef: config.firebaseAdmin.credential.credentialRef,
      errorCount,
      job: updatedJob,
      platform,
      projectId,
      results,
      sentCount,
      targetType,
      topicBase,
    };
  } catch (error) {
    const failureMessage = errorMessage(error, "Unknown notification send error");
    logSendFailure("Notification job failed before FCM send completed", {
      appId,
      error: errorForLog(error),
      jobId,
      platform,
      targetType,
      targetValues: initialTargetValues,
      topicBase,
    });

    const failedTargets = initialTargetValues.length ? initialTargetValues : [topicBase];
    const results = failedTargets.map((targetValue) =>
      failedResult({
        deviceId: targetType === "device" ? targetValue : null,
        error: failureMessage,
        targetType,
        targetValue,
      })
    );
    await writeEvents(supabase, { jobId, platform, results });
    const updatedJob = usesExistingJob
      ? job
      : await updateJob(supabase, {
        credentialRef: clean(payload.credentialRef) || null,
        errorCount: results.length,
        jobId,
        platform,
        projectId: null,
        sentCount: 0,
        targetValues: initialTargetValues,
      });

    return {
      app: null,
      credentialRef: clean(payload.credentialRef) || null,
      errorCount: results.length,
      job: updatedJob,
      platform,
      projectId: null,
      results,
      sentCount: 0,
      targetType,
      topicBase,
    };
  }
}
