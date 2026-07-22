import "server-only";

import { fetchSystemTrackingApi } from "@/lib/server-api";
import type { StoreMappingPageData } from "@/lib/tracking/page-data";

export async function getIosStoreMappingPageData(): Promise<StoreMappingPageData> {
  const response = await fetchSystemTrackingApi(
    "/api/admin/store-mappings?platform=ios&page=1&pageSize=10",
  );
  const payload = await response.json() as {
    data?: StoreMappingPageData["storeMappings"];
    error?: string;
    page?: number;
    pageSize?: number;
    storeOptions?: StoreMappingPageData["storeOptions"];
    success?: boolean;
    total?: number;
    totalPages?: number;
  };
  if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
    throw new Error(payload.error ?? "Load iOS app mappings failed.");
  }

  return {
    credentialSecrets: [],
    storeMappingPagination: {
      page: payload.page ?? 1,
      pageSize: payload.pageSize ?? 10,
      total: payload.total ?? payload.data.length,
      totalPages: payload.totalPages ?? 1,
    },
    storeMappings: payload.data,
    storeOptions: Array.isArray(payload.storeOptions) ? payload.storeOptions : [],
  };
}
