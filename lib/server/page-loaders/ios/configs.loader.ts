import "server-only";

import { fetchSystemTrackingApi } from "@/lib/server-api";
import type { ConfigsPageData } from "@/lib/tracking/page-data";

export async function getIosConfigsPageData(): Promise<ConfigsPageData> {
  const response = await fetchSystemTrackingApi(
    "/api/admin/credentials?platform=ios&page=1&pageSize=10",
  );
  const payload = await response.json() as {
    data?: ConfigsPageData["credentialSecrets"];
    error?: string;
    page?: number;
    pageSize?: number;
    success?: boolean;
    total?: number;
    totalPages?: number;
  };
  if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
    throw new Error(payload.error ?? "Load iOS credentials failed.");
  }

  return {
    credentialPagination: {
      page: payload.page ?? 1,
      pageSize: payload.pageSize ?? 10,
      total: payload.total ?? payload.data.length,
      totalPages: payload.totalPages ?? 1,
    },
    credentialSecrets: payload.data,
  };
}
