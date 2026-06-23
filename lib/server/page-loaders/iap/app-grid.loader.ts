import "server-only";

import { getIapAppCards } from "@/lib/server/services/iap/iap-app.service";
import type { IapAppGridPageData } from "@/lib/tracking/page-data";

export async function getIapAppGridPageData(): Promise<IapAppGridPageData> {
  const apps = await getIapAppCards();
  
  // Extract unique store account names for filtering
  const storeNames = Array.from(new Set(apps.map(app => app.storeAccountName))).sort();

  return {
    apps,
    storeNames,
  };
}
