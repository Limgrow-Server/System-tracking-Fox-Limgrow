import {
  clean,
  corsHeaders,
  createAdminClient,
  jsonResponse as json,
  stringValue,
  type SupabaseAdminClient,
} from "../_shared/edge-config.ts";
import { googleServiceAccountAccessToken } from "../_shared/google-auth.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VerifyAndroidRequest = {
  packageName?: string;
  productId?: string;
  purchaseToken?: string;
  purchaseKind?: "product" | "subscription";
};

type StoreConfigContext = {
  storeProfileId: string;
  storeAccountName: string;
};

// ---------------------------------------------------------------------------
// Public app config resolver
// ---------------------------------------------------------------------------

async function resolveStoreConfigByPackage(
  supabase: SupabaseAdminClient,
  packageName: string,
): Promise<StoreConfigContext> {
  const { data: mapping, error: mappingError } = await supabase
    .from("android_store_mappings")
    .select("id,store_profile_id,store_account_name,package_name,status")
    .eq("package_name", packageName)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (mappingError) throw mappingError;
  if (!mapping) {
    throw Object.assign(new Error("package_not_configured"), {
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
    .from("android_store_profiles")
    .select("id,status")
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
    storeProfileId,
    storeAccountName: clean(mapping.store_account_name),
  };
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

// ---------------------------------------------------------------------------
// Core verify logic
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

async function verifyGoogle(
  supabase: SupabaseAdminClient,
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

  const appConfig = await resolveStoreConfigByPackage(supabase, packageName);

  const { serviceAccount } = await resolveCredential(
    supabase,
    appConfig.storeProfileId,
  );

  const accessToken = await googleServiceAccountAccessToken(serviceAccount);
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
    console.error("Google Play verify failed", {
      status: response.status,
      provider,
    });
    throw Object.assign(new Error("purchase_verification_failed"), {
      httpStatus: response.status >= 400 && response.status < 500 ? 400 : 502,
    });
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

  const now = new Date().toISOString();
  const row = {
    store_profile_id: appConfig.storeProfileId,
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
    verified_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("iap_android")
    .upsert(row, { onConflict: "package_name,purchase_token" })
    .select("state")
    .single();

  if (error) throw error;

  return {
    tracked: true,
    state: data.state,
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

    const payload = (await request.json()) as VerifyAndroidRequest;

    const result = await verifyGoogle(supabase, payload);

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
