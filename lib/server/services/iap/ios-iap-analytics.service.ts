import "server-only";

import type { IosIapNotificationEvent, IosIapTransaction } from "@prisma/client";

import {
  getIosIapNotificationEventSummaryByBundleId,
  getIosIapNotificationEventsByBundleId,
  getIosTrialAnalyticsTransactions,
} from "@/lib/server/repositories/iap/iap-app.repository";
import type {
  IapNotificationEventDto,
  IapTrialConversionAnalytics,
  IapTrialConversionCohort,
  IapTrialConversionGranularity,
} from "@/lib/tracking/page-data";

type TrialChain = {
  activeAfterTrial: boolean;
  converted: boolean;
  firstPaidAt: Date | null;
  refunded: boolean;
  renewalRevenueMicros: bigint;
  revoked: boolean;
  trialAt: Date | null;
  trialExpiresAt: Date | null;
  trialRevenueMicros: bigint;
};

function micros(value: bigint | number | null | undefined) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  return BigInt(0);
}

function lower(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dateFromMillis(value: unknown) {
  const millis = numberValue(value);
  if (millis === null) return null;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function renewalInfoFromEvent(event: IosIapNotificationEvent) {
  const decodedPayload = jsonRecord(event.decodedPayload);
  return jsonRecord(decodedPayload?.decodedRenewalInfo);
}

function renewalStatusFromEvent(event: IosIapNotificationEvent) {
  const renewalInfo = renewalInfoFromEvent(event);
  const autoRenewStatus = numberValue(renewalInfo?.autoRenewStatus);

  if (autoRenewStatus === 1) return "enabled" as const;
  if (autoRenewStatus === 0) return "disabled" as const;

  const subtype = event.subtype?.trim().toUpperCase();
  if (subtype === "AUTO_RENEW_ENABLED") return "enabled" as const;
  if (subtype === "AUTO_RENEW_DISABLED") return "disabled" as const;

  return null;
}

function isTrialTransaction(transaction: IosIapTransaction) {
  return (
    transaction.isTrial === true ||
    lower(transaction.offerDiscountType) === "free_trial" ||
    (transaction.offerType === 1 &&
      micros(transaction.revenueMicros) === BigInt(0) &&
      micros(transaction.priceMilliunits) === BigInt(0))
  );
}

function isRefundedTransaction(transaction: IosIapTransaction) {
  const state = lower(transaction.state);
  return state.includes("refund") || Boolean(transaction.revocationDate);
}

function isRevokedTransaction(transaction: IosIapTransaction) {
  const state = lower(transaction.state);
  return state.includes("revoke") || lower(transaction.revocationType).includes("revoke");
}

function paidAmount(transaction: IosIapTransaction) {
  return micros(transaction.revenueMicros);
}

function isPaidContinuation(transaction: IosIapTransaction, trial: IosIapTransaction) {
  if (transaction.transactionId === trial.transactionId) return false;
  if (isTrialTransaction(transaction)) return false;
  if (paidAmount(transaction) <= BigInt(0)) return false;
  const continuationStart = trial.expiresDate ?? trial.purchaseDate;
  if (!continuationStart || !transaction.purchaseDate) return true;

  return transaction.purchaseDate.getTime() >= continuationStart.getTime();
}

function chainKey(transaction: IosIapTransaction) {
  return transaction.originalTransactionId || transaction.transactionId;
}

function transactionTime(transaction: IosIapTransaction) {
  return (
    transaction.purchaseDate?.getTime() ??
    transaction.verifiedAt.getTime() ??
    transaction.createdAt.getTime()
  );
}

function sortTransactions(transactions: IosIapTransaction[]) {
  return [...transactions].sort((a, b) => transactionTime(a) - transactionTime(b));
}

function chainIsActiveAfterTrial(transactions: IosIapTransaction[]) {
  const latest = sortTransactions(transactions).at(-1);
  if (!latest) return false;

  const state = lower(latest.state);
  if (state.includes("expired") || state.includes("cancel") || state.includes("refund")) {
    return false;
  }
  if (state.includes("revoke")) return false;
  if (!latest.expiresDate) return state === "purchased" || state === "active";

  return latest.expiresDate.getTime() > Date.now();
}

function monthLabel(date: Date | null) {
  if (!date) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function startOfUtcWeek(date: Date) {
  const day = date.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  const result = startOfUtcDay(date);
  result.setUTCDate(result.getUTCDate() - offset);

  return result;
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function bucketStart(date: Date, granularity: IapTrialConversionGranularity) {
  if (granularity === "day") return startOfUtcDay(date);
  if (granularity === "week") return startOfUtcWeek(date);
  return startOfUtcMonth(date);
}

function dayMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function cohortLabel(date: Date | null, granularity: IapTrialConversionGranularity) {
  if (!date) return "Unknown";
  if (granularity === "day") return dayMonthLabel(date);
  if (granularity === "week") {
    const end = new Date(date);
    end.setUTCDate(end.getUTCDate() + 6);
    return `${dayMonthLabel(date)} - ${dayMonthLabel(end)}`;
  }
  return monthLabel(date);
}

function cohortLimit(granularity: IapTrialConversionGranularity) {
  if (granularity === "day") return 14;
  if (granularity === "week") return 12;
  return 12;
}

function eventToDto(event: IosIapNotificationEvent): IapNotificationEventDto {
  const renewalInfo = renewalInfoFromEvent(event);

  return {
    appAppleId: event.appAppleId,
    bundleId: event.bundleId,
    decodedPayload: event.decodedPayload,
    environment: event.environment,
    errorMessage: event.errorMessage,
    id: event.id,
    notificationType: event.notificationType,
    notificationUuid: event.notificationUuid,
    originalTransactionId: event.originalTransactionId,
    processedAt: event.processedAt?.toISOString() ?? null,
    rawPayload: event.rawPayload,
    receivedAt: event.receivedAt.toISOString(),
    renewalAutoRenewStatus: numberValue(renewalInfo?.autoRenewStatus),
    renewalDate: dateFromMillis(renewalInfo?.renewalDate),
    renewalProductId:
      typeof renewalInfo?.autoRenewProductId === "string"
        ? renewalInfo.autoRenewProductId
        : null,
    renewalStatus: renewalStatusFromEvent(event),
    signedDate: event.signedDate?.toISOString() ?? null,
    status: event.status,
    subtype: event.subtype,
    transactionId: event.transactionId,
  };
}

function conversionRate(converted: number, total: number) {
  return total > 0 ? Math.round((converted / total) * 1000) / 10 : 0;
}

function buildChain(transactions: IosIapTransaction[]): TrialChain | null {
  const sorted = sortTransactions(transactions);
  const trial = sorted.find(isTrialTransaction);
  if (!trial) return null;

  const paidTransactions = sorted.filter((transaction) =>
    isPaidContinuation(transaction, trial),
  );
  const firstPaid = paidTransactions.at(0) ?? null;
  const refunded = sorted.some(isRefundedTransaction);
  const revoked = sorted.some(isRevokedTransaction);

  return {
    activeAfterTrial: paidTransactions.length > 0 && chainIsActiveAfterTrial(sorted),
    converted: paidTransactions.length > 0,
    firstPaidAt: firstPaid?.purchaseDate ?? null,
    refunded,
    renewalRevenueMicros: paidTransactions.reduce(
      (total, transaction) => total + paidAmount(transaction),
      BigInt(0),
    ),
    revoked,
    trialAt: trial.purchaseDate,
    trialExpiresAt: trial.expiresDate,
    trialRevenueMicros: paidAmount(trial),
  };
}

function buildCohorts(
  chains: TrialChain[],
  granularity: IapTrialConversionGranularity,
) {
  const buckets = new Map<string, IapTrialConversionCohort>();

  const sortedChains = [...chains].sort(
    (a, b) => (a.trialAt?.getTime() ?? 0) - (b.trialAt?.getTime() ?? 0),
  );

  for (const chain of sortedChains) {
    const date = chain.trialAt ? bucketStart(chain.trialAt, granularity) : null;
    const key = date?.toISOString() ?? "unknown";
    const label = cohortLabel(date, granularity);
    const current =
      buckets.get(key) ??
      {
        converted: 0,
        conversionRate: 0,
        label,
        refunded: 0,
        renewalRevenueMicros: "0",
        trialStarted: 0,
      };

    current.trialStarted += 1;
    if (chain.converted) current.converted += 1;
    if (chain.refunded || chain.revoked) current.refunded += 1;
    current.renewalRevenueMicros = (
      BigInt(current.renewalRevenueMicros) + chain.renewalRevenueMicros
    ).toString();
    current.conversionRate = conversionRate(current.converted, current.trialStarted);
    buckets.set(key, current);
  }

  return Array.from(buckets.values()).slice(-cohortLimit(granularity));
}

function avgDays(values: number[]) {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

export async function getIosTrialConversionAnalytics(
  bundleId: string,
  storeProfileId: string | undefined,
): Promise<IapTrialConversionAnalytics> {
  const [transactions, notificationEvents, notificationSummary] = await Promise.all([
    getIosTrialAnalyticsTransactions(bundleId, storeProfileId),
    getIosIapNotificationEventsByBundleId(bundleId, storeProfileId),
    getIosIapNotificationEventSummaryByBundleId(bundleId, storeProfileId),
  ]);

  const groups = new Map<string, IosIapTransaction[]>();
  for (const transaction of transactions) {
    const key = chainKey(transaction);
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  const chains = Array.from(groups.values())
    .map(buildChain)
    .filter((chain): chain is TrialChain => Boolean(chain));

  const convertedCount = chains.filter((chain) => chain.converted).length;
  const refundedCount = chains.filter((chain) => chain.refunded).length;
  const revokedCount = chains.filter((chain) => chain.revoked).length;
  const pendingCount = chains.filter(
    (chain) =>
      !chain.converted &&
      !chain.refunded &&
      !chain.revoked &&
      Boolean(chain.trialExpiresAt && chain.trialExpiresAt.getTime() > Date.now()),
  ).length;
  const notConvertedCount = chains.filter(
    (chain) =>
      !chain.converted &&
      !chain.refunded &&
      !chain.revoked &&
      !(
        chain.trialExpiresAt &&
        chain.trialExpiresAt.getTime() > Date.now()
      ),
  ).length;
  const conversionDayValues = chains
    .filter((chain) => chain.converted && chain.firstPaidAt)
    .map((chain) => {
      const base = chain.trialExpiresAt ?? chain.trialAt ?? chain.firstPaidAt;
      if (!base || !chain.firstPaidAt) return 0;
      return Math.max(
        0,
        (chain.firstPaidAt.getTime() - base.getTime()) / (24 * 60 * 60 * 1000),
      );
    });
  const statusCounts = new Map(
    notificationSummary.counts.map((row) => [
      lower(row.status),
      row._count._all,
    ]),
  );
  const cohortsByGranularity = {
    day: buildCohorts(chains, "day"),
    month: buildCohorts(chains, "month"),
    week: buildCohorts(chains, "week"),
  };

  return {
    activeAfterTrialCount: chains.filter((chain) => chain.activeAfterTrial).length,
    avgDaysToConversion: avgDays(conversionDayValues),
    cohorts: cohortsByGranularity.month,
    cohortsByGranularity,
    conversionRate: conversionRate(convertedCount, chains.length),
    convertedCount,
    failedNotificationCount: statusCounts.get("failed") ?? 0,
    ignoredNotificationCount: statusCounts.get("ignored") ?? 0,
    lastNotificationAt:
      notificationSummary.latest?.receivedAt.toISOString() ?? null,
    notConvertedCount,
    pendingCount,
    processedNotificationCount: statusCounts.get("processed") ?? 0,
    recentNotificationEvents: notificationEvents.map(eventToDto),
    refundedCount,
    refundRate: conversionRate(refundedCount + revokedCount, chains.length),
    renewalRevenueMicros: chains
      .reduce((total, chain) => total + chain.renewalRevenueMicros, BigInt(0))
      .toString(),
    revokedCount,
    trialRevenueMicros: chains
      .reduce((total, chain) => total + chain.trialRevenueMicros, BigInt(0))
      .toString(),
    trialStartedCount: chains.length,
  };
}
