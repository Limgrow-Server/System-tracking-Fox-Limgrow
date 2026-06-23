import "server-only";

import { createSign } from "crypto";

export const GOOGLE_ANDROID_PUBLISHER_SCOPE =
  "https://www.googleapis.com/auth/androidpublisher";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function base64UrlJson(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signGoogleJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKeyPem: string,
) {
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKeyPem)
    .toString("base64url");

  return `${signingInput}.${signature}`;
}

export async function googleServiceAccountAccessToken(
  serviceAccount: Record<string, unknown>,
  scope = GOOGLE_ANDROID_PUBLISHER_SCOPE,
) {
  const clientEmail = stringValue(serviceAccount.client_email);
  const privateKey = stringValue(serviceAccount.private_key);
  const tokenUri =
    stringValue(serviceAccount.token_uri) ?? "https://oauth2.googleapis.com/token";

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Google service account credential must include client_email and private_key.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = signGoogleJwt(
    { alg: "RS256", typ: "JWT" },
    {
      aud: tokenUri,
      exp: now + 3600,
      iat: now,
      iss: clientEmail,
      scope,
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
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new Error(`Google OAuth failed: ${JSON.stringify(body)}`);
  }

  const accessToken = stringValue(body.access_token);
  if (!accessToken) {
    throw new Error("Google OAuth response did not include access_token.");
  }

  return accessToken;
}
