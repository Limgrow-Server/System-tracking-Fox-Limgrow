import "server-only";

import { createSign } from "crypto";
import type { NotificationJob, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  rewriteStoreProviderUrl,
  type StoreProviderEndpointContext,
} from "@/lib/server/outbound/store-provider-endpoints";
import { getCredentialVaultSecret } from "@/lib/server/repositories/vault/secret.repository";
import { normalizeAppId } from "@/lib/tracking/identity";

type MobilePlatform = "android" | "ios";
type TargetType = "device" | "topic";

export type LocaleNotificationInput = {
  enabled?: boolean;
  languageCode?: string;
  message?: string;
  topicCode?: string;
  title?: string;
};

export type SendNotificationRequest = {
  appId?: string | null;
  appName?: string | null;
  bundleId?: string | null;
  credentialRef?: string | null;
  data?: unknown;
  deviceIds?: string[];
  deviceTokenIds?: string[];
  imageUrl?: string | null;
  jobId?: string | null;
  notifications?: unknown;
  packageName?: string | null;
  platform?: MobilePlatform | string | null;
  productAppId?: string | null;
  queuedBatchId?: string | null;
  scheduleId?: string | null;
  storeAccountName?: string | null;
  storeProfileId?: string | null;
  targetType?: TargetType | string | null;
  topicBase?: string | null;
};

type LocaleNotification = {
  body: string;
  title: string;
  topicCode: string;
};

type DeviceTarget = {
  appIdentifier: string | null;
  appId: string | null;
  bundleId: string | null;
  deviceId: string;
  firebaseProjectId: string | null;
  fcmToken: string;
  id: string;
  locale: string | null;
  packageName: string | null;
  productAppId: string | null;
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

export type LocalNotificationSendResult = {
  credentialRef: string | null;
  errorCount: number;
  job: NotificationJob | null;
  platform: MobilePlatform;
  projectId: string | null;
  results: SendResult[];
  sentCount: number;
  targetType: TargetType;
  topicBase: string;
};

type ResolvedMobileApp = {
  appId: string | null;
  appName: string;
  bundleId: string | null;
  packageName: string | null;
  storeAccountName: string;
  storeProfileId: string;
};

type ResolvedFirebaseCredential = {
  clientEmail: string | null;
  credentialRef: string;
  projectId: string | null;
  serviceAccount: Record<string, unknown>;
};

type FirebaseRuntimeConfig = {
  app: ResolvedMobileApp | null;
  credential: ResolvedFirebaseCredential;
};

const TITLE_MAX_LENGTH = 45;
const MESSAGE_MAX_LENGTH = 90;
const DEVICE_TOKEN_QUERY_BATCH_SIZE = 500;
const DB_WRITE_BATCH_SIZE = 500;
const DEFAULT_FCM_SEND_CONCURRENCY = 10;
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FIREBASE_CONFIG_CACHE_TTL_MS = 5 * 60_000;
const GOOGLE_TOKEN_CACHE_SKEW_MS = 5 * 60_000;

const googleTokenCache = new Map<
  string,
  { expiresAt: number; token: string }
>();
const firebaseConfigCache = new Map<
  string,
  {
    config: FirebaseRuntimeConfig;
    expiresAt: number;
  }
>();

const deviceTargetSelect = {
  appIdentifier: true,
  appId: true,
  bundleId: true,
  deviceId: true,
  firebaseProjectId: true,
  fcmToken: true,
  id: true,
  locale: true,
  packageName: true,
  productAppId: true,
} satisfies Prisma.DeviceTokenSelect;

type DeviceTargetRow = Prisma.DeviceTokenGetPayload<{
  select: typeof deviceTargetSelect;
}>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizePackageName(value: unknown) {
  return clean(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeBundleId(value: unknown) {
  return clean(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeAppIdentifier(input: {
  appId?: unknown;
  bundleId?: unknown;
  packageName?: unknown;
  platform?: unknown;
  productAppId?: unknown;
}) {
  const platform = clean(input.platform);
  if (platform === "android") {
    return (
      normalizePackageName(input.packageName) ||
      normalizeAppId(input.appId) ||
      normalizeAppId(input.productAppId)
    );
  }
  if (platform === "ios") {
    return (
      normalizeBundleId(input.bundleId) ||
      normalizeAppId(input.appId) ||
      normalizeAppId(input.productAppId)
    );
  }
  return (
    normalizePackageName(input.packageName) ||
    normalizeBundleId(input.bundleId) ||
    normalizeAppId(input.appId) ||
    normalizeAppId(input.productAppId)
  );
}

function inferPlatform(payload: SendNotificationRequest): MobilePlatform {
  if (payload.platform === "android" || payload.platform === "ios")
    return payload.platform;
  if (clean(payload.bundleId)) return "ios";
  return "android";
}

function normalizeTargetType(value: unknown): TargetType {
  return clean(value) === "device" ? "device" : "topic";
}

function topicSegment(value: unknown) {
  return clean(value)
    .replace(/^\/topics\//i, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9\-_.~%]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function notificationAppId(payload: SendNotificationRequest) {
  return (
    normalizeAppId(payload.appId) ||
    normalizeAppId(payload.productAppId) ||
    clean(payload.appName)
  );
}

function normalizeLocaleNotifications(
  payload: SendNotificationRequest,
): LocaleNotification[] {
  const rows = Array.isArray(payload.notifications)
    ? payload.notifications
        .filter((item) => item.enabled !== false)
        .map((item) => ({
          body: clean(item.message),
          title: clean(item.title),
          topicCode: topicSegment(
            clean(item.topicCode) || clean(item.languageCode),
          ).toLowerCase(),
        }))
    : [];

  if (!rows.length) throw new Error("notification_payload_required");

  rows.forEach((row) => {
    if (!row.topicCode) throw new Error("topic_code_required");
    if (!row.title || !row.body)
      throw new Error(`missing_title_or_message_for_${row.topicCode}`);
    if (row.title.length > TITLE_MAX_LENGTH) {
      throw new Error(
        `title_too_long_for_${row.topicCode}_max_${TITLE_MAX_LENGTH}`,
      );
    }
    if (row.body.length > MESSAGE_MAX_LENGTH) {
      throw new Error(
        `message_too_long_for_${row.topicCode}_max_${MESSAGE_MAX_LENGTH}`,
      );
    }
  });

  return rows;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => clean(item)).filter(Boolean)));
}

function objectPayload(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  throw new Error("data_payload_must_be_a_json_object");
}

function fcmDataPayload(value: Record<string, unknown>) {
  return Object.entries(value).reduce<Record<string, string>>(
    (items, [key, rawValue]) => {
      const cleanedKey = clean(key);
      if (!cleanedKey || rawValue === undefined || rawValue === null)
        return items;
      items[cleanedKey] =
        typeof rawValue === "object"
          ? JSON.stringify(rawValue)
          : String(rawValue);
      return items;
    },
    {},
  );
}

function primaryLocale(locales: LocaleNotification[]) {
  return locales.find((locale) => locale.topicCode === "en") ?? locales[0];
}

function chunks<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function intEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function fcmSendConcurrency() {
  return intEnv("FCM_SEND_CONCURRENCY", DEFAULT_FCM_SEND_CONCURRENCY, 1, 50);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
}

function parseSecretText(secretText: string, secretFormat?: string | null) {
  const normalizedFormat = clean(secretFormat).toLowerCase();
  if (!normalizedFormat || normalizedFormat === "json") {
    const parsed = JSON.parse(secretText) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("JSON credential payload must be an object");
  }

  return { value: secretText };
}

async function findMobileApp(
  platform: MobilePlatform,
  input: SendNotificationRequest,
): Promise<ResolvedMobileApp | null> {
  const appId =
    normalizeAppId(input.appId) || normalizeAppId(input.productAppId);
  const appName = clean(input.appName) || clean(input.productAppId);
  const identifier =
    platform === "android"
      ? normalizePackageName(input.packageName)
      : normalizeBundleId(input.bundleId);
  const storeProfileId = clean(input.storeProfileId);
  const storeAccountName = clean(input.storeAccountName);

  if (platform === "android") {
    const whereCandidates: Prisma.AndroidStoreMappingWhereInput[] = [];
    if (storeProfileId) {
      if (identifier)
        whereCandidates.push({ packageName: identifier, storeProfileId });
      else if (appId) whereCandidates.push({ appId, storeProfileId });
      else if (appName) whereCandidates.push({ appName, storeProfileId });
    } else if (storeAccountName && identifier) {
      whereCandidates.push({ packageName: identifier, storeAccountName });
    } else if (identifier) {
      whereCandidates.push({ packageName: identifier });
    } else if (storeAccountName && appId) {
      whereCandidates.push({ appId, storeAccountName });
    } else if (appId) {
      whereCandidates.push({ appId });
    } else if (storeAccountName && appName) {
      whereCandidates.push({ appName, storeAccountName });
    } else if (storeAccountName) {
      whereCandidates.push({ storeAccountName });
    } else if (appName) {
      whereCandidates.push({ appName });
    }

    for (const where of whereCandidates) {
      const app = await prisma.androidStoreMapping.findFirst({
        where: { ...where, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
      });
      if (app) {
        return {
          appId: app.appId,
          appName: app.appName,
          bundleId: null,
          packageName: app.packageName,
          storeAccountName: app.storeAccountName,
          storeProfileId: app.storeProfileId,
        };
      }
    }
    return null;
  }

  const whereCandidates: Prisma.IosStoreMappingWhereInput[] = [];
  if (storeProfileId) {
    if (identifier)
      whereCandidates.push({ bundleId: identifier, storeProfileId });
    else if (appId) whereCandidates.push({ appId, storeProfileId });
    else if (appName) whereCandidates.push({ appName, storeProfileId });
  } else if (storeAccountName && identifier) {
    whereCandidates.push({ bundleId: identifier, storeAccountName });
  } else if (identifier) {
    whereCandidates.push({ bundleId: identifier });
  } else if (storeAccountName && appId) {
    whereCandidates.push({ appId, storeAccountName });
  } else if (appId) {
    whereCandidates.push({ appId });
  } else if (storeAccountName && appName) {
    whereCandidates.push({ appName, storeAccountName });
  } else if (storeAccountName) {
    whereCandidates.push({ storeAccountName });
  } else if (appName) {
    whereCandidates.push({ appName });
  }

  for (const where of whereCandidates) {
    const app = await prisma.iosStoreMapping.findFirst({
      where: { ...where, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    });
    if (app) {
      return {
        appId: app.appId,
        appName: app.appName,
        bundleId: app.bundleId,
        packageName: null,
        storeAccountName: app.storeAccountName,
        storeProfileId: app.storeProfileId,
      };
    }
  }

  return null;
}

async function resolveFirebaseConfig(
  payload: SendNotificationRequest,
): Promise<FirebaseRuntimeConfig> {
  const platform = inferPlatform(payload);
  const app = await findMobileApp(platform, payload);
  const credentialRef = clean(payload.credentialRef);
  const storeProfileId = app?.storeProfileId || clean(payload.storeProfileId);
  const storeAccountName =
    app?.storeAccountName || clean(payload.storeAccountName);

  if (platform === "android") {
    const credential = await prisma.androidCredential.findFirst({
      where: {
        status: "ACTIVE",
        ...(credentialRef
          ? { credentialRef }
          : storeProfileId
            ? { storeProfileId }
            : storeAccountName
              ? { storeAccountName }
              : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!credential)
      throw new Error("No active android service account credential found");

    const secretText = await getCredentialVaultSecret(credential.vaultSecretId);
    const serviceAccount = parseSecretText(secretText, "json");
    await prisma.androidCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      app,
      credential: {
        clientEmail:
          stringValue(serviceAccount.client_email) ?? credential.clientEmail,
        credentialRef: credential.credentialRef,
        projectId:
          stringValue(serviceAccount.project_id) ?? credential.projectId,
        serviceAccount,
      },
    };
  }

  const credential = await prisma.iosCredential.findFirst({
    where: {
      credentialPurpose: "FIREBASE_ADMIN",
      status: "ACTIVE",
      ...(credentialRef
        ? { credentialRef }
        : storeProfileId
          ? { storeProfileId }
          : storeAccountName
            ? { storeAccountName }
            : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!credential)
    throw new Error("No active ios firebase_admin credential found");

  const secretText = await getCredentialVaultSecret(credential.vaultSecretId);
  const serviceAccount = parseSecretText(secretText, credential.secretFormat);
  await prisma.iosCredential.update({
    where: { id: credential.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    app,
    credential: {
      clientEmail:
        stringValue(serviceAccount.client_email) ?? credential.clientEmail,
      credentialRef: credential.credentialRef,
      projectId: stringValue(serviceAccount.project_id) ?? credential.projectId,
      serviceAccount,
    },
  };
}

function firebaseConfigCacheKey(payload: SendNotificationRequest) {
  const platform = inferPlatform(payload);

  return JSON.stringify([
    platform,
    clean(payload.credentialRef),
    clean(payload.storeProfileId),
    clean(payload.storeAccountName),
    normalizeAppId(payload.appId),
    normalizeAppId(payload.productAppId),
    normalizePackageName(payload.packageName),
    normalizeBundleId(payload.bundleId),
    clean(payload.appName),
  ]);
}

async function resolveCachedFirebaseConfig(payload: SendNotificationRequest) {
  const cacheKey = firebaseConfigCacheKey(payload);
  const cached = firebaseConfigCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  const config = await resolveFirebaseConfig(payload);
  firebaseConfigCache.set(cacheKey, {
    config,
    expiresAt: Date.now() + FIREBASE_CONFIG_CACHE_TTL_MS,
  });

  return config;
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function signGoogleJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKeyPem: string,
) {
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKeyPem);
  return `${signingInput}.${base64Url(signature)}`;
}

async function googleAccessToken(
  serviceAccount: Record<string, unknown>,
  context: StoreProviderEndpointContext,
) {
  const clientEmail = stringValue(serviceAccount.client_email);
  const privateKey = stringValue(serviceAccount.private_key);
  const audienceTokenUri =
    stringValue(serviceAccount.token_uri) ??
    "https://oauth2.googleapis.com/token";
  const tokenUri = rewriteStoreProviderUrl(
    "googleOAuthToken",
    audienceTokenUri,
    context,
  );

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Firebase service account must include client_email and private_key",
    );
  }

  const cacheKey = `${clientEmail}:${FCM_SCOPE}:${audienceTokenUri}:${tokenUri}`;
  const cached = googleTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + GOOGLE_TOKEN_CACHE_SKEW_MS) {
    return cached.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = signGoogleJwt(
    { alg: "RS256", typ: "JWT" },
    {
      aud: audienceTokenUri,
      exp: now + 3600,
      iat: now,
      iss: clientEmail,
      scope: FCM_SCOPE,
    },
    privateKey,
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
  if (!accessToken)
    throw new Error("Google OAuth response did not include access_token");
  const expiresInSeconds = Number(body.expires_in);
  googleTokenCache.set(cacheKey, {
    expiresAt:
      Date.now() +
      (Number.isFinite(expiresInSeconds) ? expiresInSeconds : 3600) * 1000,
    token: accessToken,
  });
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
    message.android = { notification: { image: input.imageUrl } };
    message.apns = {
      fcm_options: { image: input.imageUrl },
      payload: { aps: { "mutable-content": 1 } },
    };
  }

  return { message };
}

function redactedFcmPayload(payload: ReturnType<typeof fcmPayload>) {
  const message = { ...payload.message };
  if ("token" in message) message.token = "fcm-token-redacted";
  return { ...payload, message };
}

function logTargetValue(input: {
  deviceId?: string | null;
  targetType: TargetType;
  targetValue: string;
}) {
  if (input.targetType === "device")
    return input.deviceId ?? "fcm-token-redacted";
  return input.targetValue;
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
  payload: ReturnType<typeof fcmPayload>,
) {
  if (input.platform !== "ios") return;

  console.info("[notification-worker] iOS FCM request payload", {
    deviceId: input.deviceId ?? null,
    fcmPayload: redactedFcmPayload(payload),
    platform: input.platform,
    projectId: input.projectId,
    targetType: input.targetType,
    targetValue: logTargetValue(input),
    topicCode: input.topicCode ?? null,
  });
}

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

function logSendFailure(message: string, details: Record<string, unknown>) {
  console.error(`[notification-worker] ${message}`, details);
}

function formatFcmError(
  body: unknown,
  projectId: string,
  clientEmail: string | null,
) {
  const message =
    body && typeof body === "object" && "error" in body
      ? (stringValue((body.error as Record<string, unknown>)?.message) ??
        JSON.stringify(body))
      : typeof body === "string"
        ? body
        : JSON.stringify(body);

  if (message.includes("cloudmessaging.messages.create")) {
    return `${message}. Grant Firebase Cloud Messaging API Admin to ${clientEmail ?? "the service account"} in project ${projectId}.`;
  }

  return message.slice(0, 600);
}

function fcmDetailErrorCode(body: unknown) {
  const error =
    body && typeof body === "object" && "error" in body
      ? (body as Record<string, unknown>).error
      : null;
  if (!error || typeof error !== "object") return null;

  const details = Array.isArray((error as Record<string, unknown>).details)
    ? ((error as Record<string, unknown>).details as unknown[])
    : [];
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

  const error =
    body && typeof body === "object" && "error" in body
      ? (body as Record<string, unknown>).error
      : null;
  if (!error || typeof error !== "object") return null;

  return stringValue((error as Record<string, unknown>).status);
}

function userFacingFcmError(code: string | null, formattedError: string) {
  if (code === "UNREGISTERED") return "Người dùng đã tắt thông báo.";
  if (code === "THIRD_PARTY_AUTH_ERROR") {
    return "Thiếu hoặc sai APNs Auth Key/Certificate trong Firebase project của iOS app.";
  }
  return formattedError;
}

function isInvalidFcmTokenError(input: {
  body: unknown;
  formattedError: string;
}) {
  const code = fcmDetailErrorCode(input.body);
  if (code === "UNREGISTERED") return true;

  const message = input.formattedError.toLowerCase();
  if (code === "INVALID_ARGUMENT") {
    return (
      message.includes("registration token") ||
      message.includes("fcm token") ||
      message.includes("token is not")
    );
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
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    const formattedError = formatFcmError(
      body,
      input.projectId,
      input.clientEmail,
    );
    const code = fcmErrorCode(body);
    const error = userFacingFcmError(code, formattedError);
    const invalidToken = isInvalidFcmTokenError({ body, formattedError });

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
      targetValue:
        input.targetType === "device"
          ? (input.deviceId ?? input.targetValue)
          : input.targetValue,
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
    targetValue:
      input.targetType === "device"
        ? (input.deviceId ?? input.targetValue)
        : input.targetValue,
    topicCode: input.topicCode ?? null,
  };
}

async function getDeviceTargets(input: {
  appId?: string | null;
  appName?: string | null;
  bundleId?: string | null;
  deviceIds: string[];
  deviceTokenIds: string[];
  packageName?: string | null;
  platform: MobilePlatform;
  productAppId?: string | null;
}) {
  if (!input.deviceIds.length && !input.deviceTokenIds.length) return [];

  const rows: DeviceTargetRow[] = [];
  if (input.deviceTokenIds.length) {
    for (const tokenIdBatch of chunks(
      input.deviceTokenIds,
      DEVICE_TOKEN_QUERY_BATCH_SIZE,
    )) {
      rows.push(
        ...(await prisma.deviceToken.findMany({
          select: deviceTargetSelect,
          where: {
            id: { in: tokenIdBatch },
            platform: input.platform,
            status: "active",
          },
        })),
      );
    }
  } else {
    for (const deviceIdBatch of chunks(
      input.deviceIds,
      DEVICE_TOKEN_QUERY_BATCH_SIZE,
    )) {
      rows.push(
        ...(await prisma.deviceToken.findMany({
          select: deviceTargetSelect,
          where: {
            deviceId: { in: deviceIdBatch },
            platform: input.platform,
            status: "active",
          },
        })),
      );
    }
  }

  const appId = normalizeAppId(input.appId);
  const appName = clean(input.appName);
  const packageName = normalizePackageName(input.packageName);
  const bundleId = normalizeBundleId(input.bundleId);
  const productAppId = normalizeAppId(input.productAppId);
  const requestedAppIdentifier = normalizeAppIdentifier({
    appId,
    bundleId,
    packageName,
    platform: input.platform,
    productAppId,
  });
  const requestedAppKeys = Array.from(
    new Set(
      [appId, productAppId, appId || productAppId ? "" : appName].filter(
        Boolean,
      ),
    ),
  );

  return rows
    .map((record): DeviceTarget => ({
      appIdentifier: record.appIdentifier,
      appId: record.appId,
      bundleId: record.bundleId,
      deviceId: record.deviceId,
      firebaseProjectId: record.firebaseProjectId,
      fcmToken: record.fcmToken,
      id: record.id,
      locale: record.locale,
      packageName: record.packageName,
      productAppId: record.productAppId,
    }))
    .filter((device) => {
      if (!device.id || !device.deviceId || !device.fcmToken) return false;
      const deviceAppKeys = [
        normalizeAppId(device.appId),
        normalizeAppId(device.productAppId),
      ].filter(Boolean);
      if (requestedAppKeys.length && deviceAppKeys.length) {
        return deviceAppKeys.some((deviceKey) =>
          requestedAppKeys.includes(deviceKey),
        );
      }
      if (
        requestedAppIdentifier &&
        device.appIdentifier === requestedAppIdentifier
      )
        return true;
      if (packageName && device.packageName === packageName) return true;
      if (bundleId && device.bundleId === bundleId) return true;
      return !requestedAppKeys.length && !packageName && !bundleId;
    });
}

function localeForDevice(device: DeviceTarget, locales: LocaleNotification[]) {
  const code = clean(device.locale).split(/[-_]/)[0].toLowerCase();
  return (
    locales.find((locale) => locale.topicCode === code) ??
    locales.find((locale) => locale.topicCode === "en") ??
    locales[0]
  );
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
  status?: number;
  targetType: TargetType;
  targetValue: string;
  topicCode?: string | null;
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

async function writeEvents(input: {
  jobId: string;
  platform: MobilePlatform;
  results: SendResult[];
}) {
  const rows = input.results.map((result) => ({
    deviceId: result.deviceId,
    deviceTokenId: result.deviceTokenId,
    errorCode: result.ok
      ? null
      : result.invalidToken
        ? "fcm_token_invalid"
        : (result.fcmErrorCode ?? `fcm_http_${result.status}`),
    errorDetail: result.error,
    eventType: result.ok ? "fcm_sent" : "fcm_failed",
    jobId: input.jobId,
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
      invalidToken: result.invalidToken,
      topicCode: result.topicCode,
    } as Prisma.InputJsonValue,
    notificationId: input.jobId,
    platform: input.platform,
    providerMessageId: result.providerMessageId,
    status: result.ok ? "sent" : "failed",
    targetType: result.targetType,
    targetValue: result.targetValue,
  }));

  for (const rowBatch of chunks(rows, DB_WRITE_BATCH_SIZE)) {
    await prisma.notificationEvent.createMany({ data: rowBatch });
  }
}

async function markInvalidDeviceTokens(input: {
  platform: MobilePlatform;
  results: SendResult[];
}) {
  const invalidDeviceTokenIds = Array.from(
    new Set(
      input.results
        .filter((result) => result.invalidToken && result.deviceTokenId)
        .map((result) => result.deviceTokenId!),
    ),
  );

  if (!invalidDeviceTokenIds.length) return;

  for (const tokenIdBatch of chunks(
    invalidDeviceTokenIds,
    DB_WRITE_BATCH_SIZE,
  )) {
    await prisma.deviceToken.updateMany({
      where: {
        id: { in: tokenIdBatch },
        platform: input.platform,
      },
      data: {
        status: "invalid",
        updatedAt: new Date(),
      },
    });
  }
}

async function createNotificationJobForLocalSend(input: {
  actorEmail: string | null;
  dataPayload: Record<string, unknown>;
  imageUrl: string;
  initialTargetValues: string[];
  locales: LocaleNotification[];
  payload: SendNotificationRequest;
  platform: MobilePlatform;
  targetType: TargetType;
  topicBase: string;
}) {
  const appName =
    clean(input.payload.appName) ||
    clean(input.payload.productAppId) ||
    input.topicBase ||
    "unknown_app";
  const appId =
    normalizeAppId(input.payload.appId) ||
    normalizeAppId(input.payload.productAppId) ||
    null;
  const firstLocale = primaryLocale(input.locales);

  return prisma.notificationJob.create({
    data: {
      appId,
      appName,
      bundleId:
        input.platform === "ios" ? clean(input.payload.bundleId) || null : null,
      credentialRef: clean(input.payload.credentialRef) || null,
      dataPayload: input.dataPayload as Prisma.InputJsonValue,
      imageUrl: input.imageUrl || null,
      localePayload: input.locales as unknown as Prisma.InputJsonValue,
      message: firstLocale?.body ?? null,
      packageName:
        input.platform === "android"
          ? clean(input.payload.packageName) || null
          : null,
      platform: input.platform,
      requestedBy: input.actorEmail,
      scheduleId: clean(input.payload.scheduleId) || null,
      status: "sending",
      storeAccountName: clean(input.payload.storeAccountName) || null,
      storePlatform:
        input.platform === "android" ? "google_play" : "apple_app_store",
      storeProfileId: clean(input.payload.storeProfileId) || null,
      targetType: input.targetType,
      targetValues: input.initialTargetValues,
      title: firstLocale?.title ?? null,
      topicBase: input.topicBase || "device",
    },
  });
}

async function updateNotificationJobAfterLocalSend(input: {
  credentialRef?: string | null;
  errorCount: number;
  jobId: string;
  platform: MobilePlatform;
  projectId?: string | null;
  resolvedPayload?: SendNotificationRequest;
  sentCount: number;
  targetValues: string[];
}) {
  const status = input.sentCount > 0 ? "sent" : "failed";

  return prisma.notificationJob.update({
    where: { id: input.jobId },
    data: {
      appId: input.resolvedPayload
        ? normalizeAppId(input.resolvedPayload.appId) ||
          normalizeAppId(input.resolvedPayload.productAppId) ||
          null
        : undefined,
      appName: input.resolvedPayload
        ? clean(input.resolvedPayload.appName) ||
          clean(input.resolvedPayload.productAppId) ||
          "unknown_app"
        : undefined,
      bundleId:
        input.resolvedPayload && input.platform === "ios"
          ? clean(input.resolvedPayload.bundleId) || null
          : undefined,
      credentialRef: input.credentialRef ?? null,
      errorCount: input.errorCount,
      packageName:
        input.resolvedPayload && input.platform === "android"
          ? clean(input.resolvedPayload.packageName) || null
          : undefined,
      projectId: input.projectId ?? null,
      sentAt: new Date(),
      sentCount: input.sentCount,
      status,
      storeAccountName: input.resolvedPayload
        ? clean(input.resolvedPayload.storeAccountName) || null
        : undefined,
      storeProfileId: input.resolvedPayload
        ? clean(input.resolvedPayload.storeProfileId) || null
        : undefined,
      targetValues: input.targetValues,
      updatedAt: new Date(),
    },
  });
}

export async function sendNotificationPayloadLocal(
  payload: SendNotificationRequest,
  actorEmail: string | null = null,
): Promise<LocalNotificationSendResult> {
  const platform = inferPlatform(payload);
  const appId = notificationAppId(payload);
  const targetType = normalizeTargetType(payload.targetType);
  const locales = normalizeLocaleNotifications(payload);
  const dataPayload = objectPayload(payload.data);
  const baseFcmData = fcmDataPayload(dataPayload);
  const imageUrl = clean(payload.imageUrl);
  const deviceTokenIds = stringArray(payload.deviceTokenIds);
  const deviceIds = stringArray(payload.deviceIds);
  const deviceTargetValues = deviceTokenIds.length ? deviceTokenIds : deviceIds;
  const targetValueKind = deviceTokenIds.length
    ? "device_token_id"
    : "device_id";
  const topicBase = topicSegment(
    clean(payload.topicBase) ||
      appId ||
      clean(payload.appName) ||
      clean(payload.productAppId) ||
      (platform === "android"
        ? clean(payload.packageName)
        : clean(payload.bundleId)) ||
      "notification",
  );
  const initialTargetValues =
    targetType === "device"
      ? deviceTargetValues
      : locales.map((locale) => `${topicBase}-${locale.topicCode}`);
  const queuedJobId = clean(payload.jobId);

  if (targetType === "device" && !deviceTargetValues.length)
    throw new Error("device_targets_required");
  if (targetType === "topic" && !topicBase)
    throw new Error("topic_base_required");

  const createdJob = queuedJobId
    ? null
    : await createNotificationJobForLocalSend({
        actorEmail,
        dataPayload,
        imageUrl,
        initialTargetValues,
        locales,
        payload,
        platform,
        targetType,
        topicBase,
      });
  const jobId = queuedJobId || createdJob?.id || "";

  try {
    const config = await resolveCachedFirebaseConfig(payload);
    const serviceAccount = config.credential.serviceAccount;
    const projectId =
      stringValue(serviceAccount.project_id) ?? config.credential.projectId;
    const clientEmail =
      stringValue(serviceAccount.client_email) ?? config.credential.clientEmail;

    if (!projectId)
      throw new Error("Firebase service account must include project_id");

    const resolvedPayload = {
      ...payload,
      appId: config.app?.appId ?? payload.appId,
      appName: config.app?.appName ?? payload.appName,
      bundleId: config.app?.bundleId ?? payload.bundleId,
      packageName: config.app?.packageName ?? payload.packageName,
      storeAccountName:
        config.app?.storeAccountName ?? payload.storeAccountName,
      storeProfileId: config.app?.storeProfileId ?? payload.storeProfileId,
    };
    const providerContext: StoreProviderEndpointContext = {
      appId: resolvedPayload.appId,
      appIdentifier:
        platform === "android"
          ? resolvedPayload.packageName
          : resolvedPayload.bundleId,
      bundleId: resolvedPayload.bundleId,
      firebaseProjectId: projectId,
      packageName: resolvedPayload.packageName,
      platform,
      productAppId: resolvedPayload.productAppId,
      projectId,
      storeAccountName: resolvedPayload.storeAccountName,
      storeProfileId: resolvedPayload.storeProfileId,
    };
    const deliveryData = {
      ...baseFcmData,
      notificationAppId: normalizeAppId(resolvedPayload.appId) || appId || "",
      notificationId: jobId,
      notificationJobId: jobId,
      notificationPlatform: platform,
    };
    const accessToken = await googleAccessToken(
      serviceAccount,
      providerContext,
    );
    const endpoint = rewriteStoreProviderUrl(
      "firebaseFcm",
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
      providerContext,
    );
    const results: SendResult[] = [];

    if (targetType === "topic") {
      for (const locale of locales) {
        results.push(
          await sendFcm({
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
          }),
        );
      }
    } else {
      const devices = await getDeviceTargets({
        appId: resolvedPayload.appId,
        appName: resolvedPayload.appName,
        bundleId: resolvedPayload.bundleId,
        deviceIds,
        deviceTokenIds,
        packageName: resolvedPayload.packageName,
        platform,
        productAppId: resolvedPayload.productAppId,
      });
      const devicesByTarget = new Map(
        devices.map((device) => [
          deviceTokenIds.length ? device.id : device.deviceId,
          device,
        ]),
      );

      results.push(
        ...(await mapWithConcurrency(
          deviceTargetValues,
          fcmSendConcurrency(),
          async (targetValue) => {
            const device = devicesByTarget.get(targetValue);
            if (!device) {
              logSendFailure("No active FCM token found for requested device", {
                appId: normalizeAppId(resolvedPayload.appId) || appId || null,
                bundleId: clean(resolvedPayload.bundleId) || null,
                deviceId: targetValueKind === "device_id" ? targetValue : null,
                deviceTokenId:
                  targetValueKind === "device_token_id" ? targetValue : null,
                packageName: clean(resolvedPayload.packageName) || null,
                platform,
                targetType,
                targetValueKind,
              });

              return failedResult({
                deviceId: targetValueKind === "device_id" ? targetValue : null,
                deviceTokenId:
                  targetValueKind === "device_token_id" ? targetValue : null,
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
          },
        )),
      );
    }

    const sentCount = results.filter((result) => result.ok).length;
    const errorCount = results.length - sentCount;
    if (errorCount > 0) {
      logSendFailure("Notification batch finished with failed targets", {
        appId: normalizeAppId(resolvedPayload.appId) || appId || null,
        credentialProjectId: projectId,
        credentialRef: config.credential.credentialRef,
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
            targetValue:
              result.targetType === "device"
                ? (result.deviceId ?? "fcm-token-redacted")
                : result.targetValue,
            topicCode: result.topicCode,
          })),
        jobId,
        platform,
        sentCount,
        targetType,
        totalTargets: results.length,
      });
    }

    await writeEvents({ jobId, platform, results });
    await markInvalidDeviceTokens({ platform, results });
    const updatedJob = createdJob
      ? await updateNotificationJobAfterLocalSend({
          credentialRef: config.credential.credentialRef,
          errorCount,
          jobId,
          platform,
          projectId,
          resolvedPayload,
          sentCount,
          targetValues:
            targetType === "device"
              ? initialTargetValues
              : results.map((result) => result.targetValue),
        })
      : null;

    return {
      credentialRef: config.credential.credentialRef,
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
    const failureMessage =
      error instanceof Error
        ? error.message
        : "Unknown notification send error";
    logSendFailure("Notification batch failed before FCM send completed", {
      appId,
      error: errorForLog(error),
      jobId,
      platform,
      targetType,
      targetValues: deviceTargetValues,
      topicBase,
    });

    const failedTargets = deviceTargetValues.length
      ? deviceTargetValues
      : [topicBase];
    const results = failedTargets.map((targetValue) =>
      failedResult({
        deviceId: targetValueKind === "device_id" ? targetValue : null,
        deviceTokenId:
          targetValueKind === "device_token_id" ? targetValue : null,
        error: failureMessage,
        targetType,
        targetValue,
      }),
    );
    await writeEvents({ jobId, platform, results });
    const updatedJob = createdJob
      ? await updateNotificationJobAfterLocalSend({
          credentialRef: clean(payload.credentialRef) || null,
          errorCount: results.length,
          jobId,
          platform,
          projectId: null,
          sentCount: 0,
          targetValues: initialTargetValues,
        })
      : null;

    return {
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
