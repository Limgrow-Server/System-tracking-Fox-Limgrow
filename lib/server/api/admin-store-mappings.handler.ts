import "server-only";

import { CACHE_TAGS, revalidateCacheTags } from "@/lib/server/cache-tags";
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

function knownTotalFromSearch(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function handleAdminStoreMappingsGet(request: Request) {
  try {
    await requireAdminSession();

    const url = new URL(request.url);
    const platform = platformFromSearch(clean(url.searchParams.get("platform")));
    const pagination = paginationFromSearchParams(url.searchParams);
    const query = {
      ...pagination,
      knownTotal: knownTotalFromSearch(clean(url.searchParams.get("knownTotal"))),
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
    const platform = platformFromPayload(payload);
    const result = platform === "android"
      ? await createAndroidStoreMapping(payload)
      : await createIosStoreMapping(payload);
    revalidateCacheTags([
      platform === "android"
        ? CACHE_TAGS.androidStoreMappings
        : CACHE_TAGS.iosStoreMappings,
    ]);
    return okJson(result);
  } catch (error) {
    return errorJson(error, "Create app mapping failed.");
  }
}

export async function handleAdminStoreMappingsPatch(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<StoreMappingPayload>(request);
    const platform = platformFromPayload(payload);
    const result = platform === "android"
      ? await updateAndroidStoreMapping(payload)
      : await updateIosStoreMapping(payload);
    revalidateCacheTags([
      platform === "android"
        ? CACHE_TAGS.androidStoreMappings
        : CACHE_TAGS.iosStoreMappings,
    ]);
    return okJson(result);
  } catch (error) {
    return errorJson(error, "Update app mapping failed.");
  }
}

export async function handleAdminStoreMappingsDelete(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<StoreMappingPayload>(request);
    const platform = platformFromPayload(payload);
    const result = platform === "android"
      ? await deleteAndroidStoreMappingConfig(payload)
      : await deleteIosStoreMappingConfig(payload);
    revalidateCacheTags([
      platform === "android"
        ? CACHE_TAGS.androidStoreMappings
        : CACHE_TAGS.iosStoreMappings,
    ]);
    return okJson(result);
  } catch (error) {
    return errorJson(error, "Delete app mapping failed.");
  }
}
