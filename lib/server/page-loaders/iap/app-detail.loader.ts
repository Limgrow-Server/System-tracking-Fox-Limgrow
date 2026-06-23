import "server-only";

import { getIapAppDetail } from "@/lib/server/services/iap/iap-app.service";
import type { IapAppDetailPageData } from "@/lib/tracking/page-data";

export async function getIapAppDetailPageData(mappingId: string, platform: string): Promise<IapAppDetailPageData> {
  const { appCard, transactions } = await getIapAppDetail(mappingId, platform);

  return {
    app: appCard,
    transactions,
  };
}
