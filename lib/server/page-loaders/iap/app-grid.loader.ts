import "server-only";

import { fetchSystemTrackingApi } from "@/lib/server-api";
import type { IapAppGridPageData } from "@/lib/tracking/page-data";

const IAP_APP_PAGE_SIZE = 12;

type IapAppGridOptions = {
  page?: number;
  platform?: string;
  search?: string;
  storeAccountName?: string;
};

function pageNumber(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? value : 1;
}

export async function getIapAppGridPageData(
  options?: IapAppGridOptions,
): Promise<IapAppGridPageData> {
  const platform =
    options?.platform === "android" || options?.platform === "ios"
      ? options.platform
      : "all";
  const search = options?.search?.trim() ?? "";
  const storeAccountName = options?.storeAccountName?.trim() ?? "";
  const page = pageNumber(options?.page);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(IAP_APP_PAGE_SIZE),
  });
  if (platform !== "all") params.set("platform", platform);
  if (search) params.set("search", search);
  if (storeAccountName) params.set("store", storeAccountName);

  const response = await fetchSystemTrackingApi(
    `/api/admin/iap/apps?${params.toString()}`,
  );
  const payload = await response.json() as {
    data?: IapAppGridPageData["apps"];
    error?: string;
    filters?: IapAppGridPageData["filters"];
    page?: number;
    pageSize?: number;
    storeNames?: string[];
    success?: boolean;
    total?: number;
    totalPages?: number;
  };

  if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
    throw new Error(payload.error ?? "Load IAP apps failed.");
  }

  return {
    appPagination: {
      page: payload.page ?? page,
      pageSize: payload.pageSize ?? IAP_APP_PAGE_SIZE,
      total: payload.total ?? payload.data.length,
      totalPages: payload.totalPages ?? 1,
    },
    apps: payload.data,
    filters: payload.filters ?? {
      platform,
      search,
      storeAccountName,
    },
    storeNames: Array.isArray(payload.storeNames) ? payload.storeNames : [],
  };
}
