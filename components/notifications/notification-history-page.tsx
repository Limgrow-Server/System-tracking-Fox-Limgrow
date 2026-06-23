"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, History, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader, StatusBadge, TableEmptyState } from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime } from "@/lib/tracking/format";
import type { NotificationsPageData } from "@/lib/tracking/page-data";
import type { NotificationEvent } from "@/lib/tracking/types";
import { cn } from "@/lib/utils";

import {
  ALL_FILTER_VALUE,
  DeliveryDashboard,
  PlatformIcon,
  RecordFilterControls,
  jobFailedCount,
  jobMatchesApp,
  jobRequestedCount,
  jobSuccessRate,
  notificationImpressionEventCount,
  notificationOpenEventCount,
  notificationReceivedEventCount,
  notificationUniqueImpressionCount,
  notificationUniqueOpenCount,
  notificationUniqueReceivedCount,
  numberLabel,
  platformLabel,
  rateLabel,
  valuesMatchSearch,
} from "./shared";

export function NotificationHistoryPage({
  data,
  historyJobId,
  initialAppId,
}: {
  data: NotificationsPageData;
  historyJobId?: string;
  initialAppId?: string;
}) {
  const router = useRouter();
  const platformApps = useMemo(() => data.storeMappings, [data.storeMappings]);
  const resolvedInitialAppId = platformApps.find((app) => app.id === initialAppId)?.id ?? "";
  const [recordSearch, setRecordSearch] = useState("");
  const [recordAppFilter, setRecordAppFilter] = useState(resolvedInitialAppId || ALL_FILTER_VALUE);
  const [recordStoreFilter, setRecordStoreFilter] = useState(ALL_FILTER_VALUE);

  const storeFilterOptions = useMemo(
    () =>
      Array.from(new Set(platformApps.flatMap((app) => (app.store_account_name ? [app.store_account_name] : []))))
        .sort((first, second) => first.localeCompare(second)),
    [platformApps]
  );

  const historyListJobs = useMemo(() => {
    const filterApp = recordAppFilter === ALL_FILTER_VALUE
      ? null
      : platformApps.find((app) => app.id === recordAppFilter) ?? null;

    return data.notificationJobs.filter((job) => {
      if (filterApp && !jobMatchesApp(job, filterApp)) return false;
      if (recordStoreFilter !== ALL_FILTER_VALUE && job.store_account_name !== recordStoreFilter) return false;
      return valuesMatchSearch([
        job.app_name,
        job.app_id,
        job.store_account_name,
        job.package_name,
        job.bundle_id,
        job.platform,
        job.status,
        job.topic_base,
        job.id,
      ], recordSearch);
    });
  }, [data.notificationJobs, platformApps, recordAppFilter, recordSearch, recordStoreFilter]);

  const eventsByJobId = useMemo(() => {
    const byJobId = new Map<string, NotificationEvent[]>();
    data.notificationEvents.forEach((event) => {
      if (!event.job_id) return;
      const current = byJobId.get(event.job_id) ?? [];
      current.push(event);
      byJobId.set(event.job_id, current);
    });
    return byJobId;
  }, [data.notificationEvents]);

  const historyDetailJob = historyJobId ? data.notificationJobs.find((job) => job.id === historyJobId) ?? null : null;
  const historyDetailEvents = historyDetailJob ? data.notificationEvents.filter((event) => event.job_id === historyDetailJob.id) : [];
  const historyDetailRequested = historyDetailJob ? jobRequestedCount(historyDetailJob) : 0;
  const historyDetailFailed = historyDetailJob ? jobFailedCount(historyDetailJob) : 0;
  const historyDetailSent = historyDetailJob ? Math.max(0, historyDetailJob.sent_count) : 0;
  const historyDetailReceived = notificationUniqueReceivedCount(historyDetailEvents);
  const historyDetailOpened = notificationUniqueOpenCount(historyDetailEvents);
  const historyDetailImpressions = notificationUniqueImpressionCount(historyDetailEvents);
  const historyDetailReceivedEvents = notificationReceivedEventCount(historyDetailEvents);
  const historyDetailOpenEvents = notificationOpenEventCount(historyDetailEvents);
  const historyDetailImpressionEvents = notificationImpressionEventCount(historyDetailEvents);

  const pageTitle = historyJobId ? "Notification detail" : "Notification history";
  const pageDescription = historyJobId
    ? "Delivery dashboard for one send job."
    : "Review send history as a table, then open a row for the delivery dashboard.";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Messaging"
        title={pageTitle}
        description={pageDescription}
      />

      {!historyJobId ? (
        <section className="overflow-hidden rounded-xl border bg-background shadow-sm shadow-slate-200/50">
          <div className="space-y-3 border-b bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 font-heading text-base font-semibold">
                  <History size={17} />
                  Send history
                </div>
                <div className="text-sm text-muted-foreground">
                  {historyListJobs.length} send job(s). Open a row to view the dashboard.
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
                <RefreshCw size={15} />
                Refresh
              </Button>
            </div>
            <RecordFilterControls
              apps={platformApps}
              appFilter={recordAppFilter}
              onAppFilterChange={setRecordAppFilter}
              onSearchChange={setRecordSearch}
              onStoreFilterChange={setRecordStoreFilter}
              placeholder="Search job, app, package, bundle, store..."
              search={recordSearch}
              storeFilter={recordStoreFilter}
              stores={storeFilterOptions}
            />
          </div>
          <div className="overflow-auto">
            <Table className="min-w-[1220px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead className="w-28">Sent</TableHead>
                  <TableHead className="w-32">Received</TableHead>
                  <TableHead className="w-32">Opened</TableHead>
                  <TableHead className="w-36">Impressions</TableHead>
                  <TableHead className="w-28">Failed</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-40">Sent date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyListJobs.length ? (
                  historyListJobs.map((job) => {
                    const requested = jobRequestedCount(job);
                    const failed = jobFailedCount(job);
                    const sent = Math.max(0, job.sent_count);
                    const jobEvents = eventsByJobId.get(job.id) ?? [];
                    const received = notificationUniqueReceivedCount(jobEvents);
                    const receivedEvents = notificationReceivedEventCount(jobEvents);
                    const opened = notificationUniqueOpenCount(jobEvents);
                    const openEvents = notificationOpenEventCount(jobEvents);
                    const impressions = notificationUniqueImpressionCount(jobEvents);
                    const impressionEvents = notificationImpressionEventCount(jobEvents);

                    return (
                      <TableRow
                        key={job.id}
                        className="cursor-pointer transition-colors hover:bg-muted/45"
                        onClick={() => router.push(`/notifications/history/${job.id}`)}
                      >
                        <TableCell className="max-w-96">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate font-medium">{job.app_name}</div>
                            <Badge variant="secondary" className="h-6 shrink-0 gap-1.5 rounded-md px-2 text-xs">
                              <PlatformIcon platform={job.platform} />
                              {platformLabel(job.platform)}
                            </Badge>
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {job.app_id ?? job.package_name ?? job.bundle_id ?? job.topic_base}
                          </div>
                          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">Job {job.id}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-lg font-semibold tabular-nums text-blue-700">{numberLabel(sent)}</div>
                          <div className="text-xs text-muted-foreground">of {numberLabel(requested)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-lg font-semibold tabular-nums text-sky-700">{numberLabel(receivedEvents)}</div>
                          <div className="text-xs text-muted-foreground">{numberLabel(received)} token(s)</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-lg font-semibold tabular-nums text-violet-700">{numberLabel(openEvents)}</div>
                          <div className="text-xs text-muted-foreground">{numberLabel(opened)} token(s)</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-lg font-semibold tabular-nums text-amber-700">{numberLabel(impressionEvents)}</div>
                          <div className="text-xs text-muted-foreground">{numberLabel(impressions)} token(s)</div>
                        </TableCell>
                        <TableCell>
                          <div className={cn("font-mono text-lg font-semibold tabular-nums", failed ? "text-rose-700" : "text-muted-foreground")}>
                            {numberLabel(failed)}
                          </div>
                          <div className="text-xs text-muted-foreground">{rateLabel(jobSuccessRate(job))} success</div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={job.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{dateTime(job.sent_at ?? job.created_at)}</TableCell>
                        <TableCell>
                          <ChevronRight size={16} className="text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableEmptyState colSpan={9} icon={History} title="No send jobs" description="Send attempts will appear here after a notification is sent." />
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {historyJobId ? (
        <div className="space-y-4">
          <Button type="button" variant="outline" size="sm" onClick={() => router.push("/notifications/history")}>
            <ArrowLeft size={15} />
            Back to history
          </Button>

          {historyDetailJob ? (
            <>
              <section className="overflow-hidden rounded-xl border bg-background shadow-sm shadow-slate-200/50">
                <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-lg font-semibold">{historyDetailJob.app_name}</h2>
                      <StatusBadge status={historyDetailJob.status} />
                      <Badge variant="secondary" className="h-6 gap-1.5 rounded-md px-2 text-xs">
                        <PlatformIcon platform={historyDetailJob.platform} />
                        {platformLabel(historyDetailJob.platform)}
                      </Badge>
                    </div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">
                      {historyDetailJob.package_name ?? historyDetailJob.bundle_id ?? historyDetailJob.topic_base}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">Job {historyDetailJob.id}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4 xl:grid-cols-7">
                    <div className="rounded-md bg-muted/35 p-3">
                      <div className="text-xs text-muted-foreground">Requested</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{historyDetailRequested}</div>
                    </div>
                    <div className="rounded-md bg-blue-50 p-3 text-blue-700">
                      <div className="text-xs">Sent</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{historyDetailSent}</div>
                    </div>
                    <div className="rounded-md bg-sky-50 p-3 text-sky-700">
                      <div className="text-xs">Received</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{historyDetailReceivedEvents}</div>
                      <div className="mt-0.5 text-[11px] opacity-75">{historyDetailReceived} token(s)</div>
                    </div>
                    <div className="rounded-md bg-amber-50 p-3 text-amber-700">
                      <div className="text-xs">Impressions</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{historyDetailImpressionEvents}</div>
                      <div className="mt-0.5 text-[11px] opacity-75">{historyDetailImpressions} token(s)</div>
                    </div>
                    <div className="rounded-md bg-rose-50 p-3 text-rose-700">
                      <div className="text-xs">Failed</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{historyDetailFailed}</div>
                    </div>
                    <div className="rounded-md bg-violet-50 p-3 text-violet-700">
                      <div className="text-xs">Opened</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{historyDetailOpenEvents}</div>
                      <div className="mt-0.5 text-[11px] opacity-75">{historyDetailOpened} token(s)</div>
                    </div>
                    <div className="rounded-md bg-emerald-50 p-3 text-emerald-700">
                      <div className="text-xs">Rate</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{rateLabel(jobSuccessRate(historyDetailJob))}</div>
                    </div>
                  </div>
                </div>
              </section>

              <DeliveryDashboard
                events={historyDetailEvents}
                jobs={[historyDetailJob]}
              />
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>History job not found</CardTitle>
                <CardDescription>The selected notification job no longer exists or is outside the loaded history range.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
