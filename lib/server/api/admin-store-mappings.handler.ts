import "server-only";

import { requireAdminSession } from "@/lib/server/api/auth";
import { badRequest } from "@/lib/server/api/errors";
import { paginatedJson, paginationFromSearchParams } from "@/lib/server/api/pagination";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  createAndroidStoreMapping,
  deleteAndroidStoreMappingConfig,
  getAndroidStoreMappingPageResult,
  updateAndroidStoreMapping,
} from "@/lib/server/services/store-mappings/android-store-mapping.service";
import {
  createIosStoreMapping,
  deleteIosStoreMappingConfig,
  getIosStoreMappingPageResult,
  updateIosStoreMapping,
} from "@/lib/server/services/store-mappings/ios-store-mapping.service";
import type { StoreMappingPayload } from "@/lib/server/services/store-mappings/types";

function platformFromPayload(payload: StoreMappingPayload) {
  if (payload.platform === "android") return "android";
  if (payload.platform === "ios") return "ios";
  throw badRequest("Mapping platform is required.");
}

function clean(value: string | null) {
  return value?.trim() ?? "";
}

function platformFromSearch(value: string) {
  if (value === "android" || value === "ios") return value;
  throw badRequest("Mapping platform is required.");
}

export async function handleAdminStoreMappingsGet(request: Request) {
  try {
    await requireAdminSession();

    const url = new URL(request.url);
    const platform = platformFromSearch(clean(url.searchParams.get("platform")));
    const pagination = paginationFromSearchParams(url.searchParams);
    const query = {
      ...pagination,
      search: clean(url.searchParams.get("search")) || undefined,
      storeProfileId: clean(url.searchParams.get("storeProfileId")) || undefined,
    };

    return paginatedJson(
      platform === "android"
        ? await getAndroidStoreMappingPageResult(query)
        : await getIosStoreMappingPageResult(query)
    );
  } catch (error) {
    return errorJson(error, "List app mappings failed.");
  }
}

export async function handleAdminStoreMappingsPost(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<StoreMappingPayload>(request);
    return okJson(
      platformFromPayload(payload) === "android"
        ? await createAndroidStoreMapping(payload)
        : await createIosStoreMapping(payload)
    );
  } catch (error) {
    return errorJson(error, "Create app mapping failed.");
  }
}

export async function handleAdminStoreMappingsPatch(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<StoreMappingPayload>(request);
    return okJson(
      platformFromPayload(payload) === "android"
        ? await updateAndroidStoreMapping(payload)
        : await updateIosStoreMapping(payload)
    );
  } catch (error) {
    return errorJson(error, "Update app mapping failed.");
  }
}

export async function handleAdminStoreMappingsDelete(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<StoreMappingPayload>(request);
    return okJson(
      platformFromPayload(payload) === "android"
        ? await deleteAndroidStoreMappingConfig(payload)
        : await deleteIosStoreMappingConfig(payload)
    );
  } catch (error) {
    return errorJson(error, "Delete app mapping failed.");
  }
}
