import "server-only";

import { requireAdminSession } from "@/lib/server/api/auth";
import { badRequest } from "@/lib/server/api/errors";
import { paginatedJson, paginationFromSearchParams } from "@/lib/server/api/pagination";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  deleteAndroidCredentialConfig,
  getAndroidCredentialConfigsPage,
  getAndroidCredentialSecret,
  saveAndroidCredentialConfig,
  updateAndroidCredentialConfig,
} from "@/lib/server/services/credentials/android-credential.service";
import {
  deleteIosCredentialConfig,
  getIosCredentialConfigsPage,
  getIosCredentialSecret,
  saveIosCredentialConfig,
  updateIosCredentialConfig,
} from "@/lib/server/services/credentials/ios-credential.service";
import {
  cleanText,
  parseCredentialPayload,
} from "@/lib/server/services/credentials/credential.shared";
import type {
  CredentialPayload,
  CredentialPlatform,
} from "@/lib/server/services/credentials/credential.types";

function platformFromSearch(value: string): CredentialPlatform | null {
  return value === "android" || value === "ios" ? value : null;
}

function searchText(value: string | null) {
  return value?.trim() || undefined;
}

function platformFromCredentialPayload(payload: CredentialPayload): CredentialPlatform {
  if (payload.platform === "android" || payload.storePlatform === "google_play") return "android";
  if (payload.platform === "ios" || payload.storePlatform === "apple_app_store") return "ios";

  const secretType = cleanText(payload.secretType);
  if (secretType === "apple_asc_p8" || secretType === "apple_iap_p8") return "ios";

  throw badRequest("Credential platform is required.");
}

export async function handleAdminCredentialsGet(request: Request) {
  try {
    await requireAdminSession();

    const url = new URL(request.url);
    const platform = platformFromSearch(cleanText(url.searchParams.get("platform")));

    if (url.searchParams.get("reveal") === "secret") {
      if (!platform) {
        throw badRequest("Credential platform is required to reveal a secret.");
      }

      const input = {
        id: cleanText(url.searchParams.get("id")),
        credentialRef: cleanText(url.searchParams.get("credentialRef")),
      };

      return okJson(platform === "android" ? await getAndroidCredentialSecret(input) : await getIosCredentialSecret(input));
    }

    if (!platform) {
      throw badRequest("Credential platform is required.");
    }

    const pagination = paginationFromSearchParams(url.searchParams);
    const query = {
      ...pagination,
      search: searchText(url.searchParams.get("search")),
    };

    return paginatedJson(
      platform === "android"
        ? await getAndroidCredentialConfigsPage(query)
        : await getIosCredentialConfigsPage(query)
    );
  } catch (error) {
    return errorJson(error, "Credential operation failed.");
  }
}

export async function handleAdminCredentialsPost(request: Request) {
  try {
    const admin = await requireAdminSession();
    const payload = await parseCredentialPayload(request);
    return okJson(
      platformFromCredentialPayload(payload) === "android"
        ? await saveAndroidCredentialConfig(payload, admin.email)
        : await saveIosCredentialConfig(payload, admin.email)
    );
  } catch (error) {
    return errorJson(error, "Credential operation failed.");
  }
}

export async function handleAdminCredentialsPatch(request: Request) {
  try {
    const admin = await requireAdminSession();
    const payload = await parseCredentialPayload(request);
    return okJson(
      platformFromCredentialPayload(payload) === "android"
        ? await updateAndroidCredentialConfig(payload, admin.email)
        : await updateIosCredentialConfig(payload, admin.email)
    );
  } catch (error) {
    return errorJson(error, "Credential operation failed.");
  }
}

export async function handleAdminCredentialsDelete(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseCredentialPayload(request);
    return okJson(
      platformFromCredentialPayload(payload) === "android"
        ? await deleteAndroidCredentialConfig(payload)
        : await deleteIosCredentialConfig(payload)
    );
  } catch (error) {
    return errorJson(error, "Credential operation failed.");
  }
}
