import "server-only";

import { MappingStatus, Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/server/cache-tags";
import { badRequest, conflict, notFound } from "@/lib/server/api/errors";
import {
  deleteIosStoreMapping,
  getIosStoreMappingFirebaseAnalyticsSecret,
  getIosStoreMappingId,
  getIosStoreMappings,
  getIosStoreMappingsPage,
  saveIosStoreMapping,
} from "@/lib/server/repositories/ios/store-mapping.repository";
import { paginatedResult, type PaginationQuery } from "@/lib/server/api/pagination";
import { getIosStoreProfileById } from "@/lib/server/repositories/ios/store-profile.repository";
import { runRepositoryTransaction } from "@/lib/server/repositories/common/transaction.repository";
import { ensureIosReviewTargetsForMapping } from "@/lib/server/repositories/reviews/review.repository";
import type { StoreMappingPayload } from "@/lib/server/services/store-mappings/types";
import { nullableAppId } from "@/lib/tracking/identity";
import { iosStoreMappingToTracking } from "@/lib/tracking/mappers/ios";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function optionalSecretText(value: unknown) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

const mappingStatusMap: Record<string, MappingStatus> = {
  active: MappingStatus.ACTIVE,
  inactive: MappingStatus.INACTIVE,
  archived: MappingStatus.ARCHIVED,
};

function normalizeIosMappingPayload(payload: StoreMappingPayload) {
  return {
    appId: nullableAppId(payload.appId),
    appIconUrl: nullableText(payload.appIconUrl),
    appLink: nullableText(payload.appLink),
    appName: cleanText(payload.appName),
    bundleId: nullableText(payload.bundleId),
    firebaseAnalyticsApiSecret: optionalSecretText(
      payload.firebaseAnalyticsApiSecret,
    ),
    firebaseAppId: nullableText(payload.firebaseAppId),
    status: mappingStatusMap[cleanText(payload.status).toLowerCase()] ?? MappingStatus.ACTIVE,
    storeAccountName: cleanText(payload.storeAccountName),
    storeProfileId: cleanText(payload.storeProfileId),
  };
}

function validateIosMapping(payload: ReturnType<typeof normalizeIosMappingPayload>) {
  if ((!payload.storeProfileId && !payload.storeAccountName) || !payload.appName) {
    throw badRequest("Store ref and app name are required.");
  }

  if (!payload.bundleId) {
    throw badRequest("iOS mapping requires BundleId.");
  }
}

function mapIosStoreMappingError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw conflict("An iOS mapping with the same app name or BundleId already exists.");
  }

  throw error;
}

const getCachedIosStoreMappingDtos = unstable_cache(
  async (take: number) => {
    const mappings = await getIosStoreMappings({ take });
    return mappings.map(iosStoreMappingToTracking);
  },
  ["ios-store-mapping-dtos"],
  {
    revalidate: 300,
    tags: [CACHE_TAGS.iosStoreMappings],
  },
);

const MAX_CACHED_STORE_MAPPING_TAKE = 500;

export async function getIosStoreMappingDtos(options?: { take?: number }) {
  const take = options?.take ?? 200;

  if (take > MAX_CACHED_STORE_MAPPING_TAKE) {
    const mappings = await getIosStoreMappings({ take });
    return mappings.map(iosStoreMappingToTracking);
  }

  return getCachedIosStoreMappingDtos(take);
}

export async function getIosStoreMappingPageResult(options: PaginationQuery & {
  knownTotal?: number;
  search?: string;
  storeProfileId?: string;
}) {
  const [mappings, total] = await getIosStoreMappingsPage({
    includeTotal: options.knownTotal === undefined,
    search: options.search,
    skip: options.skip,
    storeProfileId: options.storeProfileId,
    take: options.take,
  });

  return paginatedResult(
    mappings.map(iosStoreMappingToTracking),
    total ?? options.knownTotal ?? mappings.length,
    options,
  );
}

export async function getIosStoreMappingsResult() {
  return { mappings: await getIosStoreMappingDtos({ take: 300 }) };
}

export async function iosStoreMappingExists(id: string) {
  return Boolean(await getIosStoreMappingId(id));
}

export async function revealIosStoreMappingFirebaseAnalyticsSecret(id: string) {
  const cleanedId = cleanText(id);
  if (!cleanedId) {
    throw badRequest("Mapping id is required.");
  }

  const mapping = await getIosStoreMappingFirebaseAnalyticsSecret(cleanedId);
  if (!mapping) {
    throw notFound("iOS mapping was not found.");
  }

  return {
    firebaseAnalyticsApiSecret:
      mapping.firebaseAnalyticsApiSecret ?? "",
    id: mapping.id,
  };
}

export async function saveIosStoreMappingDto(input: {
  appIconUrl: string | null;
  appLink: string | null;
  appId: string | null;
  appName: string;
  bundleId: string;
  firebaseAnalyticsApiSecret?: string | null;
  firebaseAppId: string | null;
  id?: string;
  status: MappingStatus;
  storeAccountName: string;
  storeProfileId?: string | null;
}) {
  let storeAccountName = input.storeAccountName;

  if (input.storeProfileId) {
    const profile = await getIosStoreProfileById(input.storeProfileId);
    if (!profile) {
      throw notFound("iOS store profile was not found.");
    }

    storeAccountName = profile.storeAccountName;
  }

  const mapping = await runRepositoryTransaction(async (tx) => {
    const savedMapping = await saveIosStoreMapping(tx, {
      ...input,
      storeAccountName,
    });
    await ensureIosReviewTargetsForMapping(savedMapping.id, tx);
    return savedMapping;
  });
  return iosStoreMappingToTracking(mapping);
}

export function deleteIosStoreMappingById(id: string) {
  return deleteIosStoreMapping(id);
}

export async function createIosStoreMapping(payload: StoreMappingPayload) {
  if (payload.platform && payload.platform !== "ios") {
    throw badRequest("iOS route only accepts iOS mappings.");
  }

  const row = normalizeIosMappingPayload(payload);
  validateIosMapping(row);

  try {
    const mapping = await saveIosStoreMappingDto({
      appIconUrl: row.appIconUrl,
      appLink: row.appLink,
      appId: row.appId,
      appName: row.appName,
      bundleId: row.bundleId!,
      firebaseAnalyticsApiSecret: row.firebaseAnalyticsApiSecret ?? null,
      firebaseAppId: row.firebaseAppId,
      status: row.status,
      storeAccountName: row.storeAccountName,
      storeProfileId: row.storeProfileId,
    });

    return { mapping, message: `iOS app mapping for ${row.appName} has been saved.` };
  } catch (error) {
    mapIosStoreMappingError(error);
  }
}

export async function updateIosStoreMapping(payload: StoreMappingPayload) {
  const id = cleanText(payload.id);

  if (!id) {
    throw badRequest("Mapping id is required.");
  }

  if (!(await iosStoreMappingExists(id))) {
    throw notFound("iOS mapping was not found.");
  }

  const row = normalizeIosMappingPayload(payload);
  validateIosMapping(row);

  try {
    const mapping = await saveIosStoreMappingDto({
      appIconUrl: row.appIconUrl,
      appLink: row.appLink,
      appId: row.appId,
      appName: row.appName,
      bundleId: row.bundleId!,
      firebaseAnalyticsApiSecret: row.firebaseAnalyticsApiSecret,
      firebaseAppId: row.firebaseAppId,
      id,
      status: row.status,
      storeAccountName: row.storeAccountName,
      storeProfileId: row.storeProfileId,
    });

    return { mapping, message: `iOS app mapping for ${row.appName} has been updated.` };
  } catch (error) {
    mapIosStoreMappingError(error);
  }
}

export async function deleteIosStoreMappingConfig(payload: StoreMappingPayload) {
  const id = cleanText(payload.id);

  if (!id) {
    throw badRequest("Mapping id is required.");
  }

  if (!(await iosStoreMappingExists(id))) {
    throw notFound("iOS mapping was not found.");
  }

  await deleteIosStoreMappingById(id);

  return { deleted: id, message: "iOS app mapping deleted." };
}
