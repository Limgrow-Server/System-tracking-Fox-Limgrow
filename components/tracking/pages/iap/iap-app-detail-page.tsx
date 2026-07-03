"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Apple,
  Calendar,
  ChevronRight,
  CreditCard,
  FileJson,
  Smartphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PendingNavigationLink } from "@/components/tracking/pending-navigation-link";
import {
  TableEmptyState,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  IapAppDetailPageData,
  IapAppMetrics,
  IapAppTransaction,
  IapTrialConversionAnalytics,
} from "@/lib/tracking/page-data";
import type { IapAndroidDto } from "@/lib/server/services/iap/android-iap.service";
import type { IosIapTransactionSummary } from "@/lib/tracking/types";
import { showToast } from "@/lib/client/toast";
import { IosTrialAnalyticsPanel } from "./ios-trial-analytics-panel";
import { IapRevenueChart } from "./iap-revenue-chart";

const IapReceiptDialog = dynamic(
  () => import("./iap-receipt-dialog").then((mod) => mod.IapReceiptDialog),
  { loading: () => null },
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

const IAP_TRANSACTION_SKELETON_COUNT = 8;

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
  if (!isIosTransaction(transaction)) return false;
  return (
    transaction.is_trial === true ||
    transaction.offer_discount_type?.toLowerCase() === "free_trial"
  );
}

function transactionTrialLabel(transaction: IapAppTransaction) {
  if (!isIosTransaction(transaction)) return null;
  if (transactionIsFreeTrial(transaction)) return "Free Trial";
  if (transaction.offer_discount_type) {
    return transaction.offer_discount_type
      .toLowerCase()
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return "Paid";
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

function transactionRawReceipt(transaction: IapAppTransaction) {
  return isIosTransaction(transaction)
    ? transaction.raw_receipt
    : transaction.rawReceipt;
}

function transactionSource(transaction: IapAppTransaction) {
  return isIosTransaction(transaction) ? transaction.ingestion_source : null;
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
      label: "Renew enabled",
    };
  }

  if (status === "disabled") {
    return {
      className: "border-rose-200 bg-rose-50 text-rose-700",
      label: "Renew disabled",
    };
  }

  return null;
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
    normalized === "app_store_server_api.get_transaction_info"
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
    label: "Legacy API",
    title: "Saved before source tracking was added, likely from verify-ios/API",
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
  const decoded = signedTransactionInfo ? decodeJws(signedTransactionInfo) : null;
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
  if (s.includes("active") || s.includes("purchased"))
    cls =
      "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-200 dark:text-emerald-400";
  else if (s.includes("expired") || s.includes("canceled"))
    cls =
      "bg-destructive/10 border-destructive/30 text-destructive dark:bg-destructive/50 dark:text-foreground";
  else if (s.includes("grace") || s.includes("paused"))
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

export function IapAppDetailPage({ data }: { data: IapAppDetailPageData }) {
  const { app } = data;
  const isIos = app.platform === "ios";

  const [metrics, setMetrics] = useState(data.metrics);
  const [transactions, setTransactions] = useState(data.transactions);
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
  const [filterEnvironment, setFilterEnvironment] = useState<string>(
    data.filters.environment,
  );
  const [filterState, setFilterState] = useState<string>(data.filters.state);
  const [filterKind, setFilterKind] = useState<string>(data.filters.kind);
  const [filterTrial, setFilterTrial] = useState<string>(data.filters.trial);
  const [tableLoading, setTableLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState<number | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<unknown | null>(null);

  async function loadTransactionsPage(
    page: number,
    overrides?: {
      filterEnvironment?: string;
      filterKind?: string;
      filterState?: string;
      filterTrial?: string;
    },
  ) {
    const nextFilterEnvironment =
      overrides?.filterEnvironment ?? filterEnvironment;
    const nextFilterState = overrides?.filterState ?? filterState;
    const nextFilterKind = overrides?.filterKind ?? filterKind;
    const nextFilterTrial = overrides?.filterTrial ?? filterTrial;
    const params = new URLSearchParams({
      context: overrides ? "true" : "false",
      mappingId: app.mappingId,
      page: String(page),
      pageSize: "10",
      platform: app.platform,
    });

    if (!isIos && nextFilterEnvironment !== "all") {
      params.set("environment", nextFilterEnvironment);
    }
    if (nextFilterState !== "all") params.set("state", nextFilterState);
    if (!isIos && nextFilterKind !== "all") params.set("kind", nextFilterKind);
    if (isIos && nextFilterTrial !== "all") {
      params.set("trial", nextFilterTrial);
    }
    if (!overrides) {
      params.set("knownTotal", String(transactionPagination.total));
    }

    setTableLoading(true);
    setLoadingPage(page);

    try {
      const response = await fetch(
        `/api/admin/iap/app-transactions?${params.toString()}`,
      );
      const payload = (await response.json()) as IapTransactionListResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Load IAP transactions failed.");
      }

      setTransactions(payload.data);
      setTransactionPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 10,
        total: payload.total ?? payload.data.length,
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
      void showToast("error",
        error instanceof Error
          ? error.message
          : "Load IAP transactions failed.",
      );
    } finally {
      setTableLoading(false);
      setLoadingPage(null);
    }
  }

  useEffect(() => {
    if (metricsLoaded) return;

    let cancelled = false;
    const params = new URLSearchParams({
      mappingId: app.mappingId,
      platform: app.platform,
    });

    if (!isIos && filterEnvironment !== "all") {
      params.set("environment", filterEnvironment);
    }
    if (filterState !== "all") params.set("state", filterState);
    if (!isIos && filterKind !== "all") params.set("kind", filterKind);
    if (isIos && filterTrial !== "all") {
      params.set("trial", filterTrial);
    }

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
          void showToast("error",
            error instanceof Error
              ? error.message
              : "Load IAP metrics failed.",
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
    metricsLoaded,
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
          void showToast("error",
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

  async function refreshTrialAnalytics() {
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
      void showToast("success", "Notification events refreshed.");
    } catch (error) {
      void showToast("error",
        error instanceof Error
          ? error.message
          : "Refresh notification events failed.",
      );
    } finally {
      setTrialAnalyticsRefreshing(false);
    }
  }

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

  const fmtVND = (n: number) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/10 p-4 sm:p-6 gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-muted-foreground font-medium shrink-0">
        <PendingNavigationLink
          href="/iap"
          className="hover:text-foreground transition-colors flex items-center"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Apps
        </PendingNavigationLink>
        <ChevronRight className="h-4 w-4" />
        <div className="flex items-center gap-2 text-foreground bg-background px-2 py-1 rounded-md border shadow-sm">
          {isIos ? (
            <Badge
              variant="outline"
              className="border-zinc-200 bg-zinc-50 text-zinc-700 gap-1"
            >
              <Apple size={12} />
              iOS
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-1"
            >
              <Smartphone size={12} />
              Android
            </Badge>
          )}
          {app.appName}
        </div>
      </nav>

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
          revenue={stats.rev}
          trendPct={stats.sg}
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

      {/* Table Card */}
      <div className="flex-1 min-h-0 flex flex-col bg-card text-card-foreground border rounded-lg overflow-hidden">
        <div className="flex flex-col items-stretch justify-end gap-4 border-b bg-muted/20 p-4 sm:flex-row sm:items-center">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {!isIos && (
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
                  <SelectItem value="test">Test</SelectItem>
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
                  <SelectItem value="inapp">In-App</SelectItem>
                </SelectContent>
              </Select>
            )}
            {isIos && (
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
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-sm text-foreground">
            <thead className="bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 z-10 backdrop-blur">
              <tr>
                <th className="px-4 py-3">Transaction / Order</th>
                <th className="px-4 py-3">Product Info</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Revenue / Price</th>
                <th className="px-4 py-3">Purchase time</th>
                <th className="px-4 py-3">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y border-b bg-background">
              {tableLoading ? (
                Array.from({ length: IAP_TRANSACTION_SKELETON_COUNT }).map((_, index) => (
                  <tr key={`iap-transaction-skeleton-${index}`}>
                    <td className="px-4 py-3.5">
                      <div className="h-4 w-44 animate-pulse rounded bg-muted" />
                      <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
                      <div className="mt-2 h-3 w-36 animate-pulse rounded bg-muted" />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                      <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted" />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
                    </td>
                  </tr>
                ))
              ) : visible.map((tx) => {
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
                const source = isIos ? sourceMeta(transactionSource(tx)) : null;
                const renewal = renewalStatusMeta(transactionRenewalStatus(tx));
                const renewalDate = transactionRenewalDate(tx);
                const renewalProductId = transactionRenewalProductId(tx);
                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3.5 max-w-[240px]">
                      <div className="font-semibold truncate" title={txId}>
                        {txId}
                      </div>
                      {isIos && secondaryId ? (
                        <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                          Orig: {secondaryId}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5">
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
                        {source ? (
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
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        <StatusBadge status={tx.state || "UNKNOWN"} />
                        {isTest && (
                          <span className="inline-flex items-center border font-semibold rounded-full px-2 py-[4px] text-[11px] leading-none bg-orange-50 border-orange-300 text-orange-700">
                            Sandbox
                          </span>
                        )}
                        {renewal ? (
                          <span
                            className={`inline-flex items-center border font-semibold rounded-full px-2 py-[4px] text-[11px] leading-none ${renewal.className}`}
                          >
                            {renewal.label}
                          </span>
                        ) : null}
                        {renewalDate ? (
                          <div className="text-[10px] text-muted-foreground">
                            Renews: {formatDate(renewalDate)}
                          </div>
                        ) : null}
                        {renewalProductId && renewalProductId !== productId ? (
                          <div className="max-w-[160px] truncate text-[10px] text-muted-foreground">
                            Next: {renewalProductId}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold">
                        {formatRevenue(revenue, currency)}
                      </div>
                      {!isIos && isAndroidTransaction(tx) && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {tx.regionCode && `Region: ${tx.regionCode}`}
                          {tx.currency && ` (${tx.currency})`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
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
                    </td>
                    <td className="px-4 py-3.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 px-2.5"
                        onClick={() =>
                          setSelectedReceipt(
                            receiptDisplayPayload(transactionRawReceipt(tx)),
                          )
                        }
                      >
                        <FileJson size={13} />
                        <span>JSON</span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!tableLoading && !visible.length && (
                <TableEmptyState
                  colSpan={6}
                  icon={CreditCard}
                  title="No transactions found"
                  description="Try changing your filters."
                />
              )}
            </tbody>
          </table>
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
    </div>
  );
}
