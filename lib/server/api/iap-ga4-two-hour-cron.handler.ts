import "server-only";

import { forbidden } from "@/lib/server/api/errors";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { runIosIapTwoHourGa4Checks } from "@/lib/server/services/iap/ios-iap-two-hour-ga4.service";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertCronSecret(request: Request) {
  const expected =
    clean(process.env.IOS_IAP_2HOUR_CHECK_SECRET) ||
    clean(process.env.NOTIFICATION_QUEUE_SECRET);
  if (!expected) return;

  const provided =
    clean(request.headers.get("x-iap-2hour-secret")) ||
    clean(request.headers.get("x-cron-secret"));

  if (provided !== expected) {
    throw forbidden("ios_iap_2hour_check_secret_required");
  }
}

function limitFromRequest(request: Request) {
  const url = new URL(request.url);
  const limit = Number.parseInt(clean(url.searchParams.get("limit")), 10);
  return Number.isFinite(limit) && limit >= 0 ? limit : undefined;
}

export async function handleIapGa4TwoHourCronGet(request: Request) {
  try {
    assertCronSecret(request);

    return okJson({
      result: await runIosIapTwoHourGa4Checks({
        limit: limitFromRequest(request),
      }),
    });
  } catch (error) {
    return errorJson(error, "iOS IAP 2-hour GA4 worker failed.");
  }
}

export async function handleIapGa4TwoHourCronPost(request: Request) {
  return handleIapGa4TwoHourCronGet(request);
}
