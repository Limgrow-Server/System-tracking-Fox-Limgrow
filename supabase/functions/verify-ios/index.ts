import {
  clean,
  corsHeaders,
  createAdminClient,
  jsonResponse as json,
  stringValue,
  type SupabaseAdminClient,
} from "../_shared/edge-config.ts";

type VerifyIosRequest = {
  productAppId?: string;
  bundleId?: string;
  transactionId?: string;
  productId?: string;
  environment?: "production" | "sandbox";
  userId?: string;
  credentialRef?: string;
};

type StoreAuthContext = {
  issuerId: string | null;
  storeAccountName: string;
  storeProfileId: string;
  userId: string;
};

type AuthorizedIosApp = {
  id: string;
  appIconUrl: string | null;
  appLink: string | null;
  appName: string;
  bundleId: string;
  packageName: null;
  platform: "ios";
  status: string;
  storeAccountName: string;
  storePlatform: "apple_app_store";
  storeProfileId: string;
};

type AppleIapCredential = {
  credentialRef: string;
  issuerId: string;
  keyId: string;
  privateKey: string;
};

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

async function authenticateStoreUser(
  request: Request,
  supabase: SupabaseAdminClient
): Promise<StoreAuthContext> {
  const token = extractBearerToken(request);
  if (!token) {
    throw Object.assign(new Error("missing_auth_token"), { httpStatus: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    throw Object.assign(new Error(authError?.message ?? "invalid_auth_token"), {
      httpStatus: 401,
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("ios_store_profiles")
    .select("id,store_account_name,status,issuer_id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) {
    throw Object.assign(new Error("store_not_linked"), { httpStatus: 403 });
  }

  if (profile.status !== "active") {
    throw Object.assign(new Error("store_inactive"), { httpStatus: 403 });
  }

  return {
    issuerId: stringValue(profile.issuer_id),
    storeAccountName: clean(profile.store_account_name),
    storeProfileId: clean(profile.id),
    userId: user.id,
  };
}

function base64Url(input: string | ArrayBuffer) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeJwsPayload(jws: string) {
  const [, payload] = jws.split(".");
  if (!payload) return null;
  return JSON.parse(decodeBase64Url(payload)) as Record<string, unknown>;
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function signAppleJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKeyPem: string) {
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64Url(signature)}`;
}

function timestampFromMillis(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? new Date(numberValue).toISOString() : null;
}

function applePriceMilliunits(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEnvironment(value: unknown) {
  return clean(value).toLowerCase() === "sandbox" ? "sandbox" : "production";
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

async function resolveAppleIapCredential(
  supabase: SupabaseAdminClient,
  authCtx: StoreAuthContext
): Promise<AppleIapCredential> {
  const select =
    "id,store_profile_id,credential_ref,secret_format,credential_purpose,vault_secret_id,vault_secret_name,vault_secret_version,store_account_name,key_id,issuer_id,status";

  const { data, error } = await supabase
    .from("ios_credentials")
    .select(select)
    .eq("store_profile_id", authCtx.storeProfileId)
    .eq("credential_purpose", "iap")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("credential_not_found");

  const secretText = await readVaultSecret(supabase, stringValue(data.vault_secret_id));
  const secretPayload = parseSecretText(secretText, clean(data.secret_format) || "p8");
  const privateKey =
    stringValue(secretPayload.value) ?? stringValue(secretPayload.private_key) ?? "";
  const keyId = stringValue(data.key_id) ?? stringValue(secretPayload.key_id) ?? "";
  const issuerId =
    stringValue(data.issuer_id) ??
    stringValue(secretPayload.issuer_id) ??
    authCtx.issuerId ??
    "";

  if (!privateKey || !keyId || !issuerId) {
    throw new Error("Apple IAP credential must include private key, key id and issuer id");
  }

  await supabase
    .from("ios_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    credentialRef: clean(data.credential_ref),
    issuerId,
    keyId,
    privateKey,
  };
}

async function verifyBundleAuthorization(
  supabase: SupabaseAdminClient,
  storeProfileId: string,
  bundleId: string
): Promise<AuthorizedIosApp> {
  const { data, error } = await supabase
    .from("ios_store_mappings")
    .select("id,store_profile_id,store_account_name,app_name,app_icon_url,app_link,bundle_id,status")
    .eq("store_profile_id", storeProfileId)
    .eq("bundle_id", bundleId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("bundle_not_authorized"), {
      httpStatus: 403,
    });
  }

  return {
    id: clean(data.id),
    appIconUrl: stringValue(data.app_icon_url),
    appLink: stringValue(data.app_link),
    appName: clean(data.app_name),
    bundleId: clean(data.bundle_id),
    packageName: null,
    platform: "ios",
    status: clean(data.status),
    storeAccountName: clean(data.store_account_name),
    storePlatform: "apple_app_store",
    storeProfileId: clean(data.store_profile_id),
  };
}

async function appleServerToken(credential: AppleIapCredential, bundleId: string) {
  const now = Math.floor(Date.now() / 1000);
  return signAppleJwt(
    { alg: "ES256", kid: credential.keyId, typ: "JWT" },
    {
      iss: credential.issuerId,
      iat: now,
      exp: now + 900,
      aud: "appstoreconnect-v1",
      bid: bundleId,
    },
    credential.privateKey
  );
}

async function verifyApple(
  supabase: SupabaseAdminClient,
  authCtx: StoreAuthContext,
  payload: VerifyIosRequest
) {
  const bundleId = clean(payload.bundleId);
  const transactionId = clean(payload.transactionId);

  if (!bundleId || !transactionId) throw new Error("bundleId and transactionId are required");

  const app = await verifyBundleAuthorization(supabase, authCtx.storeProfileId, bundleId);
  const credential = await resolveAppleIapCredential(supabase, authCtx);
  const token = await appleServerToken(credential, bundleId);
  const baseUrl =
    payload.environment === "sandbox"
      ? "https://api.storekit-sandbox.itunes.apple.com"
      : "https://api.storekit.itunes.apple.com";

  const response = await fetch(`${baseUrl}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const provider = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Apple transaction verify failed: ${JSON.stringify(provider)}`);
  }

  const signedTransactionInfo = stringValue(provider.signedTransactionInfo);
  const decoded = signedTransactionInfo ? decodeJwsPayload(signedTransactionInfo) : null;
  const decodedBundleId = stringValue(decoded?.bundleId);
  if (decodedBundleId && decodedBundleId !== bundleId) {
    throw new Error("Apple transaction bundleId does not match requested app config");
  }

  const priceMilliunits = applePriceMilliunits(decoded?.price);
  const state = decoded?.revocationDate ? "revoked" : "purchased";

  const row = {
    store_profile_id: authCtx.storeProfileId,
    transaction_id: stringValue(decoded?.transactionId) ?? transactionId,
    original_transaction_id: stringValue(decoded?.originalTransactionId),
    product_id: (stringValue(decoded?.productId) ?? clean(payload.productId)) || "unknown_product",
    user_id: clean(payload.userId) || null,
    bundle_id: bundleId,
    purchase_date: timestampFromMillis(decoded?.purchaseDate),
    expires_date: timestampFromMillis(decoded?.expiresDate),
    state,
    revenue_micros: priceMilliunits === null ? null : priceMilliunits * 1000,
    price_milliunits: priceMilliunits,
    currency: stringValue(decoded?.currency),
    is_trial: decoded?.offerType === 1,
    environment: normalizeEnvironment(decoded?.environment ?? payload.environment),
    raw_receipt: provider,
    verified_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("ios_iap_transactions")
    .upsert(row, { onConflict: "transaction_id" })
    .select("*")
    .single();
  if (error) throw error;

  return {
    app,
    credentialRef: credential.credentialRef,
    transaction: data,
  };
}

function edgeErrorPayload(error: unknown) {
  if (error instanceof Error) {
    return { error: error.message };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      error:
        stringValue(record.message) ??
        stringValue(record.error) ??
        "Unknown verify-ios error",
      code: stringValue(record.code),
      details: stringValue(record.details),
      hint: stringValue(record.hint),
    };
  }

  return {
    error: typeof error === "string" ? error : "Unknown verify-ios error",
  };
}

function httpStatusFromError(error: unknown): number {
  if (error && typeof error === "object" && "httpStatus" in error) {
    return Number((error as Record<string, unknown>).httpStatus) || 500;
  }
  return 500;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabase = createAdminClient();
    const authCtx = await authenticateStoreUser(request, supabase);
    const payload = (await request.json()) as VerifyIosRequest;
    const result = await verifyApple(supabase, authCtx, payload);

    return json({
      ok: true,
      platform: "ios",
      result,
    });
  } catch (error) {
    return json({ ok: false, ...edgeErrorPayload(error) }, httpStatusFromError(error));
  }
});
