import "server-only";

import { requireAdminSession } from "@/lib/server/api/auth";
import { badRequest } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  createAndroidStoreMapping,
  deleteAndroidStoreMappingConfig,
  getAndroidStoreMappingsResult,
  updateAndroidStoreMapping,
} from "@/lib/server/services/store-mappings/android-store-mapping.service";
import {
  createIosStoreMapping,
  deleteIosStoreMappingConfig,
  getIosStoreMappingsResult,
  updateIosStoreMapping,
} from "@/lib/server/services/store-mappings/ios-store-mapping.service";
import type { StoreMappingPayload } from "@/lib/server/services/store-mappings/types";
import { sortMappings } from "@/lib/tracking/mappers/shared";

function platformFromPayload(payload: StoreMappingPayload) {
  if (payload.platform === "android") return "android";
  if (payload.platform === "ios") return "ios";
  throw badRequest("Mapping platform is required.");
}

export async function handleAdminStoreMappingsGet() {
  try {
    await requireAdminSession();

    const [android, ios] = await Promise.all([
      getAndroidStoreMappingsResult(),
      getIosStoreMappingsResult(),
    ]);

    return okJson({ mappings: sortMappings([...android.mappings, ...ios.mappings]) });
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
