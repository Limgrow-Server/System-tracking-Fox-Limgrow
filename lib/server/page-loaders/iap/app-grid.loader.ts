import "server-only";

import { canAccessIapApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { getIapAppCards } from "@/lib/server/services/iap/iap-app.service";
import type { IapAppGridPageData } from "@/lib/tracking/page-data";

export async function getIapAppGridPageData(
  session: ConsoleSession,
): Promise<IapAppGridPageData> {
  const allApps = await getIapAppCards();
  const apps = allApps.filter((app) => canAccessIapApp(session, app));
  
  // Extract unique store account names for filtering
  const storeNames = Array.from(new Set(apps.map(app => app.storeAccountName))).sort();

  return {
    apps,
    storeNames,
  };
}
