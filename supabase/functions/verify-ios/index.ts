import {
  clean,
  corsHeaders,
  createAdminClient,
  getAppleIapConfig,
  jsonResponse as json,
  stringValue,
  type AppleIapRuntimeConfig,
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

async function appleServerToken(config: AppleIapRuntimeConfig) {
  const now = Math.floor(Date.now() / 1000);
  return signAppleJwt(
    { alg: "ES256", kid: config.appleIap.keyId, typ: "JWT" },
    {
      iss: config.appleIap.issuerId,
      iat: now,
      exp: now + 900,
      aud: "appstoreconnect-v1",
      bid: config.appleIap.bundleId,
    },
    config.appleIap.privateKey
  );
}

async function verifyApple(supabase: SupabaseAdminClient, payload: VerifyIosRequest) {
  const config = await getAppleIapConfig(supabase, {
    appName: payload.productAppId,
    bundleId: payload.bundleId,
    credentialRef: payload.credentialRef,
    productAppId: payload.productAppId,
  });
  const bundleId = config.appleIap.bundleId;
  const transactionId = clean(payload.transactionId);

  if (!bundleId || !transactionId) throw new Error("bundleId and transactionId are required");

  const token = await appleServerToken(config);
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
    app: config.app,
    credentialRef: config.appleIap.credential.credentialRef,
    transaction: data,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const payload = (await request.json()) as VerifyIosRequest;
    const supabase = createAdminClient();
    const result = await verifyApple(supabase, payload);

    return json({
      ok: true,
      platform: "ios",
      result,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown verify-ios error",
      },
      500
    );
  }
});
