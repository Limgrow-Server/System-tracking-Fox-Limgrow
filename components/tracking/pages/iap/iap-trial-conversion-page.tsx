"use client";

import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  RefreshCw,
  TimerReset,
  TriangleAlert,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { showToast } from "@/lib/client/toast";
import { cn } from "@/lib/utils";
import type {
  IapTrialConversionGranularity,
  IapTrialConversionPageData,
  IapTwoHourConversionCohort,
} from "@/lib/tracking/page-data";
import { IapAppContextHeader } from "./iap-app-context-header";

type OverviewPayload = IapTrialConversionPageData & {
  error?: string;
  success?: boolean;
};

const GRANULARITIES: Array<{
  label: string;
  value: IapTrialConversionGranularity;
}> = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "Not checked yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked yet";
  return date.toLocaleString("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function MetricCard({
  description,
  icon,
  title,
  value,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-muted-foreground">
            {title}
          </div>
          <div className="mt-2 font-heading text-2xl font-semibold tracking-tight">
            {value}
          </div>
        </div>
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
          {icon}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function CohortTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: IapTwoHourConversionCohort }>;
}) {
  const cohort = payload?.[0]?.payload;
  if (!active || !cohort) return null;

  return (
    <div className="min-w-48 rounded-lg border bg-background p-3 text-xs shadow-xl">
      <div className="font-semibold">{cohort.label}</div>
      <div className="mt-2 space-y-1.5 text-muted-foreground">
        <div className="flex justify-between gap-5">
          <span>Verified free trials</span>
          <strong className="text-foreground">{formatNumber(cohort.sent)}</strong>
        </div>
        <div className="flex justify-between gap-5">
          <span>Eligible after 3d</span>
          <strong className="text-foreground">
            {formatNumber(cohort.eligible)}
          </strong>
        </div>
        <div className="flex justify-between gap-5">
          <span>Confirmed paid</span>
          <strong className="text-foreground">
            {formatNumber(cohort.confirmedPaid)}
          </strong>
        </div>
        <div className="flex justify-between gap-5 border-t pt-1.5">
          <span>Actual conversion</span>
          <strong className="text-foreground">
            {formatPercent(cohort.conversionRate)}
          </strong>
        </div>
      </div>
    </div>
  );
}

function FunnelRow({
  color,
  count,
  denominator,
  label,
}: {
  color: string;
  count: number;
  denominator: number;
  label: string;
}) {
  const percentage = denominator > 0 ? (count / denominator) * 100 : 0;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatNumber(count)} · {formatPercent(percentage)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", color)}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
    </div>
  );
}

export function IapTrialConversionPage({
  data: initialData,
}: {
  data: IapTrialConversionPageData;
}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] =
    useState<IapTrialConversionGranularity>("week");
  const [loading, setLoading] = useState(false);
  const conversion = data.analytics?.twoHourConversion;

  async function loadOverview() {
    const mappingId = data.selectedApp?.mappingId;
    if (!mappingId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ mappingId });
      const response = await fetch(
        `/api/admin/iap/trial-conversion-overview?${params.toString()}`,
      );
      const payload = (await response.json()) as OverviewPayload;
      if (!response.ok || !payload.success || !Array.isArray(payload.apps)) {
        throw new Error(
          payload.error ?? "Load IAP trial conversion overview failed.",
        );
      }

      setData({
        analytics: payload.analytics ?? null,
        apps: payload.apps,
        selectedApp: payload.selectedApp ?? null,
      });
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Load IAP trial conversion overview failed.";
      setError(message);
      void showToast("error", message);
    } finally {
      setLoading(false);
    }
  }

  if (!data.selectedApp) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
        This application is not available for trial conversion analytics.
      </div>
    );
  }

  const cohorts = conversion?.cohortsByGranularity[granularity] ?? [];
  const sent =
    conversion?.trialCohortCount ?? conversion?.sentAfterTwoHoursCount ?? 0;
  const eligible = conversion?.eligibleForVerificationCount ?? 0;
  const checked = conversion?.checkedCount ?? 0;
  const paid = conversion?.confirmedPaidCount ?? 0;
  const waitingForMaturity = Math.max(0, sent - eligible);
  const dueBacklog = Math.max(0, eligible - checked);

  return (
    <div className="space-y-5" aria-busy={loading}>
      <IapAppContextHeader
        activeTab="trial-conversion"
        app={data.selectedApp}
      />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <TrendingUp size={14} />
            IAP analytics
          </div>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Free-trial conversion
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Measures confirmed paid renewals against verified Apple free-trial
            subscriptions after the 3-day confirmation window.
          </p>
        </div>

        <Button
          className="h-10 gap-2 self-start lg:self-auto"
          disabled={loading}
          onClick={() => void loadOverview()}
          variant="outline"
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} size={15} />
          Refresh
        </Button>
      </header>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <TriangleAlert className="mt-0.5 shrink-0" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {!conversion ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Conversion cohort data is not available from the backend yet. Deploy
          the latest API and run the database migration first.
        </div>
      ) : (
        <>
          <section
            className={cn(
              "grid gap-3 transition-opacity sm:grid-cols-2 xl:grid-cols-4",
              loading && "opacity-55",
            )}
          >
            <MetricCard
              description="Unique production free-trial subscription chains verified by Apple and scheduled for confirmation."
              icon={<TimerReset size={17} />}
              title="Verified free trials"
              value={formatNumber(sent)}
            />
            <MetricCard
              description={`${waitingForMaturity.toLocaleString("vi-VN")} cohort(s) are still inside the ${conversion.verificationDelayHours}-hour wait window.`}
              icon={<CalendarClock size={17} />}
              title="Eligible for 3-day check"
              value={formatNumber(eligible)}
            />
            <MetricCard
              description="A positive paid transaction was found in the same Apple subscription chain after trial expiry."
              icon={<CircleDollarSign size={17} />}
              title="Confirmed paid"
              value={formatNumber(paid)}
            />
            <MetricCard
              description="Confirmed paid divided by every unique verified free-trial subscription."
              icon={<BadgeCheck size={17} />}
              title="Actual conversion"
              value={formatPercent(conversion.conversionRate)}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-12">
            <div className="rounded-lg border bg-card xl:col-span-5">
              <div className="border-b p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-heading text-base font-semibold">
                      Verification funnel
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      One subscription chain is counted once.
                    </p>
                  </div>
                  <Badge variant="outline">
                    {formatPercent(conversion.maturedConversionRate)} mature rate
                  </Badge>
                </div>
              </div>
              <div className="space-y-5 p-4">
                <FunnelRow
                  color="bg-slate-700 dark:bg-slate-300"
                  count={sent}
                  denominator={sent}
                  label="Verified free trials"
                />
                <FunnelRow
                  color="bg-blue-500"
                  count={eligible}
                  denominator={sent}
                  label="Reached 3-day checkpoint"
                />
                <FunnelRow
                  color="bg-emerald-500"
                  count={paid}
                  denominator={sent}
                  label="Confirmed real charge"
                />

                <div className="grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Checked</div>
                    <div className="mt-1 font-semibold tabular-nums">
                      {formatNumber(checked)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">No charge found</div>
                    <div className="mt-1 font-semibold tabular-nums">
                      {formatNumber(conversion.notConvertedCount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Due backlog</div>
                    <div className="mt-1 font-semibold tabular-nums">
                      {formatNumber(dueBacklog)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Failed checks</div>
                    <div className="mt-1 font-semibold tabular-nums">
                      {formatNumber(conversion.checkFailedCount)}
                    </div>
                  </div>
                </div>
                <div className="text-xs leading-5 text-muted-foreground">
                  Last verification: {formatDate(conversion.lastCheckedAt)}
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-card xl:col-span-7">
              <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-heading text-base font-semibold">
                    Cohort trend
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Verified trial cohorts compared with confirmed paid renewals.
                  </p>
                </div>
                <div className="inline-flex w-fit rounded-lg border bg-muted/30 p-1">
                  {GRANULARITIES.map((item) => (
                    <Button
                      className="h-8 px-3 text-xs"
                      key={item.value}
                      onClick={() => setGranularity(item.value)}
                      size="sm"
                      variant={granularity === item.value ? "default" : "ghost"}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="p-4">
                {cohorts.length ? (
                  <div className="h-72">
                    <ResponsiveContainer height="100%" width="100%">
                      <BarChart data={cohorts} barGap={4}>
                        <CartesianGrid
                          stroke="hsl(var(--border))"
                          strokeDasharray="4 6"
                          vertical={false}
                        />
                        <XAxis
                          axisLine={false}
                          dataKey="label"
                          minTickGap={18}
                          tick={{
                            fill: "hsl(var(--muted-foreground))",
                            fontSize: 11,
                          }}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          axisLine={false}
                          tick={{
                            fill: "hsl(var(--muted-foreground))",
                            fontSize: 11,
                          }}
                          tickLine={false}
                          width={34}
                        />
                        <Tooltip content={<CohortTooltip />} />
                        <Legend
                          iconType="circle"
                          wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
                        />
                        <Bar
                          dataKey="sent"
                          fill="#64748b"
                          name="Verified trials"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="confirmedPaid"
                          fill="#10b981"
                          name="Confirmed paid"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 flex-col items-center justify-center rounded-lg border border-dashed text-center">
                    <TimerReset className="text-muted-foreground" size={24} />
                    <div className="mt-3 text-sm font-medium">
                      No verified trial cohort yet
                    </div>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                      Data appears after Apple verifies a production free trial
                      and schedules its 3-day confirmation.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card">
            <div className="border-b p-4">
              <h2 className="font-heading text-base font-semibold">
                How this number is calculated
              </h2>
            </div>
            <div className="grid gap-4 p-4 text-sm md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
              <div>
                <div className="font-medium">1. Verify the free trial</div>
                <p className="mt-1 leading-5 text-muted-foreground">
                  Apple verification must identify a production free trial.
                  Direct purchases and sandbox transactions are excluded.
                </p>
              </div>
              <ArrowRight className="hidden text-muted-foreground md:block" size={18} />
              <div>
                <div className="font-medium">2. Reconcile after 3 days</div>
                <p className="mt-1 leading-5 text-muted-foreground">
                  The worker refreshes Apple notification history and checks the
                  same subscription chain.
                </p>
              </div>
              <ArrowRight className="hidden text-muted-foreground md:block" size={18} />
              <div>
                <div className="font-medium">3. Confirm a real charge</div>
                <p className="mt-1 leading-5 text-muted-foreground">
                  A later non-trial transaction with a positive amount after
                  trial expiry counts as paid conversion.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
