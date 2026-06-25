import "server-only";

import {
  canAccessRecordViaStoreMappings,
  canAccessScopedRecord,
} from "@/lib/auth/app-scope";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { forbidden } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { verifyIosIapTransaction } from "@/lib/server/services/iap/ios-iap-verify.service";
import { getIosStoreMappingDtos } from "@/lib/server/services/store-mappings/ios-store-mapping.service";

const iapRoles = ["Admin", "Dev", "Marketing"] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function handleAdminIosIapVerifyPost(request: Request) {
  try {
    const session = await requireConsoleApiSession([...iapRoles]);
    const payload = await parseJsonBody<Record<string, unknown>>(request);
    if (session.role !== "Admin") {
      const record = { bundleId: clean(payload.bundleId) };
      const mappings = await getIosStoreMappingDtos({ take: 500 });
      if (
        !canAccessScopedRecord(session, record) &&
        !canAccessRecordViaStoreMappings(session, record, mappings)
      ) {
        throw forbidden("This iOS app is outside your assigned app scope.");
      }
    }

    return okJson(await verifyIosIapTransaction(payload));
  } catch (error) {
    return errorJson(error, "iOS IAP verification failed.");
  }
}
