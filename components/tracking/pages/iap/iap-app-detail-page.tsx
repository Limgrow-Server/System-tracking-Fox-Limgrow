"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { DateRange } from "react-day-picker";
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  Calendar,
  CreditCard,
  FileJson,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  TableEmptyState,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  IapAppDetailPageData,
  IapAppMetrics,
  IapAppTransaction,
  IapRevenueGranularity,
  IapTrialConversionAnalytics,
} from "@/lib/tracking/page-data";
import type { IapAndroidDto } from "@/lib/server/services/iap/android-iap.service";
import type {
  IapOutboundDeliveryDto,
  IosIapTransactionSummary,
  IosIapTwoHourCheck,
} from "@/lib/tracking/types";
import { showToast } from "@/lib/client/toast";
import { AndroidRtdnHistoryPanel } from "./android-rtdn-history-panel";
import type { IapRevenueChartProps } from "./iap-revenue-chart";
import type { IosTrialAnalyticsPanelProps } from "./ios-trial-analytics-panel";
import { IapAppContextHeader } from "./iap-app-context-header";

const IapReceiptDialog = dynamic(
  () => import("./iap-receipt-dialog").then((mod) => mod.IapReceiptDialog),
  { loading: () => null },
);

const IapRevenueChart = dynamic<IapRevenueChartProps>(
  () => import("./iap-revenue-chart").then((mod) => mod.IapRevenueChart),
  {
    loading: () => (
      <div className="flex min-h-[320px] flex-col rounded-lg border bg-card p-5 lg:col-span-7">
        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
        <div className="mt-5 h-[240px] animate-pulse rounded bg-muted/60" />
      </div>
    ),
    ssr: false,
  },
);

const IosTrialAnalyticsPanel = dynamic<IosTrialAnalyticsPanelProps>(
  () =>
    import("./ios-trial-analytics-panel").then(
      (mod) => mod.IosTrialAnalyticsPanel,
    ),
  {
    loading: () => (
      <div className="h-[360px] overflow-hidden rounded-lg border bg-card">
        <div className="h-full animate-pulse bg-muted/30" />
      </div>
    ),
    ssr: false,
  },
);

type IapTransactionListResponse = {
  success?: boolean;
  data?: IapAppTransaction[];
  error?: string;
  metrics?: IapAppMetrics;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  transactionStates?: string[];
  twoHourChecks?: IosIapTwoHourCheck[];
};

type IapTrialAnalyticsResponse = {
  success?: boolean;
  error?: string;
  trialAnalytics?: IapTrialConversionAnalytics | null;
};

type IapAppContextResponse = {
  success?: boolean;
  error?: string;
  metrics?: IapAppMetrics;
  transactionStates?: string[];
};

type IapTransactionReceiptResponse = {
  success?: boolean;
  appPayload?: unknown;
  error?: string;
  rawReceipt?: unknown;
};

type IapSandboxDeleteResponse = {
  success?: boolean;
  error?: string;
  deletedTransactions?: number;
  totalDeleted?: number;
};

const IAP_TRANSACTION_SKELETON_COUNT = 8;
const IAP_REALTIME_REFRESH_DELAY_MS = 650;
const IAP_CONVERSION_FILTER_OPTIONS = [
  { label: "All conversion", value: "all" },
  { label: "Trial active", value: "trial_active" },
  { label: "Grace period", value: "grace_period" },
  { label: "Billing retry", value: "billing_retry" },
  { label: "Converted to paid", value: "converted_to_paid" },
  { label: "Not converted", value: "not_converted" },
];

function formatRevenue(
  micros: number | string | null,
  currency: string | null,
) {
  if (micros === null) return "N/A";
  const num = typeof micros === "number" ? micros : Number.parseInt(micros, 10);
  if (!Number.isFinite(num)) return "N/A";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: currency || "VND",
  }).format(num / 1000000);
}

function formatDate(dateVal: number | string | null) {
  if (!dateVal) return "N/A";
  let d = new Date(dateVal);
  if (Number.isNaN(d.getTime()) && !Number.isNaN(Number(dateVal))) {
    d = new Date(Number(dateVal));
  }
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromInputValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function displayDateValue(value: string) {
  const date = dateFromInputValue(value);
  if (!date) return "Purchase date";

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isIosTransaction(
  transaction: IapAppTransaction,
): transaction is IosIapTransactionSummary {
  return "transaction_id" in transaction;
}

function isAndroidTransaction(
  transaction: IapAppTransaction,
): transaction is IapAndroidDto {
  return "orderId" in transaction;
}

function transactionDisplayId(transaction: IapAppTransaction) {
  if (isIosTransaction(transaction)) return transaction.transaction_id;
  return transaction.orderId ?? transaction.purchaseToken;
}

function transactionSecondaryId(transaction: IapAppTransaction) {
  if (isIosTransaction(transaction)) return transaction.original_transaction_id;
  return transaction.purchaseToken;
}

function transactionProductId(transaction: IapAppTransaction) {
  return isIosTransaction(transaction)
    ? transaction.product_id
    : transaction.productId;
}

function transactionKind(transaction: IapAppTransaction) {
  return isAndroidTransaction(transaction) ? transaction.purchaseKind : null;
}

function transactionIsFreeTrial(transaction: IapAppTransaction) {
  if (isIosTransaction(transaction)) {
    return (
      transaction.is_trial === true ||
      transaction.offer_discount_type?.toLowerCase() === "free_trial"
    );
  }

  const phase = (transaction.billingPhase ?? transaction.offerPhase)
    ?.trim()
    .toLowerCase();
  return transaction.isTrial === true || phase === "free_trial";
}

function transactionTrialLabel(transaction: IapAppTransaction) {
  if (transactionIsFreeTrial(transaction)) return "Free Trial";
  const billingPhase = isIosTransaction(transaction)
    ? transaction.offer_discount_type
    : (transaction.billingPhase ?? transaction.offerPhase);

  if (billingPhase) {
    return billingPhase
      .toLowerCase()
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  if (isIosTransaction(transaction)) return "Paid";
  return transaction.purchaseKind === "subscription" &&
    transaction.isTrial === false
    ? "Paid"
    : null;
}

function transactionIsTest(transaction: IapAppTransaction) {
  return isIosTransaction(transaction)
    ? transaction.environment.toLowerCase() === "sandbox"
    : transaction.isTestPurchase;
}

function transactionRevenueMicros(transaction: IapAppTransaction) {
  return isIosTransaction(transaction)
    ? transaction.revenue_micros
    : transaction.revenueMicros;
}

function transactionCurrency(transaction: IapAppTransaction) {
  return transaction.currency ?? "VND";
}

function transactionPurchaseDate(transaction: IapAppTransaction) {
  return isIosTransaction(transaction)
    ? transaction.purchase_date
    : transaction.purchaseDate;
}

function transactionExpiresDate(transaction: IapAppTransaction) {
  return isIosTransaction(transaction)
    ? transaction.expires_date
    : transaction.expiresDate;
}

function transactionSource(transaction: IapAppTransaction) {
  return isIosTransaction(transaction)
    ? transaction.ingestion_source
    : (transaction.ingestionSource ?? null);
}

function transactionLastRtdnEventAt(transaction: IapAppTransaction) {
  return isAndroidTransaction(transaction)
    ? (transaction.lastRtdnEventAt ?? transaction.lastNotificationAt ?? null)
    : null;
}

function transactionRenewalStatus(transaction: IapAppTransaction) {
  if (isIosTransaction(transaction)) return transaction.renewal_status;
  if (transaction.autoRenewing === true) return "enabled";
  if (transaction.autoRenewing === false) return "disabled";
  return null;
}

function transactionRenewalDate(transaction: IapAppTransaction) {
  return isIosTransaction(transaction) ? transaction.renewal_date : null;
}

function transactionRenewalProductId(transaction: IapAppTransaction) {
  return isIosTransaction(transaction) ? transaction.renewal_product_id : null;
}

function renewalStatusMeta(status: "enabled" | "disabled" | null) {
  if (status === "enabled") {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      label: "Auto-renew on",
      title:
        "The store reports that this subscription is set to renew automatically.",
    };
  }

  if (status === "disabled") {
    return {
      className: "border-rose-200 bg-rose-50 text-rose-700",
      label: "Auto-renew off",
      title:
        "The customer turned off automatic renewal. Access may remain active until expiry.",
    };
  }

  return null;
}

function trialConversionStatusMeta(transaction: IapAppTransaction) {
  const paidTransactionId = isIosTransaction(transaction)
    ? transaction.paid_transaction_id
    : null;
  const paidTransactionSuffix = paidTransactionId
    ? ` Paid transaction: ${paidTransactionId}.`
    : "";
  const status = isIosTransaction(transaction)
    ? transaction.trial_conversion_status
    : (transaction.trialConversionStatus ??
      (transaction.state.toLowerCase() === "trial_converted"
        ? "converted_to_paid"
        : transactionIsFreeTrial(transaction)
          ? "trial_active"
          : transaction.hadFreeTrial === true &&
              ["account_hold", "canceled", "expired", "grace_period"].includes(
                transaction.state.toLowerCase(),
              )
            ? transaction.state.toLowerCase()
            : null));

  switch (status) {
    case "trial_active":
      return {
        className: "border-blue-200 bg-blue-50 text-blue-700",
        label: "Trial active",
        title: "The free trial has not expired yet.",
      };
    case "grace_period":
      return {
        className: "border-amber-200 bg-amber-50 text-amber-700",
        label: "Grace period",
        title:
          "The trial expired, but Apple still grants access during the billing grace period.",
      };
    case "billing_retry":
    case "account_hold":
      return {
        className: "border-amber-200 bg-amber-50 text-amber-700",
        label: status === "account_hold" ? "Account hold" : "Billing retry",
        title:
          "The trial expired and payment has not completed; no paid renewal is confirmed yet.",
      };
    case "converted_to_paid":
    case "trial_converted":
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        label: "Converted to paid",
        title: `A paid transaction was recorded after the free trial.${paidTransactionSuffix}`,
      };
    case "not_converted":
    case "canceled":
    case "expired":
      return {
        className: "border-rose-200 bg-rose-50 text-rose-700",
        label:
          status === "canceled"
            ? "Canceled"
            : status === "expired"
              ? "Expired"
              : "Not converted",
        title:
          "The free trial expired and no paid continuation transaction has been recorded.",
      };
    default:
      return null;
  }
}

type TwoHourBadgeMeta = {
  className: string;
  label: string;
  title: string;
};

type ProviderDeliveryMeta = {
  message: string | null;
  provider: "Adjust" | "Firebase";
  skipped: boolean;
  status: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function providerDeliveryMeta(
  rawContext: unknown,
  provider: "adjust" | "ga4",
): ProviderDeliveryMeta | null {
  const context = isRecord(rawContext) ? rawContext : {};
  const delivery = isRecord(context.delivery) ? context.delivery : {};
  const paidAdjustState =
    provider === "adjust" && isRecord(context.adjustPurchaseDelivery)
      ? context.adjustPurchaseDelivery
      : null;
  const deliveryState =
    paidAdjustState ??
    (isRecord(delivery[provider]) ? delivery[provider] : null);
  const legacyState = isRecord(context[provider]) ? context[provider] : null;
  const state = deliveryState ?? legacyState;
  if (!state) return null;

  const result = isRecord(state.result) ? state.result : state;
  const responseStatus = Number(result.responseStatus ?? result.status);
  const status =
    cleanText(state.status) ||
    (Number.isFinite(responseStatus) &&
    responseStatus >= 200 &&
    responseStatus < 300
      ? "delivered"
      : "");
  const message =
    cleanText(state.message) ||
    cleanText(state.reason) ||
    cleanText(result.responseBody) ||
    cleanText(result.error) ||
    null;

  return {
    message,
    provider: provider === "ga4" ? "Firebase" : "Adjust",
    skipped: Boolean(result.skipped) || status === "skipped",
    status: ["sent", "already_sent"].includes(status) ? "delivered" : status,
  };
}

function providerStatusBadge(meta: ProviderDeliveryMeta): TwoHourBadgeMeta {
  if (meta.skipped) {
    return {
      className: "border-slate-200 bg-slate-50 text-slate-600",
      label: "Skipped",
      title: meta.message ?? `${meta.provider} delivery was skipped.`,
    };
  }

  if (meta.status === "delivered") {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      label: "Sent",
      title: `${meta.provider} delivery completed.`,
    };
  }

  if (["queued", "pending", "published"].includes(meta.status)) {
    return {
      className: "border-blue-200 bg-blue-50 text-blue-700",
      label: "Queued",
      title: `${meta.provider} purchase delivery is waiting in RabbitMQ.`,
    };
  }

  if (meta.status === "processing") {
    return {
      className: "border-blue-200 bg-blue-50 text-blue-700",
      label: "Sending",
      title: `${meta.provider} purchase delivery is being processed by the worker.`,
    };
  }

  if (["retryable_error", "retrying"].includes(meta.status)) {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-700",
      label: "Retrying",
      title: meta.message ?? `${meta.provider} delivery will retry.`,
    };
  }

  return {
    className: "border-rose-200 bg-rose-50 text-rose-700",
    label: "Failed",
    title: meta.message ?? `${meta.provider} delivery failed.`,
  };
}

function twoHourMutedBadge(label: string, title: string): TwoHourBadgeMeta {
  return {
    className: "border-slate-200 bg-slate-50 text-slate-600",
    label,
    title,
  };
}

function twoHourCheckStatusBadge(
  check: IosIapTwoHourCheck | null,
  options?: { expectsCheck?: boolean },
): TwoHourBadgeMeta {
  if (!check) {
    if (!options?.expectsCheck) {
      return twoHourMutedBadge(
        "-",
        "2-hour checks only apply to iOS free-trial transactions.",
      );
    }

    return twoHourMutedBadge(
      "Not scheduled",
      "No ios_iap_two_hour_checks row exists for this transaction. Webhook-only records usually do not include app_instance_id or device identifiers, so Firebase/Adjust cannot be sent.",
    );
  }

  const status = check.status.toLowerCase();
  const ga4 = providerDeliveryMeta(check.raw_context, "ga4");
  const adjust = providerDeliveryMeta(check.raw_context, "adjust");
  const providerBadges = [
    ga4 ??
      (check.renewed === true && check.ga4_sent_at
        ? ({
            message: null,
            provider: "Firebase",
            skipped: false,
            status: "delivered",
          } satisfies ProviderDeliveryMeta)
        : null),
    adjust,
  ].filter((item): item is ProviderDeliveryMeta => Boolean(item));
  const failedProviders = providerBadges.filter(
    (item) =>
      item.status &&
      item.status !== "delivered" &&
      item.status !== "retryable_error" &&
      !item.skipped,
  );

  if (status === "sent") {
    if (check.renewed === null) {
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        label: "Checked",
        title: "2-hour check completed.",
      };
    }

    return {
      className: check.renewed
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-rose-200 bg-rose-50 text-rose-700",
      label: check.renewed ? "Passed" : "Auto-renew off",
      title: check.renewed
        ? "No cancellation signal was found after 2 hours. This is a prediction signal, not a paid renewal."
        : "Apple reported that auto-renew was disabled within the 2-hour observation window. Trial access remains valid until expiry.",
    };
  }

  if (status === "failed") {
    if (failedProviders.length >= 2) {
      return {
        className: "border-rose-200 bg-rose-50 text-rose-700",
        label: "Failed",
        title: check.last_error ?? "All 2-hour provider deliveries failed.",
      };
    }

    if (providerBadges.length) {
      return {
        className: "border-amber-200 bg-amber-50 text-amber-700",
        label: "Partial",
        title:
          check.last_error ??
          "2-hour check completed with a provider-specific issue.",
      };
    }

    return {
      className: "border-rose-200 bg-rose-50 text-rose-700",
      label: "Failed",
      title:
        check.last_error ?? "2-hour check failed before provider delivery.",
    };
  }

  if (status === "processing") {
    return {
      className: "border-blue-200 bg-blue-50 text-blue-700",
      label: "Checking",
      title: "2-hour check is processing.",
    };
  }

  if (status === "retrying") {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-700",
      label: "Retrying",
      title: check.last_error ?? "2-hour check will retry.",
    };
  }

  return {
    className: "border-slate-200 bg-slate-50 text-slate-600",
    label: "Pending",
    title: `The retention signal will be evaluated at ${formatDate(check.check_at)}.`,
  };
}

function providerFailureLikely(
  check: IosIapTwoHourCheck,
  provider: "adjust" | "ga4",
) {
  const message = `${check.last_error ?? ""} ${
    isRecord(check.raw_context) ? cleanText(check.raw_context.error) : ""
  }`.toLowerCase();
  return provider === "ga4"
    ? /ga4|firebase|measurement|api_secret|app_instance/.test(message)
    : /adjust|adid|idfa|idfv/.test(message);
}

function providerColumnStatusBadge(
  check: IosIapTwoHourCheck | null,
  provider: "adjust" | "ga4",
  options?: { expectsCheck?: boolean },
): TwoHourBadgeMeta {
  const providerLabel = provider === "ga4" ? "Firebase" : "Adjust";

  const delivery = outboundDeliveryForProvider(check?.deliveries, provider);
  if (delivery) return outboundDeliveryStatusBadge(delivery, providerLabel);

  if (!check) {
    if (!options?.expectsCheck) {
      return twoHourMutedBadge(
        "-",
        `${providerLabel} purchase delivery only applies to a verified charged transaction.`,
      );
    }

    return twoHourMutedBadge(
      "Not scheduled",
      `No purchase delivery record exists, so ${providerLabel} was not attempted.`,
    );
  }

  const meta = providerDeliveryMeta(check.raw_context, provider);
  if (meta) return providerStatusBadge(meta);

  if (provider === "ga4" && check.renewed === true && check.ga4_sent_at) {
    return providerStatusBadge({
      message: null,
      provider: "Firebase",
      skipped: false,
      status: "delivered",
    });
  }

  const status = check.status.toLowerCase();
  if (check.renewed === false) {
    return twoHourMutedBadge(
      "Not sent",
      `${providerLabel} was not sent because the 2-hour check found a cancellation signal.`,
    );
  }

  if (status === "pending") {
    return twoHourMutedBadge(
      "Pending",
      `${providerLabel} will be evaluated when the 2-hour check runs.`,
    );
  }

  if (status === "processing") {
    return {
      className: "border-blue-200 bg-blue-50 text-blue-700",
      label: "Checking",
      title: `${providerLabel} delivery is being evaluated.`,
    };
  }

  if (status === "retrying") {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-700",
      label: "Retrying",
      title: check.last_error ?? `${providerLabel} delivery will retry.`,
    };
  }

  if (status === "failed" && providerFailureLikely(check, provider)) {
    return {
      className: "border-rose-200 bg-rose-50 text-rose-700",
      label: "Failed",
      title: check.last_error ?? `${providerLabel} delivery failed.`,
    };
  }

  return twoHourMutedBadge(
    "No data",
    `${providerLabel} delivery status was not recorded for this check.`,
  );
}

function outboundDeliveryForProvider(
  deliveries: IapOutboundDeliveryDto[] | null | undefined,
  provider: "adjust" | "ga4",
) {
  return (deliveries ?? []).find((delivery) => {
    const destination = delivery.destination?.trim().toLowerCase() ?? "";
    return provider === "ga4"
      ? ["firebase", "ga4"].includes(destination)
      : destination === "adjust";
  });
}

function outboundDeliveryStatusBadge(
  delivery: IapOutboundDeliveryDto,
  providerLabel: "Firebase" | "Adjust",
): TwoHourBadgeMeta {
  const normalizedStatus = delivery.status.trim().toLowerCase();
  const attempts =
    delivery.deliveryAttempts ??
    delivery.publishAttempts ??
    delivery.attempts ??
    0;
  const message =
    delivery.lastError ?? delivery.error ?? delivery.skipReason ?? null;
  const completedAt = delivery.deliveredAt ?? delivery.sentAt ?? null;
  const status = [
    "already_sent",
    "completed",
    "delivered",
    "sent",
    "succeeded",
  ].includes(normalizedStatus)
    ? "delivered"
    : ["pending", "published", "queued"].includes(normalizedStatus)
      ? "pending"
      : normalizedStatus === "publishing"
        ? "processing"
        : normalizedStatus;
  const badge = providerStatusBadge({
    message,
    provider: providerLabel,
    skipped: status === "skipped",
    status,
  });

  return {
    ...badge,
    title: `${badge.title}${attempts > 0 ? ` Attempts: ${attempts}.` : ""}${delivery.responseStatus ? ` HTTP ${delivery.responseStatus}.` : ""}${completedAt ? ` Completed: ${formatDate(completedAt)}.` : ""}`,
  };
}

function androidProviderColumnStatusBadge(
  transaction: IapAndroidDto,
  provider: "adjust" | "ga4",
): TwoHourBadgeMeta {
  const providerLabel = provider === "ga4" ? "Firebase" : "Adjust";
  const delivery = outboundDeliveryForProvider(
    transaction.deliveries,
    provider,
  );

  if (!delivery) {
    return twoHourMutedBadge(
      "No record",
      `No ${providerLabel} outbound delivery job is attached to this transaction.`,
    );
  }

  return outboundDeliveryStatusBadge(delivery, providerLabel);
}

function canRetryTwoHourCheck(check: IosIapTwoHourCheck | null) {
  return Boolean(check && ["failed", "retrying"].includes(check.status));
}

function sourceMeta(source: string | null) {
  const normalized = source?.trim().toLowerCase() ?? "";

  if (normalized === "app_store_server_notification") {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      label: "Webhook",
      title: "Saved from App Store Server Notifications webhook",
    };
  }

  if (
    normalized === "verify_ios_edge_function" ||
    normalized === "app_store_server_api.get_transaction_info" ||
    normalized === "system_tracking_api"
  ) {
    return {
      className: "border-blue-200 bg-blue-50 text-blue-700",
      label: "Verify API",
      title: "Saved from verify-ios/API transaction verification",
    };
  }

  if (normalized) {
    return {
      className: "border-slate-200 bg-slate-50 text-slate-600",
      label: source,
      title: `Saved from ${source}`,
    };
  }

  return {
    className: "border-slate-200 bg-slate-50 text-slate-600",
    label: "Legacy source",
    title:
      "Saved before source tracking was added. This does not guarantee the mobile verify API provided app_instance_id or attribution identifiers.",
  };
}

function androidSourceMeta(source: string | null) {
  const normalized = source?.trim().toLowerCase() ?? "";

  if (normalized === "google_play_rtdn") {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      label: "RTDN",
      title: "Updated from a Google Play Real-time Developer Notification.",
    };
  }

  if (
    [
      "client",
      "mobile_verify",
      "verify_android",
      "system_tracking_api",
    ].includes(normalized)
  ) {
    return {
      className: "border-blue-200 bg-blue-50 text-blue-700",
      label: "Verify API",
      title: "Saved from Android purchase verification.",
    };
  }

  if (normalized === "reconciliation") {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-700",
      label: "Reconciled",
      title: "Updated by a Google Play reconciliation job.",
    };
  }

  if (normalized) {
    return {
      className: "border-slate-200 bg-slate-50 text-slate-600",
      label: source,
      title: `Saved from ${source}.`,
    };
  }

  return {
    className: "border-slate-200 bg-slate-50 text-slate-600",
    label: "Unknown",
    title:
      "This transaction was saved before Android ingestion source tracking was available.",
  };
}

function realtimeStatusMeta(
  status: "connected" | "disconnected" | "error" | "unauthorized",
) {
  if (status === "connected") {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      label: "Auto refresh",
    };
  }

  if (status === "unauthorized") {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-700",
      label: "Live auth",
    };
  }

  if (status === "error") {
    return {
      className: "border-rose-200 bg-rose-50 text-rose-700",
      label: "Live error",
    };
  }

  return {
    className: "border-slate-200 bg-slate-50 text-slate-600",
    label: "Live off",
  };
}

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function decodeBase64UrlJson(value: string): unknown {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);

  return JSON.parse(json) as unknown;
}

function decodeJws(jws: string) {
  const [header, payload] = jws.split(".");
  if (!header || !payload) return null;

  try {
    return {
      header: decodeBase64UrlJson(header),
      payload: decodeBase64UrlJson(payload),
    };
  } catch {
    return null;
  }
}

function signedTransactionInfoFromReceipt(receipt: unknown) {
  if (!isJsonRecord(receipt)) return null;

  const direct = receipt.signedTransactionInfo;
  if (typeof direct === "string") return direct;

  const transactionInfoResponse = receipt.transactionInfoResponse;
  if (isJsonRecord(transactionInfoResponse)) {
    const nested = transactionInfoResponse.signedTransactionInfo;
    if (typeof nested === "string") return nested;
  }

  return null;
}

function receiptDisplayPayload(receipt: unknown) {
  if (!isJsonRecord(receipt)) return receipt;

  const existingDecoded =
    isJsonRecord(receipt.decodedTransactionInfo) ||
    Array.isArray(receipt.decodedTransactionInfo)
      ? receipt.decodedTransactionInfo
      : null;
  const decodedRenewalInfo =
    isJsonRecord(receipt.decodedRenewalInfo) ||
    Array.isArray(receipt.decodedRenewalInfo)
      ? receipt.decodedRenewalInfo
      : null;
  const signedTransactionInfo = signedTransactionInfoFromReceipt(receipt);
  const decoded = signedTransactionInfo
    ? decodeJws(signedTransactionInfo)
    : null;
  const decodedTransactionInfo = existingDecoded ?? decoded?.payload ?? null;

  if (!decodedTransactionInfo && !decodedRenewalInfo) return receipt;

  return {
    receiptType: "app_store_server_api_transaction",
    decodedTransactionInfo,
    decodedRenewalInfo,
    jwsHeader: decoded?.header ?? receipt.jwsHeader ?? null,
    notificationType: receipt.notificationType ?? null,
    source: receipt.source ?? "app_store_server_api.get_transaction_info",
    subtype: receipt.subtype ?? null,
  };
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = "bg-muted border-border text-muted-foreground";
  if (
    s.includes("active") ||
    s.includes("converted") ||
    s.includes("purchased")
  )
    cls =
      "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-200 dark:text-emerald-400";
  else if (
    s.includes("expired") ||
    s.includes("canceled") ||
    s.includes("refund") ||
    s.includes("revoke")
  )
    cls =
      "bg-destructive/10 border-destructive/30 text-destructive dark:bg-destructive/50 dark:text-foreground";
  else if (
    s.includes("grace") ||
    s.includes("hold") ||
    s.includes("paused") ||
    s.includes("pending")
  )
    cls =
      "bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-200 dark:text-orange-400";
  return (
    <span
      className={`inline-flex items-center border font-semibold rounded-full px-2 py-[4px] text-[11px] leading-none ${cls}`}
    >
      {status}
    </span>
  );
}

/* ── Overview Card (matches shadcnblocks dashboard-11) ─────────── */
function OverviewCard({
  title,
  value,
  trendPct,
  trendText,
  trendDir,
}: {
  title: string;
  value: string;
  trendPct: string;
  trendText: string;
  trendDir: "up" | "down" | "flat";
}) {
  return (
    <div className="bg-card text-card-foreground rounded-lg border h-full w-full">
      {/* Header */}
      <div className="flex flex-row items-center justify-between space-y-0 p-4">
        <div className="tracking-tight flex items-center gap-2 text-sm font-medium">
          <span>{title}</span>
        </div>
        <div className="h-2 w-2 rounded-full bg-primary/70" />
      </div>
      {/* Content */}
      <div className="space-y-[10px] px-4 pt-0 pb-4">
        <p className="text-2xl font-bold">{value}</p>
        <div className="flex flex-wrap items-center gap-2">
          {trendDir === "up" && (
            <div className="flex items-center gap-1 text-emerald-400">
              <ArrowUpRight size={16} />
              <p className="text-xs font-semibold">{trendPct}</p>
            </div>
          )}
          {trendDir === "down" && (
            <div className="flex items-center gap-1 text-red-400">
              <ArrowDownRight size={16} />
              <p className="text-xs font-semibold">{trendPct}</p>
            </div>
          )}
          {trendDir === "flat" && (
            <p className="text-xs font-semibold text-muted-foreground">
              {trendPct}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{trendText}</p>
        </div>
      </div>
    </div>
  );
}

function IapMetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="grid grid-cols-2 gap-4 lg:col-span-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`iap-overview-skeleton-${index}`}
            className="col-span-2 h-[150px] rounded-lg border bg-card p-5 sm:col-span-1"
          >
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-8 h-8 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-4 w-36 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-[320px] rounded-lg border bg-card p-5 lg:col-span-7">
        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-[240px] animate-pulse rounded bg-muted/60" />
      </div>
    </div>
  );
}

function displayDateRangeValue(from: string, to: string) {
  const fromLabel = displayDateValue(from);
  const toLabel = displayDateValue(to);

  if (from && to) return `${fromLabel} - ${toLabel}`;
  if (from) return `From ${fromLabel}`;
  if (to) return `To ${toLabel}`;
  return "Purchase date";
}

function dateOnlyTime(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function TransactionPurchaseDateRangePicker({
  onChange,
  valueFrom,
  valueTo,
}: {
  onChange: (value: { from: string; to: string }) => void;
  valueFrom: string;
  valueTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();

  function resetDraftRange() {
    setDraftRange(
      valueFrom || valueTo
        ? {
            from: dateFromInputValue(valueFrom) ?? undefined,
            to: dateFromInputValue(valueTo) ?? undefined,
          }
        : undefined,
    );
  }

  function applyRange(from: Date, to: Date) {
    onChange({
      from: dateInputValue(from),
      to: dateInputValue(to),
    });
    setOpen(false);
  }

  function handleDayClick(day: Date) {
    if (!draftRange?.from || draftRange.to) {
      setDraftRange({ from: day, to: undefined });
      return;
    }

    if (dateOnlyTime(day) < dateOnlyTime(draftRange.from)) {
      setDraftRange({ from: day, to: undefined });
      return;
    }

    setDraftRange({ from: draftRange.from, to: day });
    applyRange(draftRange.from, day);
  }

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) resetDraftRange();
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full justify-start gap-2 bg-background px-3 font-normal sm:w-[270px]"
          >
            <Calendar size={14} />
            <span className="truncate">
              {displayDateRangeValue(valueFrom, valueTo)}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <CalendarPicker
            mode="range"
            numberOfMonths={2}
            selected={draftRange}
            onDayClick={handleDayClick}
            className="rounded-lg border"
            captionLayout="dropdown"
          />
        </PopoverContent>
      </Popover>
      {valueFrom || valueTo ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 bg-background"
          onClick={() => onChange({ from: "", to: "" })}
          title="Clear purchase date range"
        >
          <X size={14} />
        </Button>
      ) : null}
    </div>
  );
}

export function IapAppDetailPage({ data }: { data: IapAppDetailPageData }) {
  const { app } = data;
  const isIos = app.platform === "ios";
  const normalizedAppId =
    app.appId
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") ?? "";
  const isTestApp = isIos
    ? normalizedAppId === "li000"
    : normalizedAppId === "la000";

  const [metrics, setMetrics] = useState(data.metrics);
  const [transactions, setTransactions] = useState(data.transactions);
  const [providerChecks, setProviderChecks] = useState(
    data.twoHourChecks ?? [],
  );
  const [transactionPagination, setTransactionPagination] = useState(
    data.transactionPagination,
  );
  const [transactionStates, setTransactionStates] = useState(
    data.transactionStates,
  );
  const [metricsLoaded, setMetricsLoaded] = useState(
    data.metricsLoaded ?? true,
  );
  const [trialAnalytics, setTrialAnalytics] = useState(data.trialAnalytics);
  const [trialAnalyticsLoading, setTrialAnalyticsLoading] = useState(
    isIos && !data.trialAnalytics,
  );
  const [trialAnalyticsRefreshing, setTrialAnalyticsRefreshing] =
    useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connected" | "disconnected" | "error" | "unauthorized"
  >("disconnected");
  const [realtimeRefreshing, setRealtimeRefreshing] = useState(false);
  const [filterEnvironment, setFilterEnvironment] = useState<string>(
    data.filters.environment,
  );
  const [filterAdjustStatus, setFilterAdjustStatus] = useState<string>(
    data.filters.adjustStatus,
  );
  const [filterConversionStatus, setFilterConversionStatus] = useState<string>(
    data.filters.conversionStatus,
  );
  const [filterFirebaseStatus, setFilterFirebaseStatus] = useState<string>(
    data.filters.firebaseStatus,
  );
  const [filterState, setFilterState] = useState<string>(data.filters.state);
  const [filterKind, setFilterKind] = useState<string>(data.filters.kind);
  const [filterTwoHourStatus, setFilterTwoHourStatus] = useState<string>(
    data.filters.twoHourStatus,
  );
  const [filterTrial, setFilterTrial] = useState<string>(data.filters.trial);
  const [filterPurchaseDateFrom, setFilterPurchaseDateFrom] = useState<string>(
    data.filters.purchaseDateFrom,
  );
  const [filterPurchaseDateTo, setFilterPurchaseDateTo] = useState<string>(
    data.filters.purchaseDateTo,
  );
  const [revenueGranularity, setRevenueGranularity] =
    useState<IapRevenueGranularity>(data.filters.revenueGranularity);
  const [revenueSort, setRevenueSort] = useState<string>(
    data.filters.revenueSort,
  );
  const [revenueGranularityLoading, setRevenueGranularityLoading] =
    useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState<number | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<unknown | null>(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [selectedAppPayload, setSelectedAppPayload] = useState<unknown | null>(
    null,
  );
  const [appPayloadLoadingId, setAppPayloadLoadingId] = useState<string | null>(
    null,
  );
  const [selectedSandboxIds, setSelectedSandboxIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sandboxDeleteMode, setSandboxDeleteMode] = useState<
    "all" | "selected" | null
  >(null);
  const [sandboxDeleting, setSandboxDeleting] = useState(false);
  const latestViewRef = useRef({
    filterAdjustStatus: data.filters.adjustStatus,
    filterConversionStatus: data.filters.conversionStatus,
    filterEnvironment: data.filters.environment,
    filterFirebaseStatus: data.filters.firebaseStatus,
    filterKind: data.filters.kind,
    filterPurchaseDateFrom: data.filters.purchaseDateFrom,
    filterPurchaseDateTo: data.filters.purchaseDateTo,
    filterState: data.filters.state,
    filterTwoHourStatus: data.filters.twoHourStatus,
    filterTrial: data.filters.trial,
    page: data.transactionPagination.page,
    revenueGranularity: data.filters.revenueGranularity,
    revenueSort: data.filters.revenueSort,
  });
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const realtimeRefreshInFlightRef = useRef(false);
  const realtimeRefreshQueuedRef = useRef(false);

  async function loadTransactionsPage(
    page: number,
    overrides?: {
      filterAdjustStatus?: string;
      filterConversionStatus?: string;
      filterEnvironment?: string;
      filterFirebaseStatus?: string;
      filterKind?: string;
      filterPurchaseDateFrom?: string;
      filterPurchaseDateTo?: string;
      filterState?: string;
      filterTwoHourStatus?: string;
      filterTrial?: string;
      revenueGranularity?: IapRevenueGranularity;
      revenueSort?: string;
    },
    options?: {
      silent?: boolean;
    },
  ) {
    const nextFilterAdjustStatus =
      overrides?.filterAdjustStatus ?? filterAdjustStatus;
    const nextFilterConversionStatus =
      overrides?.filterConversionStatus ?? filterConversionStatus;
    const nextFilterEnvironment =
      overrides?.filterEnvironment ?? filterEnvironment;
    const nextFilterFirebaseStatus =
      overrides?.filterFirebaseStatus ?? filterFirebaseStatus;
    const nextFilterState = overrides?.filterState ?? filterState;
    const nextFilterKind = overrides?.filterKind ?? filterKind;
    const nextFilterTwoHourStatus =
      overrides?.filterTwoHourStatus ?? filterTwoHourStatus;
    const nextFilterTrial = overrides?.filterTrial ?? filterTrial;
    const nextFilterPurchaseDateFrom =
      overrides?.filterPurchaseDateFrom ?? filterPurchaseDateFrom;
    const nextFilterPurchaseDateTo =
      overrides?.filterPurchaseDateTo ?? filterPurchaseDateTo;
    const nextRevenueGranularity =
      overrides?.revenueGranularity ?? revenueGranularity;
    const nextRevenueSort = overrides?.revenueSort ?? revenueSort;
    const params = new URLSearchParams({
      context: overrides ? "true" : "false",
      mappingId: app.mappingId,
      page: String(page),
      pageSize: "10",
      platform: app.platform,
    });

    if (isTestApp) {
      params.set("environment", nextFilterEnvironment);
    }
    if (nextFilterState !== "all") params.set("state", nextFilterState);
    if (!isIos && nextFilterKind !== "all") params.set("kind", nextFilterKind);
    if (nextFilterTrial !== "all") {
      params.set("trial", nextFilterTrial);
    }
    if (isIos && nextFilterConversionStatus !== "all") {
      params.set("conversionStatus", nextFilterConversionStatus);
    }
    if (isIos && nextFilterTwoHourStatus !== "all") {
      params.set("twoHourStatus", nextFilterTwoHourStatus);
    }
    if (isIos && nextFilterFirebaseStatus !== "all") {
      params.set("firebaseStatus", nextFilterFirebaseStatus);
    }
    if (isIos && nextFilterAdjustStatus !== "all") {
      params.set("adjustStatus", nextFilterAdjustStatus);
    }
    if (nextFilterPurchaseDateFrom) {
      params.set("purchaseDateFrom", nextFilterPurchaseDateFrom);
    }
    if (nextFilterPurchaseDateTo) {
      params.set("purchaseDateTo", nextFilterPurchaseDateTo);
    }
    if (nextRevenueGranularity) {
      params.set("revenueGranularity", nextRevenueGranularity);
    }
    if (nextRevenueSort === "asc" || nextRevenueSort === "desc") {
      params.set("revenueSort", nextRevenueSort);
    }
    if (!overrides) {
      params.set("knownTotal", String(transactionPagination.total));
    }

    if (!options?.silent) {
      setTableLoading(true);
      setLoadingPage(page);
    }

    try {
      const response = await fetch(
        `/api/admin/iap/app-transactions?${params.toString()}`,
      );
      const payload = (await response.json()) as IapTransactionListResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Load IAP transactions failed.");
      }

      const nextTransactions = payload.data;
      setTransactions(nextTransactions);
      setSelectedSandboxIds((current) => {
        const available = new Set(
          nextTransactions
            .filter((transaction) => transactionIsTest(transaction))
            .map((transaction) => transaction.id),
        );
        return new Set(Array.from(current).filter((id) => available.has(id)));
      });
      setProviderChecks(payload.twoHourChecks ?? []);
      setTransactionPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 10,
        total: payload.total ?? nextTransactions.length,
        totalPages: payload.totalPages ?? 1,
      });
      if (payload.metrics) {
        setMetrics(payload.metrics);
        setMetricsLoaded(true);
      }
      if (payload.transactionStates) {
        setTransactionStates(payload.transactionStates);
      }
    } catch (error) {
      if (options?.silent) {
        console.error("Realtime IAP transaction refresh failed", error);
      } else {
        void showToast(
          "error",
          error instanceof Error
            ? error.message
            : "Load IAP transactions failed.",
        );
      }
    } finally {
      if (!options?.silent) {
        setTableLoading(false);
        setLoadingPage(null);
      }
    }
  }

  async function loadRevenueGranularity(
    nextGranularity: IapRevenueGranularity,
  ) {
    const previousGranularity = revenueGranularity;
    const params = new URLSearchParams({
      mappingId: app.mappingId,
      platform: app.platform,
      revenueGranularity: nextGranularity,
    });

    if (isTestApp) {
      params.set("environment", filterEnvironment);
    }
    if (filterState !== "all") params.set("state", filterState);
    if (!isIos && filterKind !== "all") params.set("kind", filterKind);
    if (filterTrial !== "all") {
      params.set("trial", filterTrial);
    }

    setRevenueGranularity(nextGranularity);
    setRevenueGranularityLoading(true);

    try {
      const response = await fetch(
        `/api/admin/iap/app-context?${params.toString()}`,
      );
      const payload = (await response.json()) as IapAppContextResponse;

      if (!response.ok || !payload.success || !payload.metrics) {
        throw new Error(payload.error ?? "Load IAP metrics failed.");
      }

      setMetrics(payload.metrics);
      setMetricsLoaded(true);
      setTransactionStates(payload.transactionStates ?? []);
    } catch (error) {
      setRevenueGranularity(previousGranularity);
      void showToast(
        "error",
        error instanceof Error ? error.message : "Load IAP metrics failed.",
      );
    } finally {
      setRevenueGranularityLoading(false);
    }
  }

  useEffect(() => {
    if (metricsLoaded) return;

    let cancelled = false;
    const params = new URLSearchParams({
      mappingId: app.mappingId,
      platform: app.platform,
    });

    if (isTestApp) {
      params.set("environment", filterEnvironment);
    }
    if (filterState !== "all") params.set("state", filterState);
    if (!isIos && filterKind !== "all") params.set("kind", filterKind);
    if (filterTrial !== "all") {
      params.set("trial", filterTrial);
    }
    params.set("revenueGranularity", revenueGranularity);

    async function loadIapContext() {
      try {
        const response = await fetch(
          `/api/admin/iap/app-context?${params.toString()}`,
        );
        const payload = (await response.json()) as IapAppContextResponse;

        if (!response.ok || !payload.success || !payload.metrics) {
          throw new Error(payload.error ?? "Load IAP metrics failed.");
        }

        if (!cancelled) {
          setMetrics(payload.metrics);
          setTransactionStates(payload.transactionStates ?? []);
          setMetricsLoaded(true);
        }
      } catch (error) {
        if (!cancelled) {
          setMetricsLoaded(true);
          void showToast(
            "error",
            error instanceof Error ? error.message : "Load IAP metrics failed.",
          );
        }
      }
    }

    void loadIapContext();

    return () => {
      cancelled = true;
    };
  }, [
    app.mappingId,
    app.platform,
    filterEnvironment,
    filterKind,
    filterState,
    filterTrial,
    isIos,
    isTestApp,
    metricsLoaded,
    revenueGranularity,
  ]);

  useEffect(() => {
    if (!isIos || trialAnalytics) return;

    let cancelled = false;
    const params = new URLSearchParams({
      mappingId: app.mappingId,
      platform: app.platform,
    });

    async function loadTrialAnalytics() {
      setTrialAnalyticsLoading(true);

      try {
        const response = await fetch(
          `/api/admin/iap/trial-analytics?${params.toString()}`,
        );
        const payload = (await response.json()) as IapTrialAnalyticsResponse;

        if (!response.ok || !payload.success) {
          throw new Error(payload.error ?? "Load trial analytics failed.");
        }

        if (!cancelled) {
          setTrialAnalytics(payload.trialAnalytics ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          void showToast(
            "error",
            error instanceof Error
              ? error.message
              : "Load trial analytics failed.",
          );
        }
      } finally {
        if (!cancelled) {
          setTrialAnalyticsLoading(false);
        }
      }
    }

    void loadTrialAnalytics();

    return () => {
      cancelled = true;
    };
  }, [app.mappingId, app.platform, isIos, trialAnalytics]);

  async function refreshTrialAnalytics(options?: { silent?: boolean }) {
    if (!isIos || trialAnalyticsRefreshing) return;

    const params = new URLSearchParams({
      mappingId: app.mappingId,
      platform: app.platform,
    });

    setTrialAnalyticsRefreshing(true);

    try {
      const response = await fetch(
        `/api/admin/iap/trial-analytics?${params.toString()}`,
      );
      const payload = (await response.json()) as IapTrialAnalyticsResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Refresh notification events failed.");
      }

      setTrialAnalytics(payload.trialAnalytics ?? null);
      if (!options?.silent) {
        void showToast("success", "Notification events refreshed.");
      }
    } catch (error) {
      if (!options?.silent) {
        void showToast(
          "error",
          error instanceof Error
            ? error.message
            : "Refresh notification events failed.",
        );
      }
    } finally {
      setTrialAnalyticsRefreshing(false);
    }
  }

  async function inspectTransactionReceipt(transaction: IapAppTransaction) {
    setReceiptLoadingId(transaction.id);

    try {
      const params = new URLSearchParams({
        id: transaction.id,
        platform: app.platform,
      });
      const response = await fetch(
        `/api/admin/iap/transaction-receipt?${params.toString()}`,
      );
      const payload = (await response.json()) as IapTransactionReceiptResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Load IAP receipt failed.");
      }

      setSelectedReceipt(receiptDisplayPayload(payload.rawReceipt ?? null));
    } catch (error) {
      void showToast(
        "error",
        error instanceof Error ? error.message : "Load IAP receipt failed.",
      );
    } finally {
      setReceiptLoadingId(null);
    }
  }

  async function inspectAppPayload(transaction: IapAppTransaction) {
    setAppPayloadLoadingId(transaction.id);

    try {
      const params = new URLSearchParams({
        id: transaction.id,
        platform: app.platform,
      });
      const response = await fetch(
        `/api/admin/iap/transaction-receipt?${params.toString()}`,
      );
      const payload = (await response.json()) as IapTransactionReceiptResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Load app payload failed.");
      }
      if (payload.appPayload === undefined || payload.appPayload === null) {
        throw new Error("App payload is unavailable for this transaction.");
      }

      setSelectedAppPayload(payload.appPayload);
    } catch (error) {
      void showToast(
        "error",
        error instanceof Error ? error.message : "Load app payload failed.",
      );
    } finally {
      setAppPayloadLoadingId(null);
    }
  }

  async function deleteSandboxTransactions() {
    if (!sandboxDeleteMode || sandboxDeleting) return;

    const all = sandboxDeleteMode === "all";
    const transactionIds = all ? [] : Array.from(selectedSandboxIds);
    if (!all && !transactionIds.length) return;

    setSandboxDeleting(true);
    try {
      const response = await fetch("/api/admin/iap/sandbox-transactions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          all,
          mappingId: app.mappingId,
          platform: app.platform,
          transactionIds,
        }),
      });
      const payload = (await response.json()) as IapSandboxDeleteResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Delete sandbox transactions failed.");
      }

      setSelectedSandboxIds(new Set());
      setSandboxDeleteMode(null);
      await loadTransactionsPage(1);
      void showToast(
        "success",
        `Deleted ${payload.deletedTransactions ?? 0} sandbox transaction(s).`,
      );
    } catch (error) {
      void showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Delete sandbox transactions failed.",
      );
    } finally {
      setSandboxDeleting(false);
    }
  }

  useEffect(() => {
    latestViewRef.current = {
      filterAdjustStatus,
      filterConversionStatus,
      filterEnvironment,
      filterFirebaseStatus,
      filterKind,
      filterPurchaseDateFrom,
      filterPurchaseDateTo,
      filterState,
      filterTwoHourStatus,
      filterTrial,
      page: transactionPagination.page,
      revenueGranularity,
      revenueSort,
    };
  }, [
    filterAdjustStatus,
    filterConversionStatus,
    filterEnvironment,
    filterFirebaseStatus,
    filterKind,
    filterPurchaseDateFrom,
    filterPurchaseDateTo,
    filterState,
    filterTwoHourStatus,
    filterTrial,
    revenueGranularity,
    revenueSort,
    transactionPagination.page,
  ]);

  async function refreshIapDetailFromRealtime() {
    if (realtimeRefreshInFlightRef.current) {
      realtimeRefreshQueuedRef.current = true;
      return;
    }

    realtimeRefreshInFlightRef.current = true;
    setRealtimeRefreshing(true);

    try {
      const latest = latestViewRef.current;

      await Promise.all([
        loadTransactionsPage(
          latest.page,
          {
            filterEnvironment: latest.filterEnvironment,
            filterAdjustStatus: latest.filterAdjustStatus,
            filterConversionStatus: latest.filterConversionStatus,
            filterFirebaseStatus: latest.filterFirebaseStatus,
            filterKind: latest.filterKind,
            filterPurchaseDateFrom: latest.filterPurchaseDateFrom,
            filterPurchaseDateTo: latest.filterPurchaseDateTo,
            filterState: latest.filterState,
            filterTwoHourStatus: latest.filterTwoHourStatus,
            filterTrial: latest.filterTrial,
            revenueGranularity: latest.revenueGranularity,
            revenueSort: latest.revenueSort,
          },
          { silent: true },
        ),
        isIos ? refreshTrialAnalytics({ silent: true }) : Promise.resolve(),
      ]);
    } catch (error) {
      console.error("Realtime IAP detail refresh failed", error);
      setRealtimeStatus("error");
    } finally {
      realtimeRefreshInFlightRef.current = false;
      setRealtimeRefreshing(false);

      if (realtimeRefreshQueuedRef.current) {
        realtimeRefreshQueuedRef.current = false;
        scheduleIapDetailRealtimeRefresh();
      }
    }
  }

  function scheduleIapDetailRealtimeRefresh() {
    if (realtimeRefreshTimerRef.current) {
      clearTimeout(realtimeRefreshTimerRef.current);
    }

    realtimeRefreshTimerRef.current = setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      void refreshIapDetailFromRealtime();
    }, IAP_REALTIME_REFRESH_DELAY_MS);
  }

  const realtimeRefreshHandlerRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    realtimeRefreshHandlerRef.current = scheduleIapDetailRealtimeRefresh;
  });

  useEffect(() => {
    if (!app.identifier) return;

    const connectTimer = window.setTimeout(() => {
      setRealtimeStatus("connected");
    }, 0);
    const poll = setInterval(() => {
      realtimeRefreshHandlerRef.current();
    }, 15_000);

    return () => {
      window.clearTimeout(connectTimer);
      clearInterval(poll);
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
    };
  }, [app.identifier, app.platform]);

  const stats = useMemo(() => {
    const rev = metrics.totalRevenue;
    const active = metrics.activeCount;
    const canceled = metrics.canceledCount;
    const total = metrics.totalCount;
    const revL7 = metrics.last7Revenue;
    const revP7 = metrics.previous7Revenue;
    const ordL7 = metrics.last7Orders;
    const ordP7 = metrics.previous7Orders;
    const sg =
      revP7 > 0 ? ((revL7 - revP7) / revP7) * 100 : revL7 > 0 ? 100 : 0;
    const og =
      ordP7 > 0 ? ((ordL7 - ordP7) / ordP7) * 100 : ordL7 > 0 ? 100 : 0;
    return {
      rev,
      active,
      canceled,
      total,
      sg,
      ogDir: og >= 0 ? ("up" as const) : ("down" as const),
      sgDir: sg >= 0 ? ("up" as const) : ("down" as const),
      revL7,
      revP7,
      ordL7,
      ordP7,
      og,
      latestTimestamp: metrics.latestTimestamp,
    };
  }, [metrics]);

  const uniqueStates = useMemo(() => {
    return Array.from(
      new Set(transactionStates.map((state) => state.toLowerCase())),
    ).sort();
  }, [transactionStates]);

  const currentPage = transactionPagination.page;
  const tableStartIndex =
    (transactionPagination.page - 1) * transactionPagination.pageSize;
  const visible = transactions;
  const sandboxRows = visible.filter((transaction) =>
    transactionIsTest(transaction),
  );
  const sandboxEnvironment = isIos ? "sandbox" : "test";
  const showSandboxDeleteControls =
    isTestApp && filterEnvironment === sandboxEnvironment;
  const allVisibleSandboxSelected =
    sandboxRows.length > 0 &&
    sandboxRows.every((transaction) => selectedSandboxIds.has(transaction.id));
  const providerCheckByTransactionId = useMemo(
    () =>
      new Map(
        providerChecks.map((check) => [check.transaction_id, check] as const),
      ),
    [providerChecks],
  );
  const nextRevenueSort = revenueSort === "asc" ? "desc" : "asc";
  const revenueSortLabel =
    revenueSort === "asc"
      ? "Revenue ascending"
      : revenueSort === "desc"
        ? "Revenue descending"
        : "Sort revenue";
  const realtimeMeta = realtimeStatusMeta(realtimeStatus);

  const fmtVND = (n: number) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
  const hasCustomPurchaseDate = Boolean(
    filterPurchaseDateFrom || filterPurchaseDateTo,
  );
  const hasActiveTransactionFilters =
    hasCustomPurchaseDate ||
    filterState !== "all" ||
    (isTestApp && filterEnvironment !== "production") ||
    (!isIos && filterKind !== "all") ||
    filterTrial !== "all" ||
    (isIos &&
      (filterConversionStatus !== "all" ||
        filterTwoHourStatus !== "all" ||
        filterFirebaseStatus !== "all" ||
        filterAdjustStatus !== "all"));

  function resetTransactionFilters() {
    setFilterEnvironment("production");
    setFilterKind("all");
    setFilterConversionStatus("all");
    setFilterTrial("all");
    setFilterState("all");
    setFilterTwoHourStatus("all");
    setFilterFirebaseStatus("all");
    setFilterAdjustStatus("all");
    setFilterPurchaseDateFrom("");
    setFilterPurchaseDateTo("");
    void loadTransactionsPage(1, {
      filterAdjustStatus: "all",
      filterConversionStatus: "all",
      filterEnvironment: "production",
      filterFirebaseStatus: "all",
      filterKind: "all",
      filterPurchaseDateFrom: "",
      filterPurchaseDateTo: "",
      filterState: "all",
      filterTwoHourStatus: "all",
      filterTrial: "all",
    });
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      <IapAppContextHeader activeTab="transactions" app={app} />

      {/* Overview Grid: Left = 4 cards (2×2), Right = Revenue Chart */}
      {metricsLoaded ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 shrink-0">
          {/* Left: 4 Overview Cards in 2×2 sub-grid */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <OverviewCard
                title="Total Sales"
                value={fmtVND(stats.rev)}
                trendPct={`${Math.abs(stats.sg).toFixed(1)}%`}
                trendText={`${stats.sgDir === "up" ? "+" : "-"}${fmtVND(Math.abs(stats.revL7 - stats.revP7))} this week`}
                trendDir={stats.sgDir}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <OverviewCard
                title="Total Orders"
                value={fmtNum(stats.total - stats.canceled)}
                trendPct={`${Math.abs(stats.og).toFixed(1)}%`}
                trendText={`${stats.ogDir === "up" ? "+" : "-"}${Math.abs(stats.ordL7 - stats.ordP7)} orders this week`}
                trendDir={stats.ogDir}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <OverviewCard
                title="Active Subs"
                value={fmtNum(stats.active)}
                trendPct={`${stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(0) : 0}%`}
                trendText="of total transactions"
                trendDir="flat"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <OverviewCard
                title="Refunded"
                value={fmtNum(stats.canceled)}
                trendPct={`${stats.total > 0 ? ((stats.canceled / stats.total) * 100).toFixed(0) : 0}%`}
                trendText="churned transactions"
                trendDir={stats.canceled > 0 ? "down" : "flat"}
              />
            </div>
          </div>

          <IapRevenueChart
            buckets={metrics.revenueBuckets}
            granularity={revenueGranularity}
            loading={revenueGranularityLoading}
            onGranularityChange={(granularity) =>
              void loadRevenueGranularity(granularity)
            }
          />
        </div>
      ) : (
        <IapMetricsSkeleton />
      )}

      {isIos && trialAnalytics ? (
        <IosTrialAnalyticsPanel
          analytics={trialAnalytics}
          onInspectPayload={setSelectedReceipt}
          onRefresh={refreshTrialAnalytics}
          refreshing={trialAnalyticsRefreshing}
        />
      ) : isIos && trialAnalyticsLoading ? (
        <div className="h-[360px] overflow-hidden rounded-lg border bg-card">
          <div className="h-full animate-pulse bg-muted/30" />
        </div>
      ) : null}

      {!isIos && data.androidRtdnHistory ? (
        <AndroidRtdnHistoryPanel
          initialHistory={data.androidRtdnHistory}
          mappingId={app.mappingId}
          onInspectPayload={setSelectedReceipt}
        />
      ) : null}

      {/* Table Card */}
      <div className="flex-1 min-h-0 flex flex-col bg-card text-card-foreground border rounded-lg overflow-hidden">
        <div className="flex flex-col items-stretch justify-between gap-4 border-b bg-muted/20 p-4 sm:flex-row sm:items-center">
          <div className="flex min-h-9 items-center gap-2">
            <Badge
              variant="outline"
              className={`gap-1.5 px-2 py-0.5 text-[11px] font-medium transition-[transform,box-shadow] duration-300 ease-out ${realtimeRefreshing ? "scale-[1.02] shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" : "scale-100"} ${realtimeMeta.className}`}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full bg-current transition-opacity duration-300 ${realtimeRefreshing ? "opacity-70 motion-safe:animate-ping" : "opacity-0"}`}
                />
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full bg-current transition-all duration-300 ${realtimeRefreshing ? "scale-100 opacity-100" : "scale-75 opacity-60"}`}
                />
              </span>
              {realtimeMeta.label}
            </Badge>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {showSandboxDeleteControls ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 border-destructive/40 bg-background text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={!selectedSandboxIds.size || sandboxDeleting}
                  onClick={() => setSandboxDeleteMode("selected")}
                >
                  <Trash2 size={13} />
                  Delete selected ({selectedSandboxIds.size})
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-9 gap-1.5"
                  disabled={!transactionPagination.total || sandboxDeleting}
                  onClick={() => setSandboxDeleteMode("all")}
                >
                  <Trash2 size={13} />
                  Delete all sandbox
                </Button>
              </>
            ) : null}
            <TransactionPurchaseDateRangePicker
              valueFrom={filterPurchaseDateFrom}
              valueTo={filterPurchaseDateTo}
              onChange={(value) => {
                setFilterPurchaseDateFrom(value.from);
                setFilterPurchaseDateTo(value.to);
                void loadTransactionsPage(1, {
                  filterPurchaseDateFrom: value.from,
                  filterPurchaseDateTo: value.to,
                });
              }}
            />
            {isTestApp && (
              <Select
                value={filterEnvironment}
                onValueChange={(v) => {
                  setFilterEnvironment(v);
                  void loadTransactionsPage(1, { filterEnvironment: v });
                }}
              >
                <SelectTrigger className="h-9 w-full bg-background sm:w-[145px]">
                  <SelectValue placeholder="Environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Env</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value={isIos ? "sandbox" : "test"}>
                    {isIos ? "Sandbox" : "Test"}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
            {!isIos && (
              <Select
                value={filterKind}
                onValueChange={(v) => {
                  setFilterKind(v);
                  void loadTransactionsPage(1, { filterKind: v });
                }}
              >
                <SelectTrigger className="w-full sm:w-[130px] h-9 bg-background">
                  <SelectValue placeholder="Kind" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Kinds</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="product">In-App</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select
              value={filterTrial}
              onValueChange={(v) => {
                setFilterTrial(v);
                void loadTransactionsPage(1, { filterTrial: v });
              }}
            >
              <SelectTrigger className="h-9 w-full bg-background sm:w-[150px]">
                <SelectValue placeholder="Trial" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Billing</SelectItem>
                <SelectItem value="trial">Free Trial</SelectItem>
                <SelectItem value="non_trial">Paid</SelectItem>
              </SelectContent>
            </Select>
            {isIos && (
              <Select
                value={filterConversionStatus}
                onValueChange={(value) => {
                  setFilterConversionStatus(value);
                  void loadTransactionsPage(1, {
                    filterConversionStatus: value,
                  });
                }}
              >
                <SelectTrigger className="h-9 w-full bg-background sm:w-[180px]">
                  <SelectValue placeholder="Conversion" />
                </SelectTrigger>
                <SelectContent>
                  {IAP_CONVERSION_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={filterState}
              onValueChange={(v) => {
                setFilterState(v);
                void loadTransactionsPage(1, { filterState: v });
              }}
            >
              <SelectTrigger className="w-full sm:w-[140px] h-9 bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {uniqueStates.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveTransactionFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 bg-background px-2.5"
                onClick={resetTransactionFilters}
              >
                <X size={13} />
                Reset
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <Table className="text-foreground">
            <TableHeader className="sticky top-0 z-10 bg-muted/95 text-xs font-semibold text-muted-foreground backdrop-blur">
              <TableRow>
                {showSandboxDeleteControls ? (
                  <TableHead className="w-11 px-4">
                    <Checkbox
                      aria-label="Select all sandbox transactions on this page"
                      checked={
                        allVisibleSandboxSelected
                          ? true
                          : selectedSandboxIds.size > 0
                            ? "indeterminate"
                            : false
                      }
                      disabled={!sandboxRows.length}
                      onCheckedChange={(checked) => {
                        setSelectedSandboxIds((current) => {
                          const next = new Set(current);
                          for (const transaction of sandboxRows) {
                            if (checked === true) next.add(transaction.id);
                            else next.delete(transaction.id);
                          }
                          return next;
                        });
                      }}
                    />
                  </TableHead>
                ) : null}
                <TableHead className="px-4">Transaction / Order</TableHead>
                <TableHead className="px-4">Product Info</TableHead>
                {!isIos ? (
                  <TableHead className="px-4">Inbound</TableHead>
                ) : null}
                <TableHead className="px-4">
                  {isIos ? "Status" : "Billing"}
                </TableHead>
                <TableHead className="px-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`h-auto px-0 text-left font-semibold hover:bg-transparent ${
                      revenueSort === "asc" || revenueSort === "desc"
                        ? "text-foreground"
                        : ""
                    }`}
                    title={revenueSortLabel}
                    onClick={() => {
                      setRevenueSort(nextRevenueSort);
                      void loadTransactionsPage(1, {
                        revenueSort: nextRevenueSort,
                      });
                    }}
                  >
                    Revenue / Price
                    <ArrowUpDown size={13} />
                  </Button>
                </TableHead>
                <TableHead className="px-4">Purchase time</TableHead>
                <TableHead className="px-4">Firebase</TableHead>
                <TableHead className="px-4">Adjust</TableHead>
                <TableHead className="min-w-[168px] px-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="bg-background">
              {tableLoading
                ? Array.from({ length: IAP_TRANSACTION_SKELETON_COUNT }).map(
                    (_, index) => (
                      <TableRow key={`iap-transaction-skeleton-${index}`}>
                        {showSandboxDeleteControls ? (
                          <TableCell className="px-4 py-3.5">
                            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                          </TableCell>
                        ) : null}
                        <TableCell className="px-4 py-3.5">
                          <div className="h-4 w-44 animate-pulse rounded bg-muted" />
                          <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
                          <div className="mt-2 h-3 w-36 animate-pulse rounded bg-muted" />
                        </TableCell>
                        {!isIos ? (
                          <TableCell className="px-4 py-3.5">
                            <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                          </TableCell>
                        ) : null}
                        <TableCell className="px-4 py-3.5">
                          <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
                        </TableCell>
                      </TableRow>
                    ),
                  )
                : visible.map((tx) => {
                    const txId = transactionDisplayId(tx);
                    const secondaryId = transactionSecondaryId(tx);
                    const productId = transactionProductId(tx);
                    const purchaseKind = transactionKind(tx);
                    const trialLabel = transactionTrialLabel(tx);
                    const freeTrial = transactionIsFreeTrial(tx);
                    const isTest = transactionIsTest(tx);
                    const revenue = transactionRevenueMicros(tx);
                    const currency = transactionCurrency(tx);
                    const purchaseDate = transactionPurchaseDate(tx);
                    const expiresDate = transactionExpiresDate(tx);
                    const trialEndsAt = isAndroidTransaction(tx)
                      ? (tx.trialEndsAt ?? null)
                      : null;
                    const source = isIos
                      ? sourceMeta(transactionSource(tx))
                      : androidSourceMeta(transactionSource(tx));
                    const lastRtdnEventAt = transactionLastRtdnEventAt(tx);
                    const renewal = renewalStatusMeta(
                      transactionRenewalStatus(tx),
                    );
                    const trialConversion = trialConversionStatusMeta(tx);
                    const renewalDate = transactionRenewalDate(tx);
                    const renewalProductId = transactionRenewalProductId(tx);
                    const providerCheck = isIosTransaction(tx)
                      ? (providerCheckByTransactionId.get(tx.transaction_id) ??
                        null)
                      : null;
                    const expectsPurchaseDelivery = Boolean(
                      isIosTransaction(tx) &&
                      !freeTrial &&
                      Number(revenue ?? 0) > 0,
                    );
                    const firebaseDelivery = isIos
                      ? providerColumnStatusBadge(providerCheck, "ga4", {
                          expectsCheck: expectsPurchaseDelivery,
                        })
                      : isAndroidTransaction(tx)
                        ? androidProviderColumnStatusBadge(tx, "ga4")
                        : null;
                    const adjustDelivery = isIos
                      ? providerColumnStatusBadge(providerCheck, "adjust", {
                          expectsCheck: expectsPurchaseDelivery,
                        })
                      : isAndroidTransaction(tx)
                        ? androidProviderColumnStatusBadge(tx, "adjust")
                        : null;
                    return (
                      <TableRow key={tx.id} className="hover:bg-muted/20">
                        {showSandboxDeleteControls ? (
                          <TableCell className="w-11 px-4 py-3.5">
                            <Checkbox
                              aria-label={`Select sandbox transaction ${txId}`}
                              checked={selectedSandboxIds.has(tx.id)}
                              disabled={!isTest}
                              onCheckedChange={(checked) => {
                                setSelectedSandboxIds((current) => {
                                  const next = new Set(current);
                                  if (checked === true) next.add(tx.id);
                                  else next.delete(tx.id);
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell className="max-w-[240px] px-4 py-3.5">
                          <div className="font-semibold truncate" title={txId}>
                            {txId}
                          </div>
                          {isIos && secondaryId ? (
                            <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                              Orig: {secondaryId}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          <div className="flex flex-col gap-1 items-start">
                            {!isIos && purchaseKind && (
                              <Badge
                                variant="secondary"
                                className="px-2 py-0.5 text-[11px] font-medium"
                              >
                                {purchaseKind === "subscription"
                                  ? "Subscription"
                                  : "Product"}
                              </Badge>
                            )}
                            {isIos && trialLabel ? (
                              <Badge
                                variant="outline"
                                className={
                                  freeTrial
                                    ? "border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                                    : "border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                                }
                              >
                                {trialLabel}
                              </Badge>
                            ) : null}
                            {isIos && source ? (
                              <Badge
                                variant="outline"
                                className={`px-2 py-0.5 text-[11px] font-medium ${source.className}`}
                                title={source.title}
                              >
                                {source.label}
                              </Badge>
                            ) : null}
                            <div className="text-xs text-muted-foreground font-semibold">
                              {productId}
                            </div>
                            {isIos &&
                            isIosTransaction(tx) &&
                            (tx.transaction_reason || tx.billing_plan_type) ? (
                              <div className="text-[10px] text-muted-foreground">
                                {[tx.transaction_reason, tx.billing_plan_type]
                                  .filter(Boolean)
                                  .join(" / ")}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        {!isIos ? (
                          <TableCell className="px-4 py-3.5">
                            <div className="flex flex-col items-start gap-1">
                              <Badge
                                variant="outline"
                                className={`px-2 py-0.5 text-[11px] font-medium ${source.className}`}
                                title={source.title}
                              >
                                {source.label}
                              </Badge>
                              <p className="text-[10px] text-muted-foreground">
                                {lastRtdnEventAt
                                  ? `Last RTDN: ${formatDate(lastRtdnEventAt)}`
                                  : "No RTDN timestamp"}
                              </p>
                            </div>
                          </TableCell>
                        ) : null}
                        <TableCell className="px-4 py-3.5">
                          <div className="flex flex-col gap-1 items-start">
                            <span title="Transaction state reported by the store.">
                              <StatusBadge status={tx.state || "UNKNOWN"} />
                            </span>
                            {!isIos && trialLabel ? (
                              <Badge
                                variant="outline"
                                className={
                                  freeTrial
                                    ? "border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                                    : "border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                                }
                              >
                                {trialLabel}
                              </Badge>
                            ) : null}
                            {trialConversion ? (
                              <span
                                className={`inline-flex items-center whitespace-nowrap border font-semibold rounded-full px-2 py-[4px] text-[11px] leading-none ${trialConversion.className}`}
                                title={trialConversion.title}
                              >
                                {trialConversion.label}
                              </span>
                            ) : null}
                            {!isIos && freeTrial && trialEndsAt ? (
                              <div className="text-[10px] text-muted-foreground">
                                Trial ends: {formatDate(trialEndsAt)}
                              </div>
                            ) : null}
                            {isIosTransaction(tx) && tx.paid_transaction_id ? (
                              <div
                                className="max-w-[180px] truncate font-mono text-[10px] text-muted-foreground"
                                title={tx.paid_transaction_id}
                              >
                                Paid TX: {tx.paid_transaction_id}
                              </div>
                            ) : null}
                            {isTest && (
                              <span className="inline-flex items-center border font-semibold rounded-full px-2 py-[4px] text-[11px] leading-none bg-orange-50 border-orange-300 text-orange-700">
                                {isIos ? "Sandbox" : "Test"}
                              </span>
                            )}
                            {renewal ? (
                              <span
                                className={`inline-flex items-center border font-semibold rounded-full px-2 py-[4px] text-[11px] leading-none ${renewal.className}`}
                                title={renewal.title}
                              >
                                {renewal.label}
                              </span>
                            ) : null}
                            {renewalDate ? (
                              <div className="text-[10px] text-muted-foreground">
                                Renews: {formatDate(renewalDate)}
                              </div>
                            ) : null}
                            {renewalProductId &&
                            renewalProductId !== productId ? (
                              <div className="max-w-[160px] truncate text-[10px] text-muted-foreground">
                                Next: {renewalProductId}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          <div className="font-semibold">
                            {formatRevenue(revenue, currency)}
                          </div>
                          {!isIos && isAndroidTransaction(tx) && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {tx.regionCode && `Region: ${tx.regionCode}`}
                              {tx.currency && ` (${tx.currency})`}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3.5 text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar size={12} className="shrink-0" />
                            <span>{formatDate(purchaseDate)}</span>
                          </div>
                          {expiresDate ? (
                            <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                              <Calendar size={12} className="shrink-0" />
                              <span>Expires: {formatDate(expiresDate)}</span>
                            </div>
                          ) : null}
                        </TableCell>
                        {firebaseDelivery && adjustDelivery ? (
                          <>
                            <TableCell className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-[4px] text-[11px] font-semibold leading-none ${firebaseDelivery.className}`}
                                title={firebaseDelivery.title}
                              >
                                {firebaseDelivery.label}
                              </span>
                            </TableCell>
                            <TableCell className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-[4px] text-[11px] font-semibold leading-none ${adjustDelivery.className}`}
                                title={adjustDelivery.title}
                              >
                                {adjustDelivery.label}
                              </span>
                            </TableCell>
                          </>
                        ) : null}
                        <TableCell className="min-w-[260px] px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 px-2.5"
                              disabled={appPayloadLoadingId === tx.id}
                              onClick={() => void inspectAppPayload(tx)}
                            >
                              {appPayloadLoadingId === tx.id ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              ) : (
                                <FileJson size={13} />
                              )}
                              <span>
                                {appPayloadLoadingId === tx.id
                                  ? "Loading"
                                  : "App payload"}
                              </span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 px-2.5"
                              disabled={receiptLoadingId === tx.id}
                              onClick={() => void inspectTransactionReceipt(tx)}
                            >
                              {receiptLoadingId === tx.id ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              ) : (
                                <FileJson size={13} />
                              )}
                              <span>
                                {receiptLoadingId === tx.id
                                  ? "Loading"
                                  : "Receipt"}
                              </span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              {!tableLoading && !visible.length && (
                <TableEmptyState
                  colSpan={
                    (isIos ? 8 : 9) + (showSandboxDeleteControls ? 1 : 0)
                  }
                  icon={CreditCard}
                  title="No transactions found"
                  description="Try changing your filters."
                />
              )}
            </TableBody>
          </Table>
        </div>

        <TablePaginationFooter
          from={tableStartIndex + 1}
          loadingPage={loadingPage}
          onPageChange={(page) => void loadTransactionsPage(page)}
          page={currentPage}
          shown={visible.length}
          to={tableStartIndex + visible.length}
          total={transactionPagination.total}
          totalPages={transactionPagination.totalPages}
        />
      </div>
      {selectedReceipt !== null ? (
        <IapReceiptDialog
          receipt={selectedReceipt}
          onOpenChange={(open) => {
            if (!open) setSelectedReceipt(null);
          }}
        />
      ) : null}
      {selectedAppPayload !== null ? (
        <IapReceiptDialog
          description="Persisted mobile purchase fields reconstructed by the server. Stable identifiers and purchase tokens are always redacted."
          receipt={selectedAppPayload}
          title="App Payload (Redacted)"
          onOpenChange={(open) => {
            if (!open) setSelectedAppPayload(null);
          }}
        />
      ) : null}
      <AlertDialog
        open={sandboxDeleteMode !== null}
        onOpenChange={(open) => {
          if (!open && !sandboxDeleting) setSandboxDeleteMode(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sandbox data?</AlertDialogTitle>
            <AlertDialogDescription>
              {sandboxDeleteMode === "all"
                ? `This permanently deletes all ${isIos ? "sandbox" : "test"} transactions for this app and their related delivery jobs, checks, and notification events.`
                : `This permanently deletes ${selectedSandboxIds.size} selected ${isIos ? "sandbox" : "test"} transaction(s) and related records.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sandboxDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={sandboxDeleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteSandboxTransactions();
              }}
            >
              {sandboxDeleting ? "Deleting..." : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
