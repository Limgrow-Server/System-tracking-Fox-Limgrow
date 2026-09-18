import "server-only";

import { requireAdminSession } from "@/lib/server/api/auth";
import { badRequest } from "@/lib/server/api/errors";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  getCredentialSecretUnlockStatus,
  sendCredentialSecretOtp,
  verifyCredentialSecretOtp,
} from "@/lib/server/services/credentials/credential-secret-otp.service";

type CredentialSecretOtpPayload = {
  action?: unknown;
  code?: unknown;
};

async function parseOtpPayload(request: Request) {
  return (await request.json().catch(() => ({}))) as CredentialSecretOtpPayload;
}

export async function handleAdminCredentialSecretOtpGet() {
  try {
    const admin = await requireAdminSession();
    return okJson(await getCredentialSecretUnlockStatus(admin));
  } catch (error) {
    return errorJson(error, "Credential OTP operation failed.");
  }
}

export async function handleAdminCredentialSecretOtpPost(request: Request) {
  try {
    const admin = await requireAdminSession();
    const payload = await parseOtpPayload(request);

    if (payload.action === "send") {
      return okJson(await sendCredentialSecretOtp(admin));
    }

    if (payload.action === "verify") {
      return okJson(
        await verifyCredentialSecretOtp({
          code: payload.code,
          session: admin,
        }),
      );
    }

    throw badRequest("Invalid credential OTP action.");
  } catch (error) {
    return errorJson(error, "Credential OTP operation failed.");
  }
}
