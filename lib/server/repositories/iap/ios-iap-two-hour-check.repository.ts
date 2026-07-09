import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const iosIapTwoHourCheckSelect = {
  id: true,
  storeProfileId: true,
  transactionId: true,
  originalTransactionId: true,
  userId: true,
  bundleId: true,
  productId: true,
  environment: true,
  appInstanceId: true,
  firebaseAppId: true,
  adjustAdid: true,
  idfa: true,
  idfv: true,
  ga4EventName: true,
  checkAt: true,
  status: true,
  renewed: true,
  renewalStatus: true,
  ga4SentAt: true,
  attempts: true,
  lastError: true,
  rawContext: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.IosIapTwoHourCheckSelect;

const iosIapRenewalEvidenceTransactionSelect = {
  id: true,
  transactionId: true,
  originalTransactionId: true,
  state: true,
  revenueMicros: true,
  priceMilliunits: true,
  currency: true,
  adjustAdid: true,
  idfa: true,
  idfv: true,
  rawReceipt: true,
  verifiedAt: true,
} satisfies Prisma.IosIapTransactionSelect;

const iosIapRenewalEvidenceEventSelect = {
  id: true,
  notificationType: true,
  subtype: true,
  decodedPayload: true,
  originalTransactionId: true,
  transactionId: true,
  receivedAt: true,
  status: true,
} satisfies Prisma.IosIapNotificationEventSelect;

export type IosIapTwoHourCheckRecord =
  Prisma.IosIapTwoHourCheckGetPayload<{
    select: typeof iosIapTwoHourCheckSelect;
  }>;

export type IosIapRenewalEvidenceTransaction =
  Prisma.IosIapTransactionGetPayload<{
    select: typeof iosIapRenewalEvidenceTransactionSelect;
  }>;

export type IosIapRenewalEvidenceEvent =
  Prisma.IosIapNotificationEventGetPayload<{
    select: typeof iosIapRenewalEvidenceEventSelect;
  }>;

type ClaimedIosIapTwoHourCheckRow = {
  adjustAdid: string | null;
  appInstanceId: string;
  attempts: number;
  bundleId: string;
  checkAt: Date;
  createdAt: Date;
  environment: string;
  firebaseAppId: string | null;
  ga4EventName: string;
  ga4SentAt: Date | null;
  id: string;
  idfa: string | null;
  idfv: string | null;
  lastError: string | null;
  originalTransactionId: string | null;
  productId: string;
  rawContext: Prisma.JsonValue;
  renewalStatus: string | null;
  renewed: boolean | null;
  status: string;
  storeProfileId: string | null;
  transactionId: string;
  updatedAt: Date;
  userId: string | null;
};

export function getIosIapTwoHourChecksForTransactions(
  transactionIds: string[],
) {
  if (!transactionIds.length) return Promise.resolve([]);

  return prisma.iosIapTwoHourCheck.findMany({
    where: {
      transactionId: { in: transactionIds },
    },
    orderBy: { updatedAt: "desc" },
    select: iosIapTwoHourCheckSelect,
  });
}

export async function claimDueIosIapTwoHourChecks(input: {
  limit: number;
  maxAttempts: number;
}) {
  const rows = await prisma.$queryRaw<ClaimedIosIapTwoHourCheckRow[]>(Prisma.sql`
    WITH next_jobs AS (
      SELECT id
      FROM public.ios_iap_two_hour_checks
      WHERE status IN ('pending', 'retrying')
        AND check_at <= now()
        AND attempts < ${input.maxAttempts}
      ORDER BY check_at ASC, created_at ASC
      LIMIT ${input.limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.ios_iap_two_hour_checks checks
    SET
      attempts = checks.attempts + 1,
      last_error = NULL,
      status = 'processing',
      updated_at = now()
    FROM next_jobs
    WHERE checks.id = next_jobs.id
    RETURNING
      checks.id,
      checks.store_profile_id AS "storeProfileId",
      checks.transaction_id AS "transactionId",
      checks.original_transaction_id AS "originalTransactionId",
      checks.user_id AS "userId",
      checks.bundle_id AS "bundleId",
      checks.product_id AS "productId",
      checks.environment,
      checks.app_instance_id AS "appInstanceId",
      checks.firebase_app_id AS "firebaseAppId",
      checks.adjust_adid AS "adjustAdid",
      checks.idfa,
      checks.idfv,
      checks.ga4_event_name AS "ga4EventName",
      checks.check_at AS "checkAt",
      checks.status,
      checks.renewed,
      checks.renewal_status AS "renewalStatus",
      checks.ga4_sent_at AS "ga4SentAt",
      checks.attempts,
      checks.last_error AS "lastError",
      checks.raw_context AS "rawContext",
      checks.created_at AS "createdAt",
      checks.updated_at AS "updatedAt"
  `);

  return rows;
}

export async function getIosIapRenewalEvidence(input: {
  originalTransactionId: string | null;
  transactionId: string;
}) {
  const transactionConditions: Prisma.IosIapTransactionWhereInput[] = [
    { transactionId: input.transactionId },
  ];
  const eventConditions: Prisma.IosIapNotificationEventWhereInput[] = [
    { transactionId: input.transactionId },
  ];

  if (input.originalTransactionId) {
    transactionConditions.push({
      originalTransactionId: input.originalTransactionId,
    });
    eventConditions.push({
      originalTransactionId: input.originalTransactionId,
    });
  }

  const [transactions, notificationEvents] = await Promise.all([
    prisma.iosIapTransaction.findMany({
      where: { OR: transactionConditions },
      orderBy: [{ verifiedAt: "desc" }, { createdAt: "desc" }],
      take: 12,
      select: iosIapRenewalEvidenceTransactionSelect,
    }),
    prisma.iosIapNotificationEvent.findMany({
      where: { OR: eventConditions },
      orderBy: { receivedAt: "desc" },
      take: 12,
      select: iosIapRenewalEvidenceEventSelect,
    }),
  ]);

  return { notificationEvents, transactions };
}

export function markIosIapTwoHourCheckSent(
  id: string,
  input: {
    rawContext: Prisma.InputJsonValue;
    renewalStatus: string;
    renewed: boolean;
  },
) {
  return prisma.iosIapTwoHourCheck.update({
    where: { id },
    data: {
      ga4SentAt: new Date(),
      lastError: null,
      rawContext: input.rawContext,
      renewalStatus: input.renewalStatus,
      renewed: input.renewed,
      status: "sent",
    },
    select: iosIapTwoHourCheckSelect,
  });
}

export function markIosIapTwoHourCheckFailed(
  id: string,
  input: {
    checkAt?: Date;
    lastError: string;
    rawContext?: Prisma.InputJsonValue;
    status: "failed" | "retrying";
  },
) {
  return prisma.iosIapTwoHourCheck.update({
    where: { id },
    data: {
      checkAt: input.checkAt,
      lastError: input.lastError,
      rawContext: input.rawContext,
      status: input.status,
    },
    select: iosIapTwoHourCheckSelect,
  });
}
