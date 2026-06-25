"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Apple,
  Calendar,
  ChevronRight,
  CreditCard,
  FileJson,
  MoreHorizontal,
  Smartphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  TableEmptyState,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  IapAppDetailPageData,
  IapAppTransaction,
} from "@/lib/tracking/page-data";
import type { IapAndroidDto } from "@/lib/server/services/iap/android-iap.service";
import type { IosIapTransactionSummary } from "@/lib/tracking/types";
import { toast } from "sonner";

type IapTransactionListResponse = {
  success?: boolean;
  data?: IapAppTransaction[];
  error?: string;
  metricTransactions?: IapAppTransaction[];
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  transactionStates?: string[];
};

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

function transactionRevenueValue(transaction: IapAppTransaction) {
  const micros = transactionRevenueMicros(transaction);
  if (micros === null) return 0;
  const numericMicros =
    typeof micros === "number" ? micros : Number.parseInt(micros, 10);
  return Number.isFinite(numericMicros) ? numericMicros / 1_000_000 : 0;
}

function transactionTimestamp(transaction: IapAppTransaction) {
  const dateValue = transactionPurchaseDate(transaction);
  if (!dateValue) return 0;
  const timestamp = new Date(dateValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
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
        <MoreHorizontal size={16} className="cursor-pointer opacity-60" />
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

export function IapAppDetailPage({ data }: { data: IapAppDetailPageData }) {
  const { app } = data;
  const isIos = app.platform === "ios";

  const [metricTransactions, setMetricTransactions] = useState(
    data.metricTransactions,
  );
  const [transactions, setTransactions] = useState(data.transactions);
  const [transactionPagination, setTransactionPagination] = useState(
    data.transactionPagination,
  );
  const [transactionStates, setTransactionStates] = useState(
    data.transactionStates,
  );
  const [search, setSearch] = useState(data.filters.search);
  const [filterState, setFilterState] = useState<string>(data.filters.state);
  const [filterKind, setFilterKind] = useState<string>(data.filters.kind);
  const [tableLoading, setTableLoading] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<unknown | null>(null);

  async function loadTransactionsPage(
    page: number,
    overrides?: {
      filterKind?: string;
      filterState?: string;
      search?: string;
    },
  ) {
    const nextSearch = overrides?.search ?? search;
    const nextFilterState = overrides?.filterState ?? filterState;
    const nextFilterKind = overrides?.filterKind ?? filterKind;
    const params = new URLSearchParams({
      mappingId: app.mappingId,
      page: String(page),
      pageSize: "10",
      platform: app.platform,
    });
    const searchValue = nextSearch.trim();

    if (searchValue) params.set("search", searchValue);
    if (nextFilterState !== "all") params.set("state", nextFilterState);
    if (!isIos && nextFilterKind !== "all") params.set("kind", nextFilterKind);

    setTableLoading(true);

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
      if (payload.metricTransactions) {
        setMetricTransactions(payload.metricTransactions);
      }
      if (payload.transactionStates) {
        setTransactionStates(payload.transactionStates);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Load IAP transactions failed.",
      );
    } finally {
      setTableLoading(false);
    }
  }

  const filteredTransactions = metricTransactions;

  const stats = useMemo(() => {
    let rev = 0;
    let active = 0;
    let canceled = 0;
    const latestTimestamp = Math.max(
      0,
      ...filteredTransactions.map(transactionTimestamp),
    );
    const week = 7 * 24 * 60 * 60 * 1000;
    let revL7 = 0;
    let revP7 = 0;
    let ordL7 = 0;
    let ordP7 = 0;

    filteredTransactions.forEach((tx) => {
      const test = transactionIsTest(tx);
      const st = tx.state.toLowerCase();
      const value = transactionRevenueValue(tx);
      const timestamp = transactionTimestamp(tx);

      if (!test && value > 0) {
        rev += value;
        if (latestTimestamp && timestamp >= latestTimestamp - week) {
          revL7 += value;
          ordL7++;
        } else if (latestTimestamp && timestamp >= latestTimestamp - 2 * week) {
          revP7 += value;
          ordP7++;
        }
      }
      if (st === "active" || st === "purchased") active++;
      if (st === "canceled" || st === "expired") canceled++;
    });
    const sg =
      revP7 > 0 ? ((revL7 - revP7) / revP7) * 100 : revL7 > 0 ? 100 : 0;
    const og =
      ordP7 > 0 ? ((ordL7 - ordP7) / ordP7) * 100 : ordL7 > 0 ? 100 : 0;
    return {
      rev,
      active,
      canceled,
      total: filteredTransactions.length,
      sg,
      ogDir: og >= 0 ? ("up" as const) : ("down" as const),
      sgDir: sg >= 0 ? ("up" as const) : ("down" as const),
      revL7,
      revP7,
      ordL7,
      ordP7,
      og,
      latestTimestamp,
    };
  }, [filteredTransactions]);

  // Monthly chart data (12 months)
  const { buckets, maxVal } = useMemo(() => {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const b: { label: string; prod: number; sand: number }[] = [];
    const chartEnd = stats.latestTimestamp
      ? new Date(stats.latestTimestamp)
      : new Date("2026-06-01T00:00:00.000Z");

    for (let i = 11; i >= 0; i--) {
      const d = new Date(chartEnd.getFullYear(), chartEnd.getMonth() - i, 1);
      b.push({ label: months[d.getMonth()], prod: 0, sand: 0 });
    }

    filteredTransactions.forEach((tx) => {
      const pd = new Date(transactionPurchaseDate(tx) ?? 0);
      const value = transactionRevenueValue(tx);
      if (!value || Number.isNaN(pd.getTime())) return;

      const mIdx = b.findIndex((_, idx) => {
        const ref = new Date(
          chartEnd.getFullYear(),
          chartEnd.getMonth() - (11 - idx),
          1,
        );
        return (
          ref.getMonth() === pd.getMonth() &&
          ref.getFullYear() === pd.getFullYear()
        );
      });

      if (mIdx >= 0) {
        if (transactionIsTest(tx)) b[mIdx].sand += value;
        else b[mIdx].prod += value;
      }
    });
    let mx = 1;
    b.forEach((x) => {
      if (x.prod + x.sand > mx) mx = x.prod + x.sand;
    });
    return { buckets: b, maxVal: mx };
  }, [filteredTransactions, stats.latestTimestamp]);

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
  const revTrendBadgePct =
    stats.sg >= 0 ? `+${stats.sg.toFixed(0)}%` : `${stats.sg.toFixed(0)}%`;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/10 p-4 sm:p-6 gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-muted-foreground font-medium shrink-0">
        <Link
          href="/iap"
          className="hover:text-foreground transition-colors flex items-center"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Apps
        </Link>
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

        {/* Right: Revenue Chart Card */}
        <div className="lg:col-span-7 bg-card text-card-foreground rounded-lg border flex flex-col">
          <div className="flex flex-col space-y-1.5 p-4">
            <div className="flex items-center justify-between">
              <div className="leading-none font-semibold tracking-tight">
                Revenue
              </div>
              <Select defaultValue="2026">
                <SelectTrigger className="w-[100px] h-9">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{fmtVND(stats.rev)}</p>
              <span className="text-muted-foreground text-sm font-medium">
                {revTrendBadgePct} from last week
              </span>
            </div>
          </div>
          <div className="p-4 pt-0 flex-1 flex flex-col justify-end mt-4">
            {/* Custom Bar Chart matching Shadcn Reference */}
            <div className="relative flex items-end w-full h-[180px] xl:h-[220px]">
              {/* Horizontal Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-[24px]">
                <div className="w-full border-t border-border/50"></div>
                <div className="w-full border-t border-border/50"></div>
                <div className="w-full border-t border-border/50"></div>
              </div>

              {/* Bars */}
              <div className="relative z-10 w-full flex items-end justify-between h-full pb-[24px]">
                {buckets.map((b, i) => {
                  const total = b.prod + b.sand;
                  const hPct = maxVal > 0 ? (total / maxVal) * 100 : 0;
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center flex-1 group relative h-full justify-end"
                    >
                      <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center pointer-events-none bg-zinc-950 text-white text-xs p-2.5 rounded-lg shadow-xl z-50 border border-zinc-800 min-w-[120px]">
                        <p className="font-semibold border-b border-zinc-800 pb-1.5 mb-1 w-full text-center">
                          {b.label}
                        </p>
                        <div className="flex justify-between w-full gap-3">
                          <span className="text-zinc-400">Total:</span>
                          <span className="font-bold">{fmtVND(total)}</span>
                        </div>
                        <div className="flex justify-between w-full gap-3 mt-1 text-[10px]">
                          <span className="text-zinc-500">Prod:</span>
                          <span className="font-semibold text-zinc-300">
                            {fmtVND(b.prod)}
                          </span>
                        </div>
                        <div className="flex justify-between w-full gap-3 mt-0.5 text-[10px]">
                          <span className="text-zinc-500">Sand:</span>
                          <span className="font-semibold text-zinc-300">
                            {fmtVND(b.sand)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full px-[2px] sm:px-1 md:px-2 flex justify-center items-end h-full">
                        <div
                          className="w-full max-w-[32px] bg-primary rounded-t-[4px] transition-all duration-500 hover:opacity-80"
                          style={{ height: `${hPct}%` }}
                        ></div>
                      </div>
                      <span className="absolute -bottom-[20px] text-[12px] text-muted-foreground font-medium">
                        {b.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="flex-1 min-h-0 flex flex-col bg-card text-card-foreground border rounded-lg overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-b bg-muted/20">
          <div className="flex w-full items-center gap-2 sm:max-w-xs">
            <Input
              type="search"
              placeholder="Search Order ID or Product ID..."
              className="h-9 bg-background"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                void loadTransactionsPage(1, { search: e.target.value });
              }}
            />
            {tableLoading ? <Spinner className="size-4" /> : null}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
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
              {visible.map((tx) => {
                const txId = transactionDisplayId(tx);
                const secondaryId = transactionSecondaryId(tx);
                const productId = transactionProductId(tx);
                const purchaseKind = transactionKind(tx);
                const isTest = transactionIsTest(tx);
                const revenue = transactionRevenueMicros(tx);
                const currency = transactionCurrency(tx);
                const purchaseDate = transactionPurchaseDate(tx);
                const expiresDate = transactionExpiresDate(tx);
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
                        <div className="text-xs text-muted-foreground font-semibold">
                          {productId}
                        </div>
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
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 px-2.5"
                            onClick={() =>
                              setSelectedReceipt(transactionRawReceipt(tx))
                            }
                          >
                            <FileJson size={13} />
                            <span>JSON</span>
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-4xl max-h-[80vh] flex flex-col p-6">
                          <DialogHeader className="pb-2 border-b">
                            <DialogTitle className="flex items-center gap-2">
                              <FileJson size={18} className="text-primary" />
                              <span>Receipt Details</span>
                            </DialogTitle>
                          </DialogHeader>
                          <div className="flex-1 overflow-auto mt-4 p-4 rounded-lg bg-zinc-950 font-mono text-xs text-zinc-300 border border-zinc-800">
                            <pre className="whitespace-pre-wrap">
                              {JSON.stringify(selectedReceipt, null, 2)}
                            </pre>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </td>
                  </tr>
                );
              })}
              {!visible.length && (
                <TableEmptyState
                  colSpan={6}
                  icon={CreditCard}
                  title="No transactions found"
                  description="Try changing your search terms or filters."
                />
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationFooter
          from={tableStartIndex + 1}
          onPageChange={(page) => void loadTransactionsPage(page)}
          page={currentPage}
          shown={visible.length}
          to={tableStartIndex + visible.length}
          total={transactionPagination.total}
          totalPages={transactionPagination.totalPages}
        />
      </div>
    </div>
  );
}
