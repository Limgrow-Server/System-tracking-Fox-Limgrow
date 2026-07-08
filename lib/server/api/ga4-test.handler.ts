import "server-only";

import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/server/api/errors";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  getIosIapRenewalEvidence,
  markIosIapTwoHourCheckSent,
  markIosIapTwoHourCheckFailed,
} from "@/lib/server/repositories/iap/ios-iap-two-hour-check.repository";
import { runIosIapTwoHourGa4Checks } from "@/lib/server/services/iap/ios-iap-two-hour-ga4.service";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function handleGa4TestPost(request: Request) {
  try {
    const body = await request.json() as unknown;
    if (!isRecord(body)) throw badRequest("Request body must be a JSON object.");

    const transactionId = clean(body.transactionId);
    if (!transactionId) throw badRequest("transactionId is required.");

    // 1. Tìm check record thực tế dựa theo transactionId
    const check = await prisma.iosIapTwoHourCheck.findFirst({
      where: { transactionId },
    });

    if (!check) {
      throw notFound(`No two-hour check record found for transactionId: "${transactionId}"`);
    }

    // 2. Chạy logic xử lý gửi GA4 ngay lập tức cho check record này
    // Bỏ qua check_at, bỏ qua trạng thái hiện tại (force send)
    // Tạm thời claim record bằng cách đưa status về 'processing'
    const processingCheck = await prisma.iosIapTwoHourCheck.update({
      where: { id: check.id },
      data: {
        status: "processing",
        attempts: check.attempts + 1,
        updatedAt: new Date(),
      },
    });

    // 3. Import các file config phục vụ quyết định renewal và bắn GA4
    // Sử dụng helper giống hệt code cron thật để tránh lệch logic
    // we need to resolve it exactly like runIosIapTwoHourGa4Checks does, but only for this specific check
    const { runIosIapTwoHourGa4Checks } = await import(
      "@/lib/server/services/iap/ios-iap-two-hour-ga4.service"
    );

    // Để thực hiện force send đúng context, ta dùng hàm runIosIapTwoHourGa4Checks gốc bằng cách tạm thời cập nhật check_at của record này về quá khứ và đặt status = 'pending'
    const testCheck = await prisma.iosIapTwoHourCheck.update({
      where: { id: check.id },
      data: {
        status: "pending",
        checkAt: new Date(Date.now() - 10000), // set về quá khứ để query raw gắp được
      },
    });

    // Chạy cron limit = 1 để nó pick đúng record vừa set
    const cronResult = await runIosIapTwoHourGa4Checks({ limit: 1 });

    // Lấy lại thông tin check record sau khi cron xử lý xong
    const updatedCheck = await prisma.iosIapTwoHourCheck.findUnique({
      where: { id: check.id },
    });

    return okJson({
      result: {
        message: "Force send completed",
        transactionId,
        checkBefore: {
          id: check.id,
          status: check.status,
          checkAt: check.checkAt,
          attempts: check.attempts,
        },
        checkAfter: {
          id: updatedCheck?.id,
          status: updatedCheck?.status,
          checkAt: updatedCheck?.checkAt,
          attempts: updatedCheck?.attempts,
          ga4SentAt: updatedCheck?.ga4SentAt,
          lastError: updatedCheck?.lastError,
          renewed: updatedCheck?.renewed,
          renewalStatus: updatedCheck?.renewalStatus,
        },
        cronResult,
      },
    });
  } catch (error) {
    return errorJson(error, "GA4 force send test failed.");
  }
}
