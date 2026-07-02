"use client";

import { useState } from "react";
import {
  Bell,
  Clock3,
  FileJson,
  RotateCcw,
} from "lucide-react";
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
  IapNotificationEventDto,
  IapTrialConversionAnalytics,
  IapTrialConversionGranularity,
} from "@/lib/tracking/page-data";
import { showToast } from "@/lib/client/toast";

type RetryPayload = {
  ok?: boolean;
  error?: string;
  status?: string;
};

type TrialConversionDatum = {
  continued: number;
  label: string;
  rate: number;
  trials: number;
};

const TRIAL_GRANULARITIES: Array<{
  label: string;
  rangeLabel: string;
  value: IapTrialConversionGranularity;
}> = [
  { label: "Day", rangeLabel: "Last 14 days", value: "day" },
  { label: "Week", rangeLabel: "Last 12 weeks", value: "week" },
  { label: "Month", rangeLabel: "Last 12 months", value: "month" },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "No data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No data";
  return date.toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "processed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "failed") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (normalized === "ignored") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}

function TrialConversionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: TrialConversionDatum;
  }>;
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="min-w-[170px] rounded-lg border bg-background p-3 text-xs shadow-xl">
      <div className="font-semibold text-foreground">{data.label}</div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Free trials</span>
          <span className="font-semibold">{formatNumber(data.trials)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Continued</span>
          <span className="font-semibold">{formatNumber(data.continued)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Conversion</span>
          <span className="font-semibold">{formatPercent(data.rate)}</span>
        </div>
      </div>
    </div>
  );
}

const MOCK_TRIAL_CHART_DATA: Record<
  IapTrialConversionGranularity,
  TrialConversionDatum[]
> = {
  day: [
    { continued: 4, label: "17 Jun", rate: 44.4, trials: 9 },
    { continued: 5, label: "18 Jun", rate: 45.5, trials: 11 },
    { continued: 7, label: "19 Jun", rate: 53.8, trials: 13 },
    { continued: 6, label: "20 Jun", rate: 46.2, trials: 13 },
    { continued: 8, label: "21 Jun", rate: 57.1, trials: 14 },
    { continued: 7, label: "22 Jun", rate: 50.0, trials: 14 },
    { continued: 9, label: "23 Jun", rate: 56.3, trials: 16 },
    { continued: 10, label: "24 Jun", rate: 58.8, trials: 17 },
    { continued: 12, label: "25 Jun", rate: 63.2, trials: 19 },
    { continued: 11, label: "26 Jun", rate: 55.0, trials: 20 },
    { continued: 13, label: "27 Jun", rate: 61.9, trials: 21 },
    { continued: 14, label: "28 Jun", rate: 63.6, trials: 22 },
    { continued: 16, label: "29 Jun", rate: 66.7, trials: 24 },
    { continued: 17, label: "30 Jun", rate: 68.0, trials: 25 },
  ],
  month: [
    { continued: 18, label: "Jan", rate: 42.9, trials: 42 },
    { continued: 24, label: "Feb", rate: 46.2, trials: 52 },
    { continued: 31, label: "Mar", rate: 50.8, trials: 61 },
    { continued: 29, label: "Apr", rate: 47.5, trials: 61 },
    { continued: 38, label: "May", rate: 55.1, trials: 69 },
    { continued: 44, label: "Jun", rate: 57.9, trials: 76 },
  ],
  week: [
    { continued: 18, label: "14 Apr - 20 Apr", rate: 43.9, trials: 41 },
    { continued: 22, label: "21 Apr - 27 Apr", rate: 46.8, trials: 47 },
    { continued: 24, label: "28 Apr - 04 May", rate: 47.1, trials: 51 },
    { continued: 29, label: "05 May - 11 May", rate: 52.7, trials: 55 },
    { continued: 31, label: "12 May - 18 May", rate: 53.4, trials: 58 },
    { continued: 34, label: "19 May - 25 May", rate: 55.7, trials: 61 },
    { continued: 33, label: "26 May - 01 Jun", rate: 51.6, trials: 64 },
    { continued: 37, label: "02 Jun - 08 Jun", rate: 55.2, trials: 67 },
    { continued: 41, label: "09 Jun - 15 Jun", rate: 58.6, trials: 70 },
    { continued: 43, label: "16 Jun - 22 Jun", rate: 58.1, trials: 74 },
    { continued: 48, label: "23 Jun - 29 Jun", rate: 61.5, trials: 78 },
    { continued: 52, label: "30 Jun - 06 Jul", rate: 64.2, trials: 81 },
  ],
};

function TrialConversionAreaChart({ data }: { data: TrialConversionDatum[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[230px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No free-trial transactions yet.
      </div>
    );
  }

  return (
    <div className="h-[230px]">
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={data} margin={{ bottom: 4, left: 0, right: 12, top: 16 }}>
          <defs>
            <linearGradient id="trialStartsFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.32} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="trialContinuedFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
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
            minTickGap={18}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(value) => compactNumber(Number(value))}
            tickLine={false}
            width={34}
          />
          <Tooltip
            content={<TrialConversionTooltip />}
            cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
          />
          <Area
            activeDot={{ r: 4 }}
            dataKey="trials"
            dot={false}
            fill="url(#trialStartsFill)"
            name="Free trials"
            stroke="#2563eb"
            strokeWidth={3}
            type="natural"
          />
          <Area
            activeDot={{ r: 4 }}
            dataKey="continued"
            dot={false}
            fill="url(#trialContinuedFill)"
            name="Continued"
            stroke="#10b981"
            strokeWidth={3}
            type="natural"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IosTrialAnalyticsPanel({
  analytics,
  onInspectPayload,
}: {
  analytics: IapTrialConversionAnalytics;
  onInspectPayload: (payload: unknown) => void;
}) {
  const [events, setEvents] = useState(analytics.recentNotificationEvents);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);
  const [granularity, setGranularity] =
    useState<IapTrialConversionGranularity>("month");
  const selectedGranularity = TRIAL_GRANULARITIES.find(
    (item) => item.value === granularity,
  );
  const cohorts =
    analytics.cohortsByGranularity?.[granularity] ?? analytics.cohorts;
  const realTrialChartData = cohorts.map((cohort) => ({
    continued: cohort.converted,
    label: cohort.label,
    rate: cohort.conversionRate,
    trials: cohort.trialStarted,
  }));
  const hasRealTrialData = realTrialChartData.length > 0;
  const trialChartData = hasRealTrialData
    ? realTrialChartData
    : MOCK_TRIAL_CHART_DATA[granularity];

  async function retryEvent(event: IapNotificationEventDto) {
    setRetryingEventId(event.id);

    try {
      const response = await fetch("/api/admin/ios-iap-notifications/retry", {
        body: JSON.stringify({ eventId: event.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as RetryPayload;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Retry notification failed.");
      }

      setEvents((current) =>
        current.map((item) =>
          item.id === event.id
            ? {
                ...item,
                processedAt: new Date().toISOString(),
                status: payload.status ?? "processed",
              }
            : item,
        ),
      );
      void showToast("success", "Notification retry completed.");
    } catch (error) {
      void showToast(
        "error",
        error instanceof Error ? error.message : "Retry notification failed.",
      );
    } finally {
      setRetryingEventId(null);
    }
  }

  return (
    <section className="grid shrink-0 grid-cols-1 gap-4 xl:grid-cols-12">
      <div className="xl:col-span-8 rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-base font-semibold">
                Free Trial vs Continued Usage
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Statistical comparison of free-trial starts and users who keep
                using the subscription after the trial period.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!hasRealTrialData ? (
                <Badge
                  variant="outline"
                  className="border-blue-200 bg-blue-50 text-blue-700"
                >
                  Mock data
                </Badge>
              ) : null}
              <div className="inline-flex w-fit rounded-lg border bg-muted/30 p-1">
                {TRIAL_GRANULARITIES.map((item) => (
                  <Button
                    className="h-8 px-3 text-xs"
                    key={item.value}
                    onClick={() => setGranularity(item.value)}
                    size="sm"
                    type="button"
                    variant={
                      granularity === item.value ? "default" : "ghost"
                    }
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">
                Trial continuation cohorts
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {selectedGranularity?.rangeLabel ?? "Trial cohort timeline"}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {hasRealTrialData
                ? `${formatNumber(analytics.notConvertedCount)} not converted`
                : "Mock preview"}
            </div>
          </div>
          <TrialConversionAreaChart data={trialChartData} />
        </div>
      </div>

      <div className="xl:col-span-4 rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold">App Store Notifications</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Recent webhook events for this app.
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-2 text-muted-foreground">
              <Bell size={16} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">Processed</div>
              <div className="mt-1 font-semibold">
                {formatNumber(analytics.processedNotificationCount)}
              </div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">Ignored</div>
              <div className="mt-1 font-semibold">
                {formatNumber(analytics.ignoredNotificationCount)}
              </div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">Failed</div>
              <div className="mt-1 font-semibold">
                {formatNumber(analytics.failedNotificationCount)}
              </div>
            </div>
          </div>
        </div>
        <div className="max-h-[330px] space-y-2 overflow-auto p-4">
          {events.length ? (
            events.map((event) => (
              <div key={event.id} className="rounded-lg border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {titleCase(event.notificationType)}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3 size={12} />
                      {formatDate(event.receivedAt)}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass(event.status)}
                  >
                    {titleCase(event.status)}
                  </Badge>
                </div>
                {event.errorMessage ? (
                  <div className="mt-2 line-clamp-2 text-xs text-red-600">
                    {event.errorMessage}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    className="h-8 gap-1.5 px-2.5"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onInspectPayload({
                        decodedPayload: event.decodedPayload,
                        errorMessage: event.errorMessage,
                        rawPayload: event.rawPayload,
                      })
                    }
                  >
                    <FileJson size={13} />
                    JSON
                  </Button>
                  {event.status === "failed" ? (
                    <Button
                      className="h-8 gap-1.5 px-2.5"
                      disabled={retryingEventId === event.id}
                      size="sm"
                      variant="outline"
                      onClick={() => void retryEvent(event)}
                    >
                      <RotateCcw size={13} />
                      Retry
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No notification events yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
