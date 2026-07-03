import "server-only";

import { canAccessIapApp } from "@/lib/auth/app-scope";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { badRequest, forbidden } from "@/lib/server/api/errors";
import { paginatedJson, paginationFromSearchParams } from "@/lib/server/api/pagination";
import { errorJson } from "@/lib/server/api/responses";
import {
  getIapAppContext,
  getIapAppCards,
  getIapAppCardsPage,
  getIapAppTrialAnalytics,
  getIapAppTransactionsPage,
} from "@/lib/server/services/iap/iap-app.service";

function clean(value: string | null) {
  return value?.trim() ?? "";
}

function optionalPositiveInt(value: string | null) {
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
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
    const platform =
      clean(url.searchParams.get("platform")) === "android" ||
      clean(url.searchParams.get("platform")) === "ios"
        ? clean(url.searchParams.get("platform"))
        : "all";
    const search = clean(url.searchParams.get("search"));
    const storeAccountName = clean(url.searchParams.get("store"));
    const [allApps, matchingApps] = await Promise.all([
      getIapAppCards({ platform }),
      getIapAppCards({
        platform,
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
      filters: {
        platform,
        search,
        storeAccountName,
      },
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

    const detail = await getIapAppTransactionsPage(mappingId, platform, {
      ...pagination,
      environment: clean(url.searchParams.get("environment")) || undefined,
      includeContext: clean(url.searchParams.get("context")) !== "false",
      knownTotal: optionalPositiveInt(url.searchParams.get("knownTotal")),
      kind: clean(url.searchParams.get("kind")) || "all",
      state: clean(url.searchParams.get("state")) || "all",
      trial: clean(url.searchParams.get("trial")) || "all",
    });

    if (!canAccessIapApp(session, detail.appCard)) {
      throw forbidden("You do not have access to this IAP app.");
    }

    return paginatedJson(detail.transactions, {
      metrics: detail.metrics,
      transactionStates: detail.transactionStates,
    });
  } catch (error) {
    return errorJson(error, "List IAP transactions failed.");
  }
}

export async function handleAdminIapAppContextGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([
      "Admin",
      "Dev",
      "Marketing",
    ]);
    const url = new URL(request.url);
    const mappingId = clean(url.searchParams.get("mappingId"));
    const platform = platformFromSearch(clean(url.searchParams.get("platform")));

    if (!mappingId) throw badRequest("IAP mapping id is required.");

    const detail = await getIapAppContext(mappingId, platform, {
      environment: clean(url.searchParams.get("environment")) || undefined,
      kind: clean(url.searchParams.get("kind")) || "all",
      state: clean(url.searchParams.get("state")) || "all",
      trial: clean(url.searchParams.get("trial")) || "all",
    });

    if (!canAccessIapApp(session, detail.appCard)) {
      throw forbidden("You do not have access to this IAP app.");
    }

    return Response.json({
      success: true,
      metrics: detail.metrics,
      transactionStates: detail.transactionStates,
    });
  } catch (error) {
    return errorJson(error, "Load IAP app context failed.");
  }
}

export async function handleAdminIapTrialAnalyticsGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([
      "Admin",
      "Dev",
      "Marketing",
    ]);
    const url = new URL(request.url);
    const mappingId = clean(url.searchParams.get("mappingId"));
    const platform = platformFromSearch(clean(url.searchParams.get("platform")));

    if (!mappingId) throw badRequest("IAP mapping id is required.");

    const detail = await getIapAppTrialAnalytics(mappingId, platform);

    if (!canAccessIapApp(session, detail.appCard)) {
      throw forbidden("You do not have access to this IAP app.");
    }

    return Response.json({
      success: true,
      trialAnalytics: detail.trialAnalytics,
    });
  } catch (error) {
    return errorJson(error, "Load IAP trial analytics failed.");
  }
}
