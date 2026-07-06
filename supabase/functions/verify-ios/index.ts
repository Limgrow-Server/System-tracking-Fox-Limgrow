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
  environment?: string;
  userId?: string;
  credentialRef?: string;
  appInstanceId?: string;
  firebaseAppId?: string;
};

type StoreConfigContext = {
  issuerId: string | null;
  storeAccountName: string;
  storeProfileId: string;
};

type AppleIapCredential = {
  credentialRef: string;
  issuerId: string;
  keyId: string;
  privateKey: string;
};

type AppleEnvironment = "production" | "sandbox";

type AppleVerifyAttempt = {
  environment: AppleEnvironment;
  provider: Record<string, unknown>;
  response: Response;
};

async function resolveStoreConfigByBundle(
  supabase: SupabaseAdminClient,
  bundleId: string
): Promise<StoreConfigContext> {
  const { data: mapping, error: mappingError } = await supabase
    .from("ios_store_mappings")
    .select("id,store_profile_id,store_account_name,bundle_id,status")
    .eq("bundle_id", bundleId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (mappingError) throw mappingError;
  if (!mapping) {
    throw Object.assign(new Error("bundle_not_configured"), {
      httpStatus: 404,
    });
  }

  const storeProfileId = clean(mapping.store_profile_id);
  if (!storeProfileId) {
    throw Object.assign(new Error("store_profile_not_configured"), {
      httpStatus: 500,
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("ios_store_profiles")
    .select("id,store_account_name,status,issuer_id")
    .eq("id", storeProfileId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) {
    throw Object.assign(new Error("store_profile_not_found"), {
      httpStatus: 404,
    });
  }

  if (profile.status !== "active") {
    throw Object.assign(new Error("store_inactive"), { httpStatus: 403 });
  }

  return {
    issuerId: stringValue(profile.issuer_id),
    storeAccountName: clean(mapping.store_account_name),
    storeProfileId,
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

function finiteInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  return null;
}

function normalizeEnvironment(value: unknown) {
  return clean(value).toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function positiveIntEnv(name: string, fallback: number) {
  const parsed = Number(Deno.env.get(name));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function appleApiBaseUrl(environment: AppleEnvironment) {
  return environment === "sandbox"
    ? "https://api.storekit-sandbox.itunes.apple.com"
    : "https://api.storekit.itunes.apple.com";
}

function appleErrorCode(provider: Record<string, unknown>) {
  const code = provider.errorCode ?? provider.code;
  if (typeof code === "number" && Number.isFinite(code)) return String(code);
  return stringValue(code);
}

function appleErrorMessage(provider: Record<string, unknown>) {
  return stringValue(provider.errorMessage) ?? stringValue(provider.message);
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
  storeConfig: StoreConfigContext
): Promise<AppleIapCredential> {
  const select =
    "id,store_profile_id,credential_ref,secret_format,credential_purpose,vault_secret_id,vault_secret_name,vault_secret_version,store_account_name,key_id,issuer_id,status";

  const { data, error } = await supabase
    .from("ios_credentials")
    .select(select)
    .eq("store_profile_id", storeConfig.storeProfileId)
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
    storeConfig.issuerId ??
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

async function fetchAppleTransaction(
  token: string,
  transactionId: string,
  environment: AppleEnvironment
): Promise<AppleVerifyAttempt> {
  const response = await fetch(`${appleApiBaseUrl(environment)}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });

  let provider: Record<string, unknown> = {};
  try {
    const parsed = (await response.json()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      provider = parsed as Record<string, unknown>;
    }
  } catch {
    provider = {};
  }

  return { environment, provider, response };
}

async function fetchAppleTransactionWithFallback(
  token: string,
  transactionId: string,
  requestedEnvironment: string
) {
  const requested = requestedEnvironment.toLowerCase();
  const attempts: AppleVerifyAttempt[] = [];

  const firstEnvironment: AppleEnvironment = requested === "sandbox" ? "sandbox" : "production";
  let attempt = await fetchAppleTransaction(token, transactionId, firstEnvironment);
  attempts.push(attempt);

  const shouldTrySandbox =
    firstEnvironment === "production" &&
    requested !== "production" &&
    !attempt.response.ok &&
    (appleErrorCode(attempt.provider) === "4040010" || attempt.response.status === 401);

  if (shouldTrySandbox) {
    attempt = await fetchAppleTransaction(token, transactionId, "sandbox");
    attempts.push(attempt);
  }

  return { attempt, attempts };
}

async function persistIosTransaction(
  supabase: SupabaseAdminClient,
  row: Record<string, unknown> & { transaction_id: string }
) {
  const select =
    "id,state,transaction_id,original_transaction_id,product_id,user_id,bundle_id,purchase_date,environment,store_profile_id";

  const updateExisting = async (id: string) => {
    const { data, error } = await supabase
      .from("ios_iap_transactions")
      .update(row)
      .eq("id", id)
      .select(select)
      .single();

    if (error) throw error;
    return data;
  };

  const { data: existing, error: lookupError } = await supabase
    .from("ios_iap_transactions")
    .select("id")
    .eq("transaction_id", row.transaction_id)
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing?.id) {
    return updateExisting(existing.id);
  }

  const { data, error } = await supabase
    .from("ios_iap_transactions")
    .insert({ id: crypto.randomUUID(), ...row })
    .select(select)
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: conflicted, error: conflictLookupError } = await supabase
        .from("ios_iap_transactions")
        .select("id")
        .eq("transaction_id", row.transaction_id)
        .limit(1)
        .maybeSingle();

      if (conflictLookupError) throw conflictLookupError;
      if (conflicted?.id) return updateExisting(conflicted.id);
    }

    throw error;
  }

  return data;
}

async function scheduleIosIapTwoHourCheck(
  supabase: SupabaseAdminClient,
  transaction: Record<string, unknown>,
  payload: VerifyIosRequest
) {
  const appInstanceId = clean(payload.appInstanceId);
  const transactionId = clean(transaction.transaction_id);
  const bundleId = clean(transaction.bundle_id);
  const productId = clean(transaction.product_id) || clean(payload.productId) || "unknown_product";

  if (!appInstanceId) {
    return {
      reason: "app_instance_id_missing",
      scheduled: false,
    };
  }

  if (!transactionId || !bundleId) {
    return {
      reason: "transaction_context_missing",
      scheduled: false,
    };
  }

  const delayMs = positiveIntEnv("IOS_IAP_2HOUR_CHECK_DELAY_MS", 2 * 60 * 60 * 1000);
  const purchaseDateText = stringValue(transaction.purchase_date);
  const purchaseTime = purchaseDateText ? Date.parse(purchaseDateText) : Date.now();
  const checkAt = new Date((Number.isFinite(purchaseTime) ? purchaseTime : Date.now()) + delayMs);
  const firebaseAppId = clean(payload.firebaseAppId);
  const row = {
    app_instance_id: appInstanceId,
    bundle_id: bundleId,
    check_at: checkAt.toISOString(),
    environment: normalizeEnvironment(transaction.environment),
    firebase_app_id: firebaseAppId || null,
    ga4_event_name: "purchase_2hour",
    last_error: null,
    original_transaction_id: stringValue(transaction.original_transaction_id),
    product_id: productId,
    raw_context: {
      delayMs,
      firebaseAppIdProvided: Boolean(firebaseAppId),
      scheduledAt: new Date().toISOString(),
      source: "verify_ios_edge_function",
    },
    renewed: null,
    renewal_status: null,
    store_profile_id: stringValue(transaction.store_profile_id),
    transaction_id: transactionId,
    user_id: (stringValue(transaction.user_id) ?? clean(payload.userId)) || null,
  };

  const { data: existing, error: existingError } = await supabase
    .from("ios_iap_two_hour_checks")
    .select("id,status")
    .eq("transaction_id", transactionId)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    const nextStatus = clean(existing.status) === "sent" ? "sent" : "pending";
    const updateRow = nextStatus === "sent"
      ? {
          app_instance_id: row.app_instance_id,
          firebase_app_id: row.firebase_app_id,
          updated_at: new Date().toISOString(),
        }
      : {
          ...row,
          status: nextStatus,
          updated_at: new Date().toISOString(),
        };
    const { data, error } = await supabase
      .from("ios_iap_two_hour_checks")
      .update(updateRow)
      .eq("id", existing.id)
      .select("id,check_at,status")
      .single();

    if (error) throw error;

    return {
      checkAt: stringValue(data.check_at),
      id: stringValue(data.id),
      scheduled: true,
      status: stringValue(data.status),
    };
  }

  const { data, error } = await supabase
    .from("ios_iap_two_hour_checks")
    .insert({
      id: crypto.randomUUID(),
      ...row,
      status: "pending",
    })
    .select("id,check_at,status")
    .single();

  if (error) throw error;

  return {
    checkAt: stringValue(data.check_at),
    id: stringValue(data.id),
    scheduled: true,
    status: stringValue(data.status),
  };
}

async function verifyApple(
  supabase: SupabaseAdminClient,
  payload: VerifyIosRequest
) {
  const bundleId = clean(payload.bundleId);
  const transactionId = clean(payload.transactionId);

  if (!bundleId || !transactionId) throw new Error("bundleId and transactionId are required");

  const storeConfig = await resolveStoreConfigByBundle(supabase, bundleId);
  const credential = await resolveAppleIapCredential(supabase, storeConfig);
  const token = await appleServerToken(credential, bundleId);
  const { attempt, attempts } = await fetchAppleTransactionWithFallback(
    token,
    transactionId,
    clean(payload.environment)
  );
  const { environment: verifiedEnvironment, provider, response } = attempt;

  if (!response.ok) {
    console.error("Apple transaction verify failed", {
      bundleId,
      requestedEnvironment: clean(payload.environment) || null,
      attempts: attempts.map((item) => ({
        environment: item.environment,
        errorCode: appleErrorCode(item.provider),
        errorMessage: appleErrorMessage(item.provider),
        status: item.response.status,
      })),
    });
    throw Object.assign(new Error("purchase_verification_failed"), {
      httpStatus: response.status >= 400 && response.status < 500 ? 400 : 502,
    });
  }

  const signedTransactionInfo = stringValue(provider.signedTransactionInfo);
  const decoded = signedTransactionInfo ? decodeJwsPayload(signedTransactionInfo) : null;
  const decodedBundleId = stringValue(decoded?.bundleId);
  if (decodedBundleId && decodedBundleId !== bundleId) {
    throw new Error("Apple transaction bundleId does not match requested app config");
  }

  const priceMilliunits = applePriceMilliunits(decoded?.price);
  const expiresDate = timestampFromMillis(decoded?.expiresDate);
  const expiresAt = expiresDate ? new Date(expiresDate).getTime() : null;
  const state = decoded?.revocationDate
    ? "revoked"
    : expiresAt !== null && Number.isFinite(expiresAt) && expiresAt <= Date.now()
      ? "expired"
      : "purchased";
  const resolvedTransactionId = stringValue(decoded?.transactionId) ?? transactionId;

  const row = {
    store_profile_id: storeConfig.storeProfileId,
    transaction_id: resolvedTransactionId,
    original_transaction_id: stringValue(decoded?.originalTransactionId),
    product_id: (stringValue(decoded?.productId) ?? clean(payload.productId)) || "unknown_product",
    user_id: stringValue(decoded?.appAccountToken),
    bundle_id: bundleId,
    purchase_date: timestampFromMillis(decoded?.purchaseDate),
    expires_date: expiresDate,
    state,
    revenue_micros: priceMilliunits === null ? null : priceMilliunits * 1000,
    price_milliunits: priceMilliunits,
    currency: stringValue(decoded?.currency),
    is_trial: decoded?.offerType === 1 || stringValue(decoded?.offerDiscountType)?.toUpperCase() === "FREE_TRIAL",
    environment: normalizeEnvironment(decoded?.environment ?? verifiedEnvironment),
    raw_receipt: {
      ...provider,
      requestedEnvironment: clean(payload.environment) || null,
      source: "verify_ios_edge_function",
      verifiedEnvironment,
    },
    verified_at: new Date().toISOString(),
    offer_discount_type: stringValue(decoded?.offerDiscountType) || null,
    offer_type: finiteInt(decoded?.offerType),
    offer_period: stringValue(decoded?.offerPeriod) || null,
    transaction_reason: stringValue(decoded?.transactionReason) || null,
    storefront: stringValue(decoded?.storefront) || null,
    storefront_id: stringValue(decoded?.storefrontId) || null,
    subscription_group_id: stringValue(decoded?.subscriptionGroupIdentifier) || null,
    billing_plan_type: stringValue(decoded?.billingPlanType) || null,
    app_transaction_id: stringValue(decoded?.appTransactionId) || null,
    web_order_line_item_id: stringValue(decoded?.webOrderLineItemId) || null,
    revocation_date: timestampFromMillis(decoded?.revocationDate),
    revocation_reason: finiteInt(decoded?.revocationReason),
    revocation_percentage: finiteInt(decoded?.revocationPercentage),
    revocation_type: stringValue(decoded?.revocationType) || null,
  };

  const data = await persistIosTransaction(supabase, row);
  let twoHourGa4Check: Record<string, unknown> = {
    scheduled: false,
    reason: "not_requested",
  };

  try {
    twoHourGa4Check = await scheduleIosIapTwoHourCheck(supabase, data, payload);
  } catch (error) {
    twoHourGa4Check = {
      error: error instanceof Error ? error.message : "schedule_failed",
      scheduled: false,
    };
    console.error("Apple transaction 2-hour GA4 check schedule failed", {
      bundleId,
      error: twoHourGa4Check.error,
      transactionId: resolvedTransactionId,
    });
  }

  console.info("Apple transaction verify saved", {
    bundleId,
    environment: row.environment,
    source: "verify_ios_edge_function",
    state: data.state,
    transactionId: resolvedTransactionId,
    twoHourGa4Check,
  });

  return {
    tracked: true,
    state: data.state,
    twoHourGa4Check,
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
    const payload = (await request.json()) as VerifyIosRequest;
    const result = await verifyApple(supabase, payload);

    return json({
      ok: true,
      platform: "ios",
      result,
    });
  } catch (error) {
    return json({ ok: false, ...edgeErrorPayload(error) }, httpStatusFromError(error));
  }
});
