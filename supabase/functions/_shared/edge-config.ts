import { createClient } from "npm:@supabase/supabase-js@2";

import {
  normalizeAppId,
  normalizeBundleId,
  normalizePackageName,
} from "./mobile-normalize.ts";

export type MobilePlatform = "android" | "ios";
export type StorePlatform = "google_play" | "apple_app_store";
export type CredentialPurpose = "firebase_admin" | "iap" | "review";

export type ConfigLookup = {
  appId?: string;
  appName?: string;
  bundleId?: string;
  credentialRef?: string;
  packageName?: string;
  platform?: MobilePlatform;
  productAppId?: string;
  storeAccountName?: string;
  storeProfileId?: string;
};

export type ResolvedMobileApp = {
  id: string;
  appIconUrl: string | null;
  appId: string | null;
  appLink: string | null;
  appName: string;
  bundleId: string | null;
  packageName: string | null;
  platform: MobilePlatform;
  status: string;
  storeAccountName: string;
  storePlatform: StorePlatform;
  storeProfileId: string;
};

export type ResolvedStoreProfile = {
  id: string;
  avatarUrl: string | null;
  issuerId: string | null;
  linkStore: string | null;
  platform: MobilePlatform;
  status: string;
  storeAccountName: string;
};

export type ResolvedCredential = {
  id: string;
  clientEmail: string | null;
  credentialPurpose: CredentialPurpose | null;
  credentialRef: string;
  keyId: string | null;
  issuerId: string | null;
  platform: MobilePlatform;
  projectId: string | null;
  secretFormat: "json" | "p8" | null;
  secretPayload: Record<string, unknown>;
  secretText: string;
  secretType: string | null;
  status: string;
  storeAccountName: string;
  storeProfileId: string;
  vaultSecretId: string | null;
  vaultSecretName: string | null;
  vaultSecretVersion: number;
};

export type ResolvedRuntimeConfig = {
  app: ResolvedMobileApp | null;
  credential: ResolvedCredential;
  platform: MobilePlatform;
  storePlatform: StorePlatform;
  storeProfile: ResolvedStoreProfile | null;
};

export type FirebaseAdminRuntimeConfig = ResolvedRuntimeConfig & {
  firebaseAdmin: {
    clientEmail: string | null;
    credential: ResolvedCredential;
    projectId: string | null;
    serviceAccount: Record<string, unknown>;
  };
};

export type GooglePlayRuntimeConfig = ResolvedRuntimeConfig & {
  googlePlay: {
    clientEmail: string | null;
    credential: ResolvedCredential;
    packageName: string;
    projectId: string | null;
    serviceAccount: Record<string, unknown>;
  };
};

export type AppleIapRuntimeConfig = ResolvedRuntimeConfig & {
  appleIap: {
    bundleId: string;
    credential: ResolvedCredential;
    issuerId: string;
    keyId: string;
    privateKey: string;
  };
};

export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, x-api-key, content-type, x-dispatch-secret, x-notification-queue-secret, x-review-fetch-secret",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    secretKeyFromDictionary() ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("NEXT_PUBLIC_SUPABASE_SECRET_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or service-role secret");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function secretKeyFromDictionary() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeys) return null;

  try {
    const parsed = JSON.parse(secretKeys) as Record<string, unknown>;
    return stringValue(parsed.default);
  } catch {
    return null;
  }
}

export type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nullableString(value: unknown) {
  const cleaned = clean(value);
  return cleaned || null;
}

function appNameLookup(input: ConfigLookup) {
  return clean(input.appName) || clean(input.productAppId);
}

function appIdLookup(input: ConfigLookup) {
  return normalizeAppId(input.appId) || normalizeAppId(input.productAppId);
}

function storePlatformFor(platform: MobilePlatform): StorePlatform {
  return platform === "android" ? "google_play" : "apple_app_store";
}

function inferPlatform(input: ConfigLookup): MobilePlatform {
  if (input.platform) return input.platform;
  if (clean(input.bundleId)) return "ios";
  return "android";
}

function parseSecretText(secretText: string, secretFormat: string): Record<string, unknown> {
  if (secretFormat === "json") {
    const parsed = JSON.parse(secretText) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    throw new Error("JSON credential payload must be an object");
  }

  return { value: secretText };
}

function normalizeApp(row: Record<string, unknown>, platform: MobilePlatform): ResolvedMobileApp {
  return {
    id: clean(row.id),
    appIconUrl: nullableString(row.app_icon_url),
    appId: nullableString(row.app_id),
    appLink: nullableString(row.app_link),
    appName: clean(row.app_name),
    bundleId: platform === "ios" ? nullableString(row.bundle_id) : null,
    packageName: platform === "android" ? nullableString(row.package_name) : null,
    platform,
    status: clean(row.status),
    storeAccountName: clean(row.store_account_name),
    storePlatform: storePlatformFor(platform),
    storeProfileId: clean(row.store_profile_id),
  };
}

function normalizeStoreProfile(row: Record<string, unknown>, platform: MobilePlatform): ResolvedStoreProfile {
  return {
    id: clean(row.id),
    avatarUrl: nullableString(row.avatar_url),
    issuerId: platform === "ios" ? nullableString(row.issuer_id) : null,
    linkStore: nullableString(row.link_store),
    platform,
    status: clean(row.status),
    storeAccountName: clean(row.store_account_name),
  };
}

function normalizeCredential(
  row: Record<string, unknown>,
  platform: MobilePlatform,
  secretText: string
): ResolvedCredential {
  const parseFormat = platform === "android" ? "json" : (clean(row.secret_format) as "json" | "p8");

  return {
    id: clean(row.id),
    clientEmail: nullableString(row.client_email),
    credentialPurpose: nullableString(row.credential_purpose) as CredentialPurpose | null,
    credentialRef: clean(row.credential_ref),
    keyId: platform === "android" ? nullableString(row.private_key_id) : nullableString(row.key_id),
    issuerId: platform === "ios" ? nullableString(row.issuer_id) : null,
    platform,
    projectId: nullableString(row.project_id),
    secretFormat: platform === "android" ? null : parseFormat,
    secretPayload: parseSecretText(secretText, parseFormat),
    secretText,
    secretType: platform === "android" ? null : clean(row.secret_type),
    status: clean(row.status),
    storeAccountName: clean(row.store_account_name),
    storeProfileId: clean(row.store_profile_id),
    vaultSecretId: nullableString(row.vault_secret_id),
    vaultSecretName: nullableString(row.vault_secret_name),
    vaultSecretVersion: Number(row.vault_secret_version ?? 0),
  };
}

async function findMobileApp(
  supabase: SupabaseAdminClient,
  platform: MobilePlatform,
  input: ConfigLookup
) {
  const table = platform === "android" ? "android_store_mappings" : "ios_store_mappings";
  const select =
    platform === "android"
      ? "id,store_profile_id,store_account_name,app_id,app_name,app_icon_url,app_link,package_name,status"
      : "id,store_profile_id,store_account_name,app_id,app_name,app_icon_url,app_link,bundle_id,status";
  const appId = appIdLookup(input);
  const appName = appNameLookup(input);
  const identifier = platform === "android" ? normalizePackageName(input.packageName) : normalizeBundleId(input.bundleId);
  const identifierColumn = platform === "android" ? "package_name" : "bundle_id";

  let query = supabase.from(table).select(select).eq("status", "active").limit(1);

  if (clean(input.storeProfileId)) {
    query = query.eq("store_profile_id", clean(input.storeProfileId));
    if (identifier) {
      query = query.eq(identifierColumn, identifier);
    } else if (appId) {
      query = query.eq("app_id", appId);
    } else if (appName) {
      query = query.eq("app_name", appName);
    }
  } else if (clean(input.storeAccountName) && identifier) {
    query = query.eq("store_account_name", clean(input.storeAccountName)).eq(identifierColumn, identifier);
  } else if (identifier) {
    query = query.eq(identifierColumn, identifier);
  } else if (clean(input.storeAccountName) && appId) {
    query = query.eq("store_account_name", clean(input.storeAccountName)).eq("app_id", appId);
  } else if (appId) {
    query = query.eq("app_id", appId);
  } else if (clean(input.storeAccountName) && appName) {
    query = query.eq("store_account_name", clean(input.storeAccountName)).eq("app_name", appName);
  } else if (identifier) {
    query = query.eq(platform === "android" ? "package_name" : "bundle_id", identifier);
  } else if (clean(input.storeAccountName)) {
    query = query.eq("store_account_name", clean(input.storeAccountName));
  } else if (appName) {
    query = query.eq("app_name", appName);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (data) return normalizeApp(data as Record<string, unknown>, platform);

  if (appId && identifier) {
    let fallbackQuery = supabase
      .from(table)
      .select(select)
      .eq("status", "active")
      .eq("app_id", appId)
      .limit(1);

    if (clean(input.storeProfileId)) {
      fallbackQuery = fallbackQuery.eq("store_profile_id", clean(input.storeProfileId));
    } else if (clean(input.storeAccountName)) {
      fallbackQuery = fallbackQuery.eq("store_account_name", clean(input.storeAccountName));
    }

    const { data: fallbackData, error: fallbackError } = await fallbackQuery.maybeSingle();
    if (fallbackError) throw fallbackError;
    if (fallbackData) {
      return normalizeApp(fallbackData as Record<string, unknown>, platform);
    }
  }

  return null;
}

async function findStoreProfile(
  supabase: SupabaseAdminClient,
  platform: MobilePlatform,
  input: ConfigLookup
) {
  const table = platform === "android" ? "android_store_profiles" : "ios_store_profiles";
  const select =
    platform === "android"
      ? "id,store_account_name,link_store,avatar_url,status"
      : "id,store_account_name,link_store,avatar_url,issuer_id,status";

  let query = supabase.from(table).select(select).eq("status", "active").limit(1);

  if (clean(input.storeProfileId)) {
    query = query.eq("id", clean(input.storeProfileId));
  } else if (clean(input.storeAccountName)) {
    query = query.eq("store_account_name", clean(input.storeAccountName));
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? normalizeStoreProfile(data as Record<string, unknown>, platform) : null;
}

async function readVaultSecret(supabase: SupabaseAdminClient, vaultSecretId: string | null) {
  if (!vaultSecretId) {
    throw new Error("Credential does not have a Vault secret");
  }

  const { data, error } = await supabase.rpc("system_tracking_get_vault_secret", {
    secret_id: vaultSecretId,
  });

  if (error) throw error;

  const secretText =
    typeof data === "string"
      ? data
      : data && typeof data === "object"
        ? stringValue((data as Record<string, unknown>).system_tracking_get_vault_secret)
        : null;
  if (!secretText) {
    throw new Error("Vault secret was not found or could not be decrypted");
  }

  return secretText;
}

async function findIosCredential(
  supabase: SupabaseAdminClient,
  purpose: CredentialPurpose,
  input: ConfigLookup & { resolvedStoreProfileId?: string | null }
) {
  const table = "ios_credentials";
  const select =
    "id,store_profile_id,credential_ref,secret_type,secret_format,credential_purpose,vault_secret_id,vault_secret_name,vault_secret_version,store_account_name,key_id,issuer_id,client_email,project_id,status";
  const credentialRef = clean(input.credentialRef);
  const storeProfileId = clean(input.resolvedStoreProfileId) || clean(input.storeProfileId);

  let query = supabase
    .from(table)
    .select(select)
    .eq("status", "active")
    .eq("credential_purpose", purpose)
    .limit(1);

  if (credentialRef) {
    query = query.eq("credential_ref", credentialRef);
  } else if (storeProfileId) {
    query = query.eq("store_profile_id", storeProfileId);
  } else if (clean(input.storeAccountName)) {
    query = query.eq("store_account_name", clean(input.storeAccountName));
  } else {
    throw new Error(`No ios ${purpose} credential lookup key was provided`);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`No active ios ${purpose} credential found`);
  }

  const row = data as Record<string, unknown>;
  const secretText = await readVaultSecret(supabase, nullableString(row.vault_secret_id));
  await supabase.from(table).update({ last_used_at: new Date().toISOString() }).eq("id", clean(row.id));

  return normalizeCredential(row, "ios", secretText);
}

async function findAndroidSharedServiceAccountCredential(
  supabase: SupabaseAdminClient,
  input: ConfigLookup & { resolvedStoreProfileId?: string | null }
) {
  const select =
    "id,store_profile_id,credential_ref,vault_secret_id,vault_secret_name,vault_secret_version,store_account_name,private_key_id,client_email,project_id,status";
  const credentialRef = clean(input.credentialRef);
  const storeProfileId = clean(input.resolvedStoreProfileId) || clean(input.storeProfileId);

  let query = supabase
    .from("android_credentials")
    .select(select)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (credentialRef) {
    query = query.eq("credential_ref", credentialRef);
  } else if (storeProfileId) {
    query = query.eq("store_profile_id", storeProfileId);
  } else if (clean(input.storeAccountName)) {
    query = query.eq("store_account_name", clean(input.storeAccountName));
  } else {
    throw new Error("No android service account credential lookup key was provided");
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("No active android service account credential found");
  }

  const row = data as Record<string, unknown>;
  const secretText = await readVaultSecret(supabase, nullableString(row.vault_secret_id));
  const credential = normalizeCredential(row, "android", secretText);

  await supabase
    .from("android_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", credential.id);

  return credential;
}

export async function resolveMobileAppConfig(
  supabase: SupabaseAdminClient,
  input: ConfigLookup
) {
  const platform = inferPlatform(input);
  return findMobileApp(supabase, platform, input);
}

export async function getRuntimeCredentialConfig(
  supabase: SupabaseAdminClient,
  input: ConfigLookup & { credentialPurpose?: CredentialPurpose; platform: MobilePlatform }
): Promise<ResolvedRuntimeConfig> {
  const platform = input.platform;
  const app = await findMobileApp(supabase, platform, input);
  const storeProfile =
    app
      ? await findStoreProfile(supabase, platform, { storeProfileId: app.storeProfileId })
      : await findStoreProfile(supabase, platform, input);
  const credentialLookup = {
    ...input,
    resolvedStoreProfileId: app?.storeProfileId ?? storeProfile?.id ?? null,
  };
  const credential =
    platform === "android"
      ? await findAndroidSharedServiceAccountCredential(supabase, credentialLookup)
      : await findIosCredential(supabase, input.credentialPurpose ?? "firebase_admin", credentialLookup);
  const resolvedStoreProfile =
    storeProfile ?? await findStoreProfile(supabase, platform, { storeProfileId: credential.storeProfileId });

  return {
    app,
    credential,
    platform,
    storePlatform: storePlatformFor(platform),
    storeProfile: resolvedStoreProfile,
  };
}

export async function getFirebaseAdminConfig(
  supabase: SupabaseAdminClient,
  input: ConfigLookup
): Promise<FirebaseAdminRuntimeConfig> {
  const platform = inferPlatform(input);
  const config = await getRuntimeCredentialConfig(supabase, {
    ...input,
    credentialPurpose: "firebase_admin",
    platform,
  });

  return {
    ...config,
    firebaseAdmin: {
      clientEmail: stringValue(config.credential.secretPayload.client_email) ?? config.credential.clientEmail,
      credential: config.credential,
      projectId: stringValue(config.credential.secretPayload.project_id) ?? config.credential.projectId,
      serviceAccount: config.credential.secretPayload,
    },
  };
}

export async function getGooglePlayIapConfig(
  supabase: SupabaseAdminClient,
  input: ConfigLookup
): Promise<GooglePlayRuntimeConfig> {
  const config = await getRuntimeCredentialConfig(supabase, {
    ...input,
    platform: "android",
  });
  const packageName = clean(input.packageName) || config.app?.packageName || "";

  if (!packageName) {
    throw new Error("Android packageName is required to use Google Play IAP config");
  }

  return {
    ...config,
    googlePlay: {
      clientEmail: stringValue(config.credential.secretPayload.client_email) ?? config.credential.clientEmail,
      credential: config.credential,
      packageName,
      projectId: stringValue(config.credential.secretPayload.project_id) ?? config.credential.projectId,
      serviceAccount: config.credential.secretPayload,
    },
  };
}

export async function getAppleIapConfig(
  supabase: SupabaseAdminClient,
  input: ConfigLookup
): Promise<AppleIapRuntimeConfig> {
  const config = await getRuntimeCredentialConfig(supabase, {
    ...input,
    credentialPurpose: "iap",
    platform: "ios",
  });
  const bundleId = clean(input.bundleId) || config.app?.bundleId || "";
  const privateKey = stringValue(config.credential.secretPayload.value) ?? stringValue(config.credential.secretPayload.private_key) ?? "";
  const keyId = config.credential.keyId ?? stringValue(config.credential.secretPayload.key_id) ?? "";
  const issuerId =
    config.credential.issuerId ??
    stringValue(config.credential.secretPayload.issuer_id) ??
    config.storeProfile?.issuerId ??
    "";

  if (!bundleId) {
    throw new Error("iOS bundleId is required to use Apple IAP config");
  }

  if (!privateKey || !keyId || !issuerId) {
    throw new Error("Apple IAP credential must include private key, key id and issuer id");
  }

  return {
    ...config,
    appleIap: {
      bundleId,
      credential: config.credential,
      issuerId,
      keyId,
      privateKey,
    },
  };
}
