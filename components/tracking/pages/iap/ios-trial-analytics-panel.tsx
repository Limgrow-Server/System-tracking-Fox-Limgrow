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

export type IosTrialAnalyticsPanelProps = {
  analytics: IapTrialConversionAnalytics;
  onInspectPayload: (payload: unknown) => void;
  onRefresh?: () => Promise<void> | void;
  refreshing?: boolean;
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

function renewalStatusBadgeClass(status: "enabled" | "disabled") {
  if (status === "enabled") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function renewalStatusLabel(status: "enabled" | "disabled") {
  return status === "enabled" ? "Renew enabled" : "Renew disabled";
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
  onRefresh,
  refreshing = false,
}: IosTrialAnalyticsPanelProps) {
  const [eventOverrides, setEventOverrides] = useState<
    Record<string, Partial<IapNotificationEventDto>>
  >({});
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
  const trialChartData = realTrialChartData;
  const events = analytics.recentNotificationEvents.map((event) => ({
    ...event,
    ...(eventOverrides[event.id] ?? {}),
  }));

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

      setEventOverrides((current) => ({
        ...current,
        [event.id]: {
          processedAt: new Date().toISOString(),
          status: payload.status ?? "processed",
        },
      }));
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
              {formatNumber(analytics.notConvertedCount)} not converted
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
            <div className="flex items-center gap-2">
              {onRefresh ? (
                <Button
                  className="h-8 gap-1.5 px-2.5"
                  disabled={refreshing}
                  onClick={() => void onRefresh()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw
                    className={refreshing ? "animate-spin" : undefined}
                    size={13}
                  />
                  Refresh
                </Button>
              ) : null}
              <div className="rounded-md border bg-muted/30 p-2 text-muted-foreground">
                <Bell size={16} />
              </div>
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
                    {event.subtype ? (
                      <div className="mt-1 max-w-[220px] truncate text-xs font-medium text-muted-foreground">
                        {titleCase(event.subtype)}
                      </div>
                    ) : null}
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
                {event.renewalStatus ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={renewalStatusBadgeClass(event.renewalStatus)}
                    >
                      {renewalStatusLabel(event.renewalStatus)}
                    </Badge>
                    {event.renewalDate ? (
                      <span className="text-xs text-muted-foreground">
                        Renews: {formatDate(event.renewalDate)}
                      </span>
                    ) : null}
                    {event.renewalProductId ? (
                      <span className="max-w-[180px] truncate text-xs text-muted-foreground">
                        {event.renewalProductId}
                      </span>
                    ) : null}
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
