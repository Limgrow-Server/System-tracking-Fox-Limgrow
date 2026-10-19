import "server-only";

import { fetchSystemTrackingApi } from "@/lib/server-api";
import type { IapTrialConversionPageData } from "@/lib/tracking/page-data";

export async function getIapTrialConversionPageData(
  mappingId?: string,
): Promise<IapTrialConversionPageData> {
  const params = new URLSearchParams();
  if (mappingId?.trim()) params.set("mappingId", mappingId.trim());
  const query = params.size ? `?${params.toString()}` : "";
  const response = await fetchSystemTrackingApi(
    `/api/admin/iap/trial-conversion-overview${query}`,
  );
  const payload = (await response.json()) as IapTrialConversionPageData & {
    error?: string;
    success?: boolean;
  };

  if (!response.ok || !payload.success || !Array.isArray(payload.apps)) {
    throw new Error(
      payload.error ?? "Load IAP trial conversion overview failed.",
    );
  }

  return {
    analytics: payload.analytics ?? null,
    apps: payload.apps,
    selectedApp: payload.selectedApp ?? null,
  };
}
