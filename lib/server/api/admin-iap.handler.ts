import "server-only";

import { canAccessIapApp } from "@/lib/auth/app-scope";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { badRequest, forbidden } from "@/lib/server/api/errors";
import { paginatedJson, paginationFromSearchParams } from "@/lib/server/api/pagination";
import { errorJson } from "@/lib/server/api/responses";
import {
  getIapAppCards,
  getIapAppCardsPage,
  getIapAppDetail,
} from "@/lib/server/services/iap/iap-app.service";

function clean(value: string | null) {
  return value?.trim() ?? "";
}

function platformFromSearch(value: string) {
  if (value === "android" || value === "ios") return value;
  throw badRequest("IAP platform is required.");
}

export async function handleAdminIapAppsGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([
      "Admin",
      "Dev",
      "Marketing",
    ]);
    const url = new URL(request.url);
    const pagination = paginationFromSearchParams(url.searchParams, {
      defaultPageSize: 12,
      maxPageSize: 12,
    });
    const search = clean(url.searchParams.get("search"));
    const storeAccountName = clean(url.searchParams.get("store"));
    const [allApps, matchingApps] = await Promise.all([
      getIapAppCards(),
      getIapAppCards({
        search: search || undefined,
        storeAccountName: storeAccountName || undefined,
      }),
    ]);
    const scopedApps = matchingApps.filter((app) =>
      canAccessIapApp(session, app),
    );
    const scopedStoreApps = allApps.filter((app) =>
      canAccessIapApp(session, app),
    );
    const storeNames = Array.from(
      new Set(scopedStoreApps.map((app) => app.storeAccountName)),
    ).sort();

    return paginatedJson(getIapAppCardsPage(scopedApps, pagination), {
      storeNames,
    });
  } catch (error) {
    return errorJson(error, "List IAP apps failed.");
  }
}

export async function handleAdminIapAppTransactionsGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([
      "Admin",
      "Dev",
      "Marketing",
    ]);
    const url = new URL(request.url);
    const mappingId = clean(url.searchParams.get("mappingId"));
    const platform = platformFromSearch(clean(url.searchParams.get("platform")));
    const pagination = paginationFromSearchParams(url.searchParams, {
      defaultPageSize: 10,
      maxPageSize: 10,
    });

    if (!mappingId) throw badRequest("IAP mapping id is required.");

    const detail = await getIapAppDetail(mappingId, platform, {
      ...pagination,
      kind: clean(url.searchParams.get("kind")) || "all",
      search: clean(url.searchParams.get("search")) || undefined,
      state: clean(url.searchParams.get("state")) || "all",
    });

    if (!canAccessIapApp(session, detail.appCard)) {
      throw forbidden("You do not have access to this IAP app.");
    }

    return paginatedJson(detail.transactions, {
      metricTransactions: detail.metricTransactions,
      transactionStates: detail.transactionStates,
    });
  } catch (error) {
    return errorJson(error, "List IAP transactions failed.");
  }
}
