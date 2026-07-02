import "server-only";

import { MappingStatus, Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/server/cache-tags";
import { badRequest, conflict, notFound } from "@/lib/server/api/errors";
import {
  deleteAndroidStoreMapping,
  getAndroidStoreMappingId,
  getAndroidStoreMappings,
  getAndroidStoreMappingsPage,
  saveAndroidStoreMapping,
} from "@/lib/server/repositories/android/store-mapping.repository";
import { paginatedResult, type PaginationQuery } from "@/lib/server/api/pagination";
import { getAndroidStoreProfileById } from "@/lib/server/repositories/android/store-profile.repository";
import { runRepositoryTransaction } from "@/lib/server/repositories/common/transaction.repository";
import { ensureAndroidReviewTargetsForMapping } from "@/lib/server/repositories/reviews/review.repository";
import { androidStoreMappingToTracking } from "@/lib/tracking/mappers/android";
import { nullableAppId } from "@/lib/tracking/identity";
import type { StoreMappingPayload } from "@/lib/server/services/store-mappings/types";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

const mappingStatusMap: Record<string, MappingStatus> = {
  active: MappingStatus.ACTIVE,
  inactive: MappingStatus.INACTIVE,
  archived: MappingStatus.ARCHIVED,
};

function normalizeAndroidMappingPayload(payload: StoreMappingPayload) {
  return {
    appId: nullableAppId(payload.appId),
    appIconUrl: nullableText(payload.appIconUrl),
    appLink: nullableText(payload.appLink),
    appName: cleanText(payload.appName),
    packageName: nullableText(payload.packageName),
    status: mappingStatusMap[cleanText(payload.status).toLowerCase()] ?? MappingStatus.ACTIVE,
    storeAccountName: cleanText(payload.storeAccountName),
    storeProfileId: cleanText(payload.storeProfileId),
  };
}

function validateAndroidMapping(payload: ReturnType<typeof normalizeAndroidMappingPayload>) {
  if ((!payload.storeProfileId && !payload.storeAccountName) || !payload.appName) {
    throw badRequest("Store ref and app name are required.");
  }

  if (!payload.packageName) {
    throw badRequest("Android mapping requires package name.");
  }
}

function mapAndroidStoreMappingError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw conflict("An Android mapping with the same app name or package name already exists.");
  }

  throw error;
}

const getCachedAndroidStoreMappingDtos = unstable_cache(
  async (take: number) => {
    const mappings = await getAndroidStoreMappings({ take });
    return mappings.map(androidStoreMappingToTracking);
  },
  ["android-store-mapping-dtos"],
  {
    revalidate: 300,
    tags: [CACHE_TAGS.androidStoreMappings],
  },
);

export async function getAndroidStoreMappingDtos(options?: { take?: number }) {
  return getCachedAndroidStoreMappingDtos(options?.take ?? 200);
}

export async function getAndroidStoreMappingPageResult(options: PaginationQuery & {
  search?: string;
  storeProfileId?: string;
}) {
  const [mappings, total] = await getAndroidStoreMappingsPage({
    search: options.search,
    skip: options.skip,
    storeProfileId: options.storeProfileId,
    take: options.take,
  });

  return paginatedResult(mappings.map(androidStoreMappingToTracking), total, options);
}

export async function getAndroidStoreMappingsResult() {
  return { mappings: await getAndroidStoreMappingDtos({ take: 300 }) };
}

export async function androidStoreMappingExists(id: string) {
  return Boolean(await getAndroidStoreMappingId(id));
}

export async function saveAndroidStoreMappingDto(input: {
  appIconUrl: string | null;
  appLink: string | null;
  appId: string | null;
  appName: string;
  id?: string;
  packageName: string;
  status: MappingStatus;
  storeAccountName: string;
  storeProfileId?: string | null;
}) {
  let storeAccountName = input.storeAccountName;

  if (input.storeProfileId) {
    const profile = await getAndroidStoreProfileById(input.storeProfileId);
    if (!profile) {
      throw notFound("Android store profile was not found.");
    }

    storeAccountName = profile.storeAccountName;
  }

  const mapping = await runRepositoryTransaction(async (tx) => {
    const savedMapping = await saveAndroidStoreMapping(tx, {
      ...input,
      storeAccountName,
    });
    await ensureAndroidReviewTargetsForMapping(savedMapping.id, tx);
    return savedMapping;
  });
  return androidStoreMappingToTracking(mapping);
}

export function deleteAndroidStoreMappingById(id: string) {
  return deleteAndroidStoreMapping(id);
}

export async function createAndroidStoreMapping(payload: StoreMappingPayload) {
  if (payload.platform && payload.platform !== "android") {
    throw badRequest("Android route only accepts Android mappings.");
  }

  const row = normalizeAndroidMappingPayload(payload);
  validateAndroidMapping(row);

  try {
    const mapping = await saveAndroidStoreMappingDto({
      appIconUrl: row.appIconUrl,
      appLink: row.appLink,
      appId: row.appId,
      appName: row.appName,
      packageName: row.packageName!,
      status: row.status,
      storeAccountName: row.storeAccountName,
      storeProfileId: row.storeProfileId,
    });

    return { mapping, message: `Android app mapping for ${row.appName} has been saved.` };
  } catch (error) {
    mapAndroidStoreMappingError(error);
  }
}

export async function updateAndroidStoreMapping(payload: StoreMappingPayload) {
  const id = cleanText(payload.id);

  if (!id) {
    throw badRequest("Mapping id is required.");
  }

  if (!(await androidStoreMappingExists(id))) {
    throw notFound("Android mapping was not found.");
  }

  const row = normalizeAndroidMappingPayload(payload);
  validateAndroidMapping(row);

  try {
    const mapping = await saveAndroidStoreMappingDto({
      appIconUrl: row.appIconUrl,
      appLink: row.appLink,
      appId: row.appId,
      appName: row.appName,
      id,
      packageName: row.packageName!,
      status: row.status,
      storeAccountName: row.storeAccountName,
      storeProfileId: row.storeProfileId,
    });

    return { mapping, message: `Android app mapping for ${row.appName} has been updated.` };
  } catch (error) {
    mapAndroidStoreMappingError(error);
  }
}

export async function deleteAndroidStoreMappingConfig(payload: StoreMappingPayload) {
  const id = cleanText(payload.id);

  if (!id) {
    throw badRequest("Mapping id is required.");
  }

  if (!(await androidStoreMappingExists(id))) {
    throw notFound("Android mapping was not found.");
  }

  await deleteAndroidStoreMappingById(id);

  return { deleted: id, message: "Android app mapping deleted." };
}
