"use client";

import { useMemo } from "react";
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  IapRevenueBucket,
  IapRevenueGranularity,
} from "@/lib/tracking/page-data";

type RevenueBucket = {
  fullLabel: string;
  key: string;
  label: string;
  production: number;
};

export type IapRevenueChartProps = {
  buckets: IapRevenueBucket[];
  granularity: IapRevenueGranularity;
  loading?: boolean;
  onGranularityChange: (granularity: IapRevenueGranularity) => void;
};

const REVENUE_GRANULARITIES: Array<{
  label: string;
  rangeLabel: string;
  value: IapRevenueGranularity;
}> = [
  { label: "Day", rangeLabel: "Last 14 days", value: "day" },
  { label: "Week", rangeLabel: "Last 12 weeks", value: "week" },
  { label: "Month", rangeLabel: "Last 12 months", value: "month" },
];

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

function toChartBuckets(buckets: IapRevenueBucket[]) {
  return buckets.map((bucket, index): RevenueBucket => {
    const prod = Number.isFinite(bucket.prod) ? bucket.prod : 0;

    return {
      fullLabel: bucket.label,
      key: `${bucket.label}-${index}`,
      label: bucket.label,
      production: prod,
    };
  });
}

function trendPercentage(current: number, previous: number) {
  if (previous > 0) return ((current - previous) / previous) * 100;
  return current > 0 ? 100 : 0;
}

function trendPeriodLabel(granularity: IapRevenueGranularity) {
  if (granularity === "day") return "vs previous day";
  if (granularity === "week") return "vs previous week";
  return "vs previous month";
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
          <span className="font-semibold">
            {currencyLabel(data.production)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function IapRevenueChart({
  buckets,
  granularity,
  loading = false,
  onGranularityChange,
}: IapRevenueChartProps) {
  const chartBuckets = useMemo(() => toChartBuckets(buckets), [buckets]);
  const selectedGranularity = REVENUE_GRANULARITIES.find(
    (item) => item.value === granularity,
  );
  const displayRevenue = useMemo(
    () => chartBuckets.reduce((total, bucket) => total + bucket.production, 0),
    [chartBuckets],
  );
  const displayTrendPct = useMemo(() => {
    const current =
      chartBuckets.length > 0
        ? chartBuckets[chartBuckets.length - 1].production
        : 0;
    const previous =
      chartBuckets.length > 1
        ? chartBuckets[chartBuckets.length - 2].production
        : 0;

    return trendPercentage(current, previous);
  }, [chartBuckets]);
  const trendLabel =
    displayTrendPct >= 0
      ? `+${displayTrendPct.toFixed(0)}%`
      : `${displayTrendPct.toFixed(0)}%`;
  const trendPeriod = trendPeriodLabel(granularity);

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
              {trendLabel} {trendPeriod}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {selectedGranularity?.rangeLabel ?? "Revenue timeline"}
          </div>
        </div>
        <div className="inline-flex w-fit rounded-lg border bg-muted/30 p-1">
          {REVENUE_GRANULARITIES.map((item) => (
            <Button
              className="h-8 px-3 text-xs"
              disabled={loading}
              key={item.value}
              onClick={() => onGranularityChange(item.value)}
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
            data={chartBuckets}
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
              domain={[0, "dataMax"]}
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
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
