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
import type { IapRevenueBucket } from "@/lib/tracking/page-data";

type RevenueBucket = {
  fullLabel: string;
  key: string;
  label: string;
  production: number;
};

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
    const sand = Number.isFinite(bucket.sand) ? bucket.sand : 0;
    const production = prod + sand;

    return {
      fullLabel: bucket.label,
      key: `${bucket.label}-${index}`,
      label: bucket.label,
      production,
    };
  });
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
  revenue,
  trendPct,
}: {
  buckets: IapRevenueBucket[];
  revenue: number;
  trendPct: number;
}) {
  const chartBuckets = useMemo(() => toChartBuckets(buckets), [buckets]);
  const displayRevenue = revenue;
  const displayTrendPct = trendPct;
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
            Last 12 months
          </div>
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
