import "server-only";

import { canAccessIapApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { getIapAppDetail } from "@/lib/server/services/iap/iap-app.service";
import type { IapAppDetailPageData } from "@/lib/tracking/page-data";

export async function getIapAppDetailPageData(
  mappingId: string,
  platform: string,
  session: ConsoleSession,
): Promise<IapAppDetailPageData | null> {
  const { appCard, transactions } = await getIapAppDetail(mappingId, platform);
  if (!canAccessIapApp(session, appCard)) return null;

  return {
    app: appCard,
    transactions,
  };
}
