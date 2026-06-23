import {
  clean,
  corsHeaders,
  createAdminClient,
  jsonResponse as json,
  stringValue,
  type SupabaseAdminClient,
} from "../_shared/edge-config.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VerifyAndroidRequest = {
  packageName?: string;
  productId?: string;
  purchaseToken?: string;
  purchaseKind?: "product" | "subscription";
};

type StoreAuthContext = {
  userId: string;
  storeProfileId: string;
  storeAccountName: string;
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

async function authenticateStoreUser(
  request: Request,
  supabase: SupabaseAdminClient,
): Promise<StoreAuthContext> {
  // 1. Extract token
  const token = extractBearerToken(request);
  if (!token) {
    throw Object.assign(new Error("missing_auth_token"), { httpStatus: 401 });
  }

  // 2. Verify JWT via Supabase Auth (getUser validates the token server-side)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    throw Object.assign(new Error(authError?.message ?? "invalid_auth_token"), {
      httpStatus: 401,
    });
  }

  // 3. Lookup store profile by supabase_user_id
  const { data: profile, error: profileError } = await supabase
    .from("android_store_profiles")
    .select("id,store_account_name,status")
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
    userId: user.id,
    storeProfileId: profile.id,
    storeAccountName: profile.store_account_name,
  };
}

// ---------------------------------------------------------------------------
// Google Play helpers (unchanged from original)
// ---------------------------------------------------------------------------

function base64Url(input: string | ArrayBuffer) {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function signGoogleJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKeyPem: string,
) {
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(signature)}`;
}

function timestampFromMillis(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? new Date(numberValue).toISOString()
    : null;
}

function moneyToMicros(price: unknown) {
  if (!price || typeof price !== "object") return null;
  const record = price as Record<string, unknown>;
  const units = Number(record.units ?? 0);
  const nanos = Number(record.nanos ?? 0);
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return null;
  return Math.round(units * 1_000_000 + nanos / 1_000);
}

function resolveSubscriptionState(raw: string | null): string {
  const map: Record<string, string> = {
    SUBSCRIPTION_STATE_ACTIVE: "active",
    SUBSCRIPTION_STATE_EXPIRED: "expired",
    SUBSCRIPTION_STATE_PENDING: "pending",
    SUBSCRIPTION_STATE_PAUSED: "paused",
    SUBSCRIPTION_STATE_CANCELED: "canceled",
    SUBSCRIPTION_STATE_IN_GRACE_PERIOD: "grace_period",
    SUBSCRIPTION_STATE_ON_HOLD: "on_hold",
    SUBSCRIPTION_STATE_REVOKED: "revoked",
  };
  return map[raw ?? ""] ?? "unknown";
}

function resolveProductState(purchaseState: number): string {
  if (purchaseState === 0) return "purchased";
  if (purchaseState === 1) return "canceled";
  if (purchaseState === 2) return "pending";
  return "unknown";
}

async function googleAccessToken(payload: Record<string, unknown>) {
  const clientEmail = stringValue(payload.client_email);
  const privateKey = stringValue(payload.private_key);
  const tokenUri =
    stringValue(payload.token_uri) ?? "https://oauth2.googleapis.com/token";

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Google service account credential must include client_email and private_key",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await signGoogleJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: tokenUri,
      exp: now + 3600,
      iat: now,
    },
    privateKey,
  );

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Google OAuth failed: ${JSON.stringify(body)}`);
  }

  const accessToken = stringValue(body.access_token);
  if (!accessToken)
    throw new Error("Google OAuth response did not include access_token");
  return accessToken;
}

// ---------------------------------------------------------------------------
// Core verify logic (auth-aware)
// ---------------------------------------------------------------------------

async function resolveCredential(
  supabase: SupabaseAdminClient,
  storeProfileId: string,
) {
  const select =
    "id,store_profile_id,credential_ref,vault_secret_id,vault_secret_name,vault_secret_version,store_account_name,private_key_id,client_email,project_id,status";

  const { data, error } = await supabase
    .from("android_credentials")
    .select(select)
    .eq("store_profile_id", storeProfileId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("credential_not_found");

  // Read Vault secret
  const vaultSecretId = stringValue(data.vault_secret_id);
  if (!vaultSecretId)
    throw new Error("Credential does not have a Vault secret");

  const { data: secretData, error: secretError } = await supabase.rpc(
    "system_tracking_get_vault_secret",
    { secret_id: vaultSecretId },
  );
  if (secretError) throw secretError;

  const secretText =
    typeof secretData === "string"
      ? secretData
      : secretData && typeof secretData === "object"
        ? stringValue(
            (secretData as Record<string, unknown>)
              .system_tracking_get_vault_secret,
          )
        : null;
  if (!secretText)
    throw new Error("Vault secret was not found or could not be decrypted");

  // Update last_used_at
  await supabase
    .from("android_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  const serviceAccount = JSON.parse(secretText) as Record<string, unknown>;

  return { credential: data, serviceAccount };
}

async function verifyPackageAuthorization(
  supabase: SupabaseAdminClient,
  storeProfileId: string,
  packageName: string,
) {
  const { data, error } = await supabase
    .from("android_store_mappings")
    .select("id")
    .eq("store_profile_id", storeProfileId)
    .eq("package_name", packageName)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("package_not_authorized"), {
      httpStatus: 403,
    });
  }
}

async function verifyGoogle(
  supabase: SupabaseAdminClient,
  authCtx: StoreAuthContext,
  payload: VerifyAndroidRequest,
) {
  const packageName = clean(payload.packageName);
  const productId = clean(payload.productId);
  const purchaseToken = clean(payload.purchaseToken);
  const isSubscription = payload.purchaseKind === "subscription";

  if (!packageName || !purchaseToken)
    throw new Error("packageName and purchaseToken are required");
  if (!isSubscription && !productId)
    throw new Error("productId is required for product purchases");

  // Security: verify packageName belongs to the authenticated store
  await verifyPackageAuthorization(
    supabase,
    authCtx.storeProfileId,
    packageName,
  );

  // Resolve credential from the authenticated store profile
  const { serviceAccount } = await resolveCredential(
    supabase,
    authCtx.storeProfileId,
  );

  const accessToken = await googleAccessToken(serviceAccount);
  const endpoint = isSubscription
    ? `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`
    : `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

  const response = await fetch(endpoint, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  const provider = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Google Play verify failed: ${JSON.stringify(provider)}`);
  }

  const lineItems = Array.isArray(provider.lineItems)
    ? (provider.lineItems as Record<string, unknown>[])
    : [];
  const firstLine = lineItems[0] ?? {};
  const autoRenewingPlan = firstLine.autoRenewingPlan as
    | Record<string, unknown>
    | undefined;
  const recurringPrice = autoRenewingPlan?.recurringPrice;
  const resolvedProductId = isSubscription
    ? (stringValue(firstLine.productId) ?? productId) || "unknown_product"
    : productId || stringValue(provider.productId) || "unknown_product";

  const offerDetails = firstLine.offerDetails as
    | Record<string, unknown>
    | undefined;

  const state = isSubscription
    ? resolveSubscriptionState(stringValue(provider.subscriptionState))
    : resolveProductState(Number(provider.purchaseState));

  const acknowledged = isSubscription
    ? stringValue(provider.acknowledgementState) ===
      "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
    : Number(provider.acknowledgementState) === 1;

  const row = {
    store_profile_id: authCtx.storeProfileId,
    package_name: packageName,
    product_id: resolvedProductId,
    purchase_kind: isSubscription ? "subscription" : "product",
    purchase_token: purchaseToken,
    order_id:
      stringValue(provider.latestOrderId) ?? stringValue(provider.orderId),
    linked_purchase_token: stringValue(provider.linkedPurchaseToken),
    state,
    acknowledged,
    consumed: isSubscription ? null : Number(provider.consumptionState) === 1,
    auto_renewing: isSubscription
      ? Boolean(autoRenewingPlan?.autoRenewEnabled)
      : null,
    purchase_date:
      timestampFromMillis(provider.purchaseTimeMillis) ??
      stringValue(provider.startTime),
    expires_date: stringValue(firstLine.expiryTime),
    revenue_micros: moneyToMicros(recurringPrice),
    currency:
      recurringPrice && typeof recurringPrice === "object"
        ? stringValue((recurringPrice as Record<string, unknown>).currencyCode)
        : null,
    region_code: stringValue(provider.regionCode),
    base_plan_id: isSubscription ? stringValue(offerDetails?.basePlanId) : null,
    offer_id: isSubscription ? stringValue(offerDetails?.offerId) : null,
    is_test_purchase: provider.testPurchase != null,
    raw_receipt: provider,
    verified_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("iap_android")
    .upsert(row, { onConflict: "package_name,purchase_token" })
    .select(
      "id,state,product_id,purchase_kind,acknowledged,expires_date,auto_renewing,is_test_purchase",
    )
    .single();

  if (error) throw error;

  return {
    state: data.state,
    productId: data.product_id,
    purchaseKind: data.purchase_kind,
    acknowledged: data.acknowledged,
    expiresDate: data.expires_date,
    autoRenewing: data.auto_renewing,
    isTestPurchase: data.is_test_purchase,
  };
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

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
        "Unknown verify-android error",
      code: stringValue(record.code),
      details: stringValue(record.details),
      hint: stringValue(record.hint),
    };
  }

  return {
    error: typeof error === "string" ? error : "Unknown verify-android error",
  };
}

function httpStatusFromError(error: unknown): number {
  if (error && typeof error === "object" && "httpStatus" in error) {
    return Number((error as Record<string, unknown>).httpStatus) || 500;
  }
  return 500;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabase = createAdminClient();

    // Step 1: Authenticate — JWT → user → store profile
    const authCtx = await authenticateStoreUser(request, supabase);

    // Step 2: Parse body
    const payload = (await request.json()) as VerifyAndroidRequest;

    // Step 3: Verify purchase with Google Play
    const result = await verifyGoogle(supabase, authCtx, payload);

    return json({
      ok: true,
      platform: "android",
      result,
    });
  } catch (error) {
    const status = httpStatusFromError(error);
    return json(
      {
        ok: false,
        ...edgeErrorPayload(error),
      },
      status,
    );
  }
});
