"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { IapAppTransaction } from "@/lib/tracking/page-data";
import type { IapAndroidDto } from "@/lib/server/services/iap/android-iap.service";
import type { IosIapTransactionSummary } from "@/lib/tracking/types";

type RevenueGranularity = "day" | "week" | "month";

type RevenueBucket = {
  fullLabel: string;
  key: string;
  label: string;
  orders: number;
  production: number;
  total: number;
};

const GRANULARITIES: Array<{
  label: string;
  rangeLabel: string;
  value: RevenueGranularity;
}> = [
  { label: "Day", rangeLabel: "Last 14 days", value: "day" },
  { label: "Week", rangeLabel: "Last 12 weeks", value: "week" },
  { label: "Month", rangeLabel: "Last 12 months", value: "month" },
];

function isIosTransaction(
  transaction: IapAppTransaction,
): transaction is IosIapTransactionSummary {
  return "transaction_id" in transaction;
}

function transactionIsTest(transaction: IapAppTransaction) {
  return isIosTransaction(transaction)
    ? transaction.environment.toLowerCase() === "sandbox"
    : (transaction as IapAndroidDto).isTestPurchase;
}

function transactionRevenueMicros(transaction: IapAppTransaction) {
  return isIosTransaction(transaction)
    ? transaction.revenue_micros
    : (transaction as IapAndroidDto).revenueMicros;
}

function transactionPurchaseDate(transaction: IapAppTransaction) {
  return isIosTransaction(transaction)
    ? transaction.purchase_date
    : (transaction as IapAndroidDto).purchaseDate;
}

function revenueValue(transaction: IapAppTransaction) {
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

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  const offset = day === 0 ? 6 : day - 1;
  const result = startOfDay(date);
  result.setDate(result.getDate() - offset);

  return result;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addBucket(date: Date, granularity: RevenueGranularity, amount: number) {
  const next = new Date(date);

  if (granularity === "day") next.setDate(next.getDate() + amount);
  if (granularity === "week") next.setDate(next.getDate() + amount * 7);
  if (granularity === "month") next.setMonth(next.getMonth() + amount);

  return next;
}

function bucketStart(date: Date, granularity: RevenueGranularity) {
  if (granularity === "day") return startOfDay(date);
  if (granularity === "week") return startOfWeek(date);
  return startOfMonth(date);
}

function bucketCount(granularity: RevenueGranularity) {
  if (granularity === "day") return 14;
  if (granularity === "week") return 12;
  return 12;
}

function bucketLabel(date: Date, granularity: RevenueGranularity) {
  if (granularity === "day") {
    return new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "short",
    }).format(date);
  }

  if (granularity === "week") {
    return new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "short",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
  }).format(date);
}

function bucketFullLabel(date: Date, granularity: RevenueGranularity) {
  if (granularity === "week") {
    const weekEnd = addBucket(date, "day", 6);
    return `${bucketLabel(date, "day")} - ${bucketLabel(weekEnd, "day")}`;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: granularity === "month" ? undefined : "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function currencyLabel(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    currency: "VND",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function compactCurrencyLabel(value: number) {
  if (value >= 1_000_000) {
    return `${Math.round(value / 1_000_000)}M`;
  }

  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}K`;
  }

  return `${Math.round(value)}`;
}

function buildRevenueBuckets(
  transactions: IapAppTransaction[],
  granularity: RevenueGranularity,
) {
  const validTimestamps = transactions
    .map(transactionTimestamp)
    .filter((timestamp) => timestamp > 0);
  const endDate = bucketStart(
    validTimestamps.length
      ? new Date(Math.max(...validTimestamps))
      : new Date(),
    granularity,
  );
  const count = bucketCount(granularity);
  const firstDate = addBucket(endDate, granularity, -(count - 1));
  const buckets: RevenueBucket[] = [];
  const bucketByKey = new Map<string, RevenueBucket>();

  for (let index = 0; index < count; index++) {
    const date = addBucket(firstDate, granularity, index);
    const key = date.toISOString();
    const bucket: RevenueBucket = {
      fullLabel: bucketFullLabel(date, granularity),
      key,
      label: bucketLabel(date, granularity),
      orders: 0,
      production: 0,
      total: 0,
    };

    buckets.push(bucket);
    bucketByKey.set(key, bucket);
  }

  for (const transaction of transactions) {
    const timestamp = transactionTimestamp(transaction);
    const value = revenueValue(transaction);
    if (!timestamp || value <= 0) continue;

    const key = bucketStart(new Date(timestamp), granularity).toISOString();
    const bucket = bucketByKey.get(key);
    if (!bucket) continue;

    if (transactionIsTest(transaction)) continue;

    bucket.production += value;
    bucket.total += value;
    bucket.orders += 1;
  }

  return buckets;
}

function RevenueTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    color?: string;
    dataKey?: string;
    payload?: RevenueBucket;
    value?: number;
  }>;
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="min-w-[190px] rounded-lg border bg-background p-3 text-xs shadow-xl">
      <div className="font-semibold text-foreground">{data.fullLabel}</div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Revenue</span>
          <span className="font-semibold">{currencyLabel(data.total)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Orders</span>
          <span className="font-medium">{data.orders}</span>
        </div>
      </div>
    </div>
  );
}

export function IapRevenueChart({
  revenue,
  trendPct,
  transactions,
}: {
  revenue: number;
  trendPct: number;
  transactions: IapAppTransaction[];
}) {
  const [granularity, setGranularity] = useState<RevenueGranularity>("month");
  const realBuckets = useMemo(
    () => buildRevenueBuckets(transactions, granularity),
    [granularity, transactions],
  );
  const buckets = realBuckets;
  const displayRevenue = revenue;
  const displayTrendPct = trendPct;
  const selectedGranularity = GRANULARITIES.find(
    (item) => item.value === granularity,
  );
  const trendLabel =
    displayTrendPct >= 0
      ? `+${displayTrendPct.toFixed(0)}%`
      : `${displayTrendPct.toFixed(0)}%`;

  return (
    <div className="lg:col-span-7 flex flex-col rounded-lg border bg-card text-card-foreground">
      <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-base font-semibold leading-none">Revenue</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-2xl font-bold">{currencyLabel(displayRevenue)}</p>
            <Badge
              variant="outline"
              className={
                displayTrendPct >= 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }
            >
              {trendLabel} last week
            </Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {selectedGranularity?.rangeLabel ?? "Revenue timeline"}
          </div>
        </div>
        <div className="inline-flex w-fit rounded-lg border bg-muted/30 p-1">
          {GRANULARITIES.map((item) => (
            <Button
              className="h-8 px-3 text-xs"
              key={item.value}
              onClick={() => setGranularity(item.value)}
              size="sm"
              type="button"
              variant={granularity === item.value ? "default" : "ghost"}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-[280px] flex-1 p-4">
        <ResponsiveContainer height="100%" minHeight={250} width="100%">
          <AreaChart
            data={buckets}
            margin={{ bottom: 4, left: 0, right: 12, top: 16 }}
          >
            <defs>
              <linearGradient id="iapRevenueFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="hsl(var(--border))"
              strokeDasharray="4 6"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="label"
              interval="preserveStartEnd"
              minTickGap={18}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickFormatter={(value) => compactCurrencyLabel(Number(value))}
              tickLine={false}
              width={42}
            />
            <Tooltip
              content={<RevenueTooltip />}
              cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
            />
            <Area
              activeDot={{ r: 4 }}
              dataKey="production"
              dot={false}
              fill="url(#iapRevenueFill)"
              name="Revenue"
              stroke="#2563eb"
              strokeWidth={3}
              type="natural"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
