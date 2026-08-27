"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, BarChart3, ChevronRight, Eye, History, MessageSquareText, Pause, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/client/toast";

import {
  PageHeader,
  StatusBadge,
  TableEmptyState,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime } from "@/lib/tracking/format";
import type { NotificationsPageData, PaginationMeta } from "@/lib/tracking/page-data";
import type { NotificationEvent, NotificationJob, StoreMapping } from "@/lib/tracking/types";
import { cn } from "@/lib/utils";

import {
  ALL_FILTER_VALUE,
  PlatformBadge,
  RecordFilterControls,
  jobFailedCount,
  jobRequestedCount,
  jobSuccessRate,
  localePayloadForRows,
  localeRowsFromPayload,
  notificationJobCompletionPercent,
  notificationJobBadgeStatus,
  notificationImpressionEventCount,
  notificationOpenEventCount,
  notificationReceivedEventCount,
  notificationUniqueOpenCount,
  numberLabel,
  primaryLocaleRow,
  rateLabel,
} from "./shared";
import type { HistoryJobBarChartProps } from "./notification-charts";

const HistoryJobBarChart = dynamic<HistoryJobBarChartProps>(
  () => import("./notification-charts").then((mod) => mod.HistoryJobBarChart),
  {
    loading: () => <div className="h-full w-full animate-pulse rounded-md bg-muted" />,
    ssr: false,
  },
);

type SentContent = {
  message: string;
  title: string;
  topicCode: string | null;
};

type DeliveryRow = {
  content: SentContent;
  event: NotificationEvent;
  events: NotificationEvent[];
  fcmErrorCode: string | null;
  invalidToken: boolean;
  metadata: Record<string, unknown>;
  status: "failed" | "impression" | "opened" | "received" | "sent";
  topicCode: string | null;
};

type HistoryJobsResponse = {
  data?: NotificationJob[];
  error?: string;
  page?: number;
  pageSize?: number;
  storeMappings?: StoreMapping[];
  storeOptions?: string[];
  success?: boolean;
  total?: number;
  totalPages?: number;
};

type HistoryEventsResponse = {
  data?: NotificationEvent[];
  error?: string;
  notificationEvents?: NotificationEvent[];
  notificationJobs?: NotificationJob[];
  page?: number;
  pageSize?: number;
  success?: boolean;
  total?: number;
  totalPages?: number;
};

type HistoryJobActionResponse = {
  error?: string;
  job?: NotificationJob;
  ok?: boolean;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function metadataString(event: NotificationEvent, key: string) {
  const value = metadataRecord(event.metadata)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function eventLogDetail(event: NotificationEvent) {
  const fcmErrorCode = metadataString(event, "fcmErrorCode") ?? event.error_code;
  if (fcmErrorCode === "THIRD_PARTY_AUTH_ERROR") {
    return "Thiếu hoặc sai APNs Auth Key/Certificate trong Firebase project của iOS app.";
  }
  if (fcmErrorCode === "UNREGISTERED") return "Người dùng đã tắt thông báo.";

  return event.error_detail
    ?? event.error_code
    ?? fcmErrorCode
    ?? event.provider_message_id
    ?? "No log detail";
}

function eventText(event: NotificationEvent) {
  return [event.event_type, event.status, event.error_code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function eventDeliveryStatus(event: NotificationEvent): DeliveryRow["status"] {
  const text = eventText(event);
  if (text.includes("open") || text.includes("click") || text.includes("tap")) {
    return "opened";
  }
  if (text.includes("impression") || text.includes("display") || text.includes("shown")) {
    return "impression";
  }
  if (text.includes("received") || text.includes("delivered")) {
    return "received";
  }
  if (
    text.includes("fail") ||
    text.includes("error") ||
    Boolean(event.error_code) ||
    Boolean(event.error_detail)
  ) {
    return "failed";
  }

  return "sent";
}

function deliveryStatusRank(status: DeliveryRow["status"]) {
  if (status === "opened") return 5;
  if (status === "impression") return 4;
  if (status === "received") return 3;
  if (status === "failed") return 2;
  return 1;
}

function newerEvent(left: NotificationEvent, right: NotificationEvent) {
  return new Date(right.created_at).getTime() > new Date(left.created_at).getTime()
    ? right
    : left;
}

function betterDeliveryEvent(left: NotificationEvent, right: NotificationEvent) {
  const leftStatus = eventDeliveryStatus(left);
  const rightStatus = eventDeliveryStatus(right);
  const leftRank = deliveryStatusRank(leftStatus);
  const rightRank = deliveryStatusRank(rightStatus);

  if (rightRank > leftRank) return right;
  if (rightRank < leftRank) return left;
  return newerEvent(left, right);
}

function sentContentForTopic(
  rows: Array<{ message: string; title: string; topicCode: string }>,
  job: NotificationJob,
  topicCode: string | null
): SentContent {
  const normalizedTopicCode = topicCode?.trim().toLowerCase() || null;
  const matched = normalizedTopicCode ? rows.find((row) => row.topicCode === normalizedTopicCode) : null;
  const primary = primaryLocaleRow(rows);
  const row = matched ?? primary;

  return {
    message: row?.message || job.message || "No content",
    title: row?.title || job.title || "Untitled notification",
    topicCode: row?.topicCode ?? normalizedTopicCode,
  };
}

function metadataJson(metadata: Record<string, unknown>) {
  const keys = Object.keys(metadata);
  return keys.length ? JSON.stringify(metadata, null, 2) : "{}";
}

function deliveryRowKey(row: DeliveryRow) {
  const clientEventId = metadataString(row.event, "clientEventId");
  if (clientEventId) return clientEventId;

  return [
    metadataString(row.event, "deviceTokenId"),
    row.event.device_id,
    row.event.provider_message_id,
    row.event.target_value,
    row.event.id,
  ].find((value) => value && value.trim())!;
}

function notificationJobControlAction(job: NotificationJob): "pause" | "resume" | null {
  const status = notificationJobBadgeStatus(job);
  if (status === "paused" || job.status === "paused") return "resume";
  if (status === "processing" || ["queued", "retrying", "materializing", "processing"].includes(job.status)) {
    return "pause";
  }
  return null;
}

function mergeDeliveryRows(left: DeliveryRow, right: DeliveryRow): DeliveryRow {
  const event = betterDeliveryEvent(left.event, right.event);
  const source = event.id === right.event.id ? right : left;
  const events = [...left.events, ...right.events].sort(
    (first, second) =>
      new Date(second.created_at).getTime() - new Date(first.created_at).getTime(),
  );

  return {
    ...left,
    content: source.content,
    event,
    events,
    fcmErrorCode: source.fcmErrorCode ?? left.fcmErrorCode,
    invalidToken: left.invalidToken || right.invalidToken,
    metadata: source.metadata,
    status: eventDeliveryStatus(event),
    topicCode: source.topicCode ?? left.topicCode,
  };
}

function aggregateDeliveryRows(rows: DeliveryRow[]) {
  const byTarget = new Map<string, DeliveryRow>();

  for (const row of rows) {
    const key = deliveryRowKey(row);
    const current = byTarget.get(key);
    byTarget.set(key, current ? mergeDeliveryRows(current, row) : row);
  }

  return Array.from(byTarget.values()).sort(
    (first, second) =>
      new Date(second.event.created_at).getTime() -
      new Date(first.event.created_at).getTime(),
  );
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function niceChartMax(value: number) {
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  const step = value <= 50 ? 5 : value <= 100 ? 10 : 25;
  return Math.ceil(value / step) * step;
}

function HistoryJobDashboard({
  failed,
  impressions,
  opened,
  received,
  requested,
  rows,
  sent,
}: {
  failed: number;
  impressions: number;
  opened: number;
  received: number;
  requested: number;
  rows: DeliveryRow[];
  sent: number;
}) {
  const finalSent = rows.filter((row) => row.status === "sent").length;
  const finalReceived = rows.filter((row) => row.status === "received").length;
  const finalImpressions = rows.filter((row) => row.status === "impression").length;
  const finalOpened = rows.filter((row) => row.status === "opened").length;
  const finalFailed = rows.filter((row) => row.status === "failed").length;
  const totalTargets = Math.max(requested, rows.length, sent + failed);
  const bars = [
    { color: "#c7d137", label: "Requested", value: requested },
    { color: "#54b8be", label: "Sent", value: sent },
    { color: "#38bdf8", label: "Received", value: received },
    { color: "#e879f9", label: "Impressions", value: impressions },
    { color: "#f7b933", label: "Opened", value: opened },
    { color: "#8b73aa", label: "Failed", value: failed },
  ].map((item) => ({
    ...item,
    percent: percent(item.value, totalTargets),
  }));
  const maxBarValue = niceChartMax(Math.max(1, ...bars.map((item) => item.value)));
  const finalStatuses = [
    { label: "Sent", status: "sent", value: finalSent },
    { label: "Received", status: "received", value: finalReceived },
    { label: "Impressions", status: "impression", value: finalImpressions },
    { label: "Opened", status: "opened", value: finalOpened },
    { label: "Failed", status: "failed", value: finalFailed },
  ] as const;

  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="rounded-xl border bg-background">
        <div className="border-b bg-muted/20 p-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 size={16} />
            Delivery breakdown
          </CardTitle>
          <CardDescription className="text-xs">
            Send and mobile engagement events for this topic job.
          </CardDescription>
        </div>
        <div className="p-4">
          <div className="overflow-x-auto rounded-lg border bg-white p-4 shadow-inner dark:bg-background">
            <div className="h-[340px] min-w-[760px]">
              <HistoryJobBarChart bars={bars} maxBarValue={maxBarValue} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {finalStatuses.map((item) => (
          <div key={item.status} className="rounded-xl border bg-background p-4">
            <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
            <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
              {numberLabel(item.value)}
            </div>
            <div className="mt-2">
              <StatusBadge status={item.status} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function NotificationHistoryPage({
  data,
  deferInitialLoad = false,
  historyJobId,
  initialAppId,
}: {
  data: NotificationsPageData;
  deferInitialLoad?: boolean;
  historyJobId?: string;
  initialAppId?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const initialLoadStarted = useRef(false);
  const [storeMappings, setStoreMappings] = useState(data.storeMappings);
  const platformApps = useMemo(() => storeMappings, [storeMappings]);
  const resolvedInitialAppId = initialAppId ?? "";
  const [notificationJobs, setNotificationJobs] = useState(data.notificationJobs);
  const [notificationEvents, setNotificationEvents] = useState(
    data.notificationEvents,
  );
  const [deliveryEvents, setDeliveryEvents] = useState(
    data.notificationDeliveryEvents.length
      ? data.notificationDeliveryEvents
      : data.notificationEvents,
  );
  const [historyPagination, setHistoryPagination] = useState<PaginationMeta>(
    data.notificationPagination.historyJobs ?? {
      page: 1,
      pageSize: 10,
      total: data.notificationJobs.length,
      totalPages: 1,
    },
  );
  const [deliveryPagination, setDeliveryPagination] = useState<PaginationMeta>(
    data.notificationPagination.deliveryEvents ?? {
      page: 1,
      pageSize: 10,
      total: data.notificationDeliveryEvents.length || data.notificationEvents.length,
      totalPages: 1,
    },
  );
  const [storeFilterOptions, setStoreFilterOptions] = useState(
    data.notificationStoreOptions,
  );
  const [loadingHistoryJobs, setLoadingHistoryJobs] = useState(
    deferInitialLoad && !historyJobId,
  );
  const [loadingDeliveryEvents, setLoadingDeliveryEvents] = useState(false);
  const [recordSearch, setRecordSearch] = useState("");
  const [recordAppFilter, setRecordAppFilter] = useState(resolvedInitialAppId || ALL_FILTER_VALUE);
  const [recordStoreFilter, setRecordStoreFilter] = useState(ALL_FILTER_VALUE);
  const [selectedDeliveryEventId, setSelectedDeliveryEventId] = useState<string | null>(null);
  const [pendingHistoryJobId, setPendingHistoryJobId] = useState<string | null>(null);
  const [pendingHistoryJobActionId, setPendingHistoryJobActionId] = useState<string | null>(null);

  const canManageNotifications = data.canManageNotifications;
  const historyListJobs = notificationJobs;

  const historyDetailJob = historyJobId ? notificationJobs.find((job) => job.id === historyJobId) ?? null : null;
  const historyDetailEvents = useMemo(
    () => historyDetailJob ? notificationEvents.filter((event) => event.job_id === historyDetailJob.id) : [],
    [notificationEvents, historyDetailJob]
  );
  const historyDetailRequested = historyDetailJob ? jobRequestedCount(historyDetailJob) : 0;
  const historyDetailFailed = historyDetailJob ? jobFailedCount(historyDetailJob) : 0;
  const historyDetailSent = historyDetailJob ? Math.max(0, historyDetailJob.sent_count) : 0;
  const historyDetailOpened = notificationUniqueOpenCount(historyDetailEvents);
  const historyDetailOpenEvents = notificationOpenEventCount(historyDetailEvents);
  const historyDetailReceivedEvents = notificationReceivedEventCount(historyDetailEvents);
  const historyDetailImpressionEvents = notificationImpressionEventCount(historyDetailEvents);
  const historyDetailBadgeStatus = historyDetailJob ? notificationJobBadgeStatus(historyDetailJob) : null;
  const historyDetailControlAction = historyDetailJob && canManageNotifications
    ? notificationJobControlAction(historyDetailJob)
    : null;
  const historyContentRows = useMemo(
    () => historyDetailJob
      ? localePayloadForRows(localeRowsFromPayload(historyDetailJob.locale_payload, historyDetailJob.title ?? "", historyDetailJob.message ?? ""))
        .filter((row) => row.title || row.message)
      : [],
    [historyDetailJob]
  );
  const historyPrimaryContent = historyDetailJob
    ? sentContentForTopic(historyContentRows, historyDetailJob, null)
    : null;
  const historyDeliveryEvents = useMemo(
    () => deliveryEvents
      .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime()),
    [deliveryEvents]
  );
  const historyDeliveryRows: DeliveryRow[] = historyDetailJob
    ? aggregateDeliveryRows(historyDeliveryEvents.map((event) => {
      const metadata = metadataRecord(event.metadata);
      const topicCode = metadataString(event, "topicCode")
        ?? metadataString(event, "topic")
        ?? (event.target_type === "topic" ? event.target_value : null);

      return {
        content: sentContentForTopic(historyContentRows, historyDetailJob, topicCode),
        event,
        events: [event],
        fcmErrorCode: metadataString(event, "fcmErrorCode"),
        invalidToken: metadata.invalidToken === true,
        metadata,
        status: eventDeliveryStatus(event),
        topicCode,
      };
    }))
    : [];
  const selectedDeliveryRow = selectedDeliveryEventId
    ? historyDeliveryRows.find((row) => row.event.id === selectedDeliveryEventId) ?? null
    : null;

  async function loadHistoryJobsPage(
    page: number,
    overrides?: {
      appFilter?: string;
      search?: string;
      storeFilter?: string;
    },
  ) {
    const nextSearch = overrides?.search ?? recordSearch;
    const nextAppFilter = overrides?.appFilter ?? recordAppFilter;
    const nextStoreFilter = overrides?.storeFilter ?? recordStoreFilter;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "10",
    });

    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    if (nextAppFilter !== ALL_FILTER_VALUE) params.set("appId", nextAppFilter);
    if (nextStoreFilter !== ALL_FILTER_VALUE) params.set("store", nextStoreFilter);

    setLoadingHistoryJobs(true);

    try {
      const response = await fetch(
        `/api/admin/notifications/history-jobs?${params.toString()}`,
      );
      const payload = (await response.json()) as HistoryJobsResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Notification history could not be loaded.");
      }

      setNotificationJobs(payload.data);
      if (payload.storeMappings) setStoreMappings(payload.storeMappings);
      setHistoryPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 10,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
      if (payload.storeOptions) setStoreFilterOptions(payload.storeOptions);
    } catch (error) {
      void showToast("error",
        error instanceof Error
          ? error.message
          : "Notification history could not be loaded.",
      );
    } finally {
      setLoadingHistoryJobs(false);
    }
  }

  async function loadDeliveryEventsPage(page: number) {
    if (!historyJobId) return;

    const params = new URLSearchParams({
      jobId: historyJobId,
      page: String(page),
      pageSize: "10",
    });

    setLoadingDeliveryEvents(true);

    try {
      const response = await fetch(
        `/api/admin/notifications/history-events?${params.toString()}`,
      );
      const payload = (await response.json()) as HistoryEventsResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Delivery events could not be loaded.");
      }

      setDeliveryEvents(payload.data);
      if (payload.notificationEvents) setNotificationEvents(payload.notificationEvents);
      if (payload.notificationJobs) setNotificationJobs(payload.notificationJobs);
      setDeliveryPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 10,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "Delivery events could not be loaded.",
      );
    } finally {
      setLoadingDeliveryEvents(false);
    }
  }

  function updateHistoryJob(job: NotificationJob) {
    setNotificationJobs((current) => current.map((item) => item.id === job.id ? job : item));
  }

  async function updateHistoryJobProcessing(job: NotificationJob, action: "pause" | "resume") {
    setPendingHistoryJobActionId(job.id);

    try {
      const response = await fetch("/api/admin/notifications/history-jobs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id: job.id }),
      });
      const payload = (await response.json()) as HistoryJobActionResponse;

      if (!response.ok || !payload.ok || !payload.job) {
        throw new Error(payload.error ?? "Notification job could not be updated.");
      }

      updateHistoryJob(payload.job);
      void showToast(
        "success",
        action === "pause"
          ? "Notification job paused."
          : "Notification job resumed.",
      );
    } catch (error) {
      void showToast(
        "error",
        error instanceof Error ? error.message : "Notification job could not be updated.",
      );
    } finally {
      setPendingHistoryJobActionId(null);
    }
  }

  useEffect(() => {
    if (!deferInitialLoad || historyJobId || initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void loadHistoryJobsPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferInitialLoad, historyJobId]);

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
                  {historyPagination.total} send job(s). Open a row to view the dashboard.
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadHistoryJobsPage(historyPagination.page)}
              >
                <RefreshCw size={15} />
                Refresh
              </Button>
            </div>
            <RecordFilterControls
              apps={platformApps}
              appFilter={recordAppFilter}
              onAppFilterChange={(value) => {
                setRecordAppFilter(value);
                void loadHistoryJobsPage(1, { appFilter: value });
              }}
              onSearchChange={(value) => {
                setRecordSearch(value);
                void loadHistoryJobsPage(1, { search: value });
              }}
              onStoreFilterChange={(value) => {
                setRecordStoreFilter(value);
                void loadHistoryJobsPage(1, { storeFilter: value });
              }}
              placeholder="Search job, app, package, bundle, store..."
              search={recordSearch}
              storeFilter={recordStoreFilter}
              stores={storeFilterOptions}
            />
          </div>
          <div className="overflow-auto">
            <Table className="min-w-[880px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead className="w-28">Sent</TableHead>
                  <TableHead className="w-28">Failed</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-32">Action</TableHead>
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
                    const isPending = pendingHistoryJobId === job.id;
                    const isActionPending = pendingHistoryJobActionId === job.id;
                    const badgeStatus = notificationJobBadgeStatus(job);
                    const completionPercent = notificationJobCompletionPercent(job);
                    const controlAction = canManageNotifications ? notificationJobControlAction(job) : null;

                    return (
                      <TableRow
                        key={job.id}
                        aria-busy={isPending}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-muted/45",
                          isPending && "pointer-events-none bg-muted/35",
                        )}
                        onClick={() => {
                          setPendingHistoryJobId(job.id);
                          startTransition(() => {
                            router.push(`/notifications/history/${job.id}`);
                          });
                        }}
                      >
                        <TableCell className="max-w-96">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate font-medium">{job.app_name}</div>
                            <PlatformBadge platform={job.platform} className="shrink-0" />
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
                          <div className={cn("font-mono text-lg font-semibold tabular-nums", failed ? "text-rose-700" : "text-muted-foreground")}>
                            {numberLabel(failed)}
                          </div>
                          <div className="text-xs text-muted-foreground">{rateLabel(jobSuccessRate(job))} success</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={badgeStatus} />
                          </div>
                          {badgeStatus === "processing" || badgeStatus === "paused" ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {completionPercent}% complete
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {controlAction ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isActionPending}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void updateHistoryJobProcessing(job, controlAction);
                              }}
                              className="h-8 gap-1.5 rounded-md px-2.5 text-xs"
                            >
                              {isActionPending ? (
                                <Spinner className="size-3.5" />
                              ) : controlAction === "pause" ? (
                                <Pause size={13} />
                              ) : (
                                <Play size={13} />
                              )}
                              {controlAction === "pause" ? "Pause" : "Resume"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{dateTime(job.sent_at ?? job.created_at)}</TableCell>
                        <TableCell>
                          {isPending ? (
                            <Spinner className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight size={16} className="text-muted-foreground" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableEmptyState
                    colSpan={6}
                    icon={History}
                    title={loadingHistoryJobs ? "Loading send jobs" : "No send jobs"}
                    description={
                      loadingHistoryJobs
                        ? "The current page is being loaded."
                        : "Send attempts will appear here after a notification is sent."
                    }
                  />
                )}
              </TableBody>
            </Table>
          </div>
          <TablePaginationFooter
            onPageChange={(page) => void loadHistoryJobsPage(page)}
            page={historyPagination.page}
            shown={historyListJobs.length}
            total={historyPagination.total}
            totalPages={historyPagination.totalPages}
          />
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
                      <StatusBadge status={historyDetailBadgeStatus ?? historyDetailJob.status} />
                      {historyDetailBadgeStatus === "processing" || historyDetailBadgeStatus === "paused" ? (
                        <span className="text-xs text-muted-foreground">
                          {notificationJobCompletionPercent(historyDetailJob)}% complete
                        </span>
                      ) : null}
                      <PlatformBadge platform={historyDetailJob.platform} />
                    </div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">
                      {historyDetailJob.package_name ?? historyDetailJob.bundle_id ?? historyDetailJob.topic_base}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">Job {historyDetailJob.id}</div>
                    {historyDetailControlAction ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pendingHistoryJobActionId === historyDetailJob.id}
                        onClick={() => void updateHistoryJobProcessing(historyDetailJob, historyDetailControlAction)}
                        className="mt-3 h-8 gap-1.5 rounded-md px-3 text-xs"
                      >
                        {pendingHistoryJobActionId === historyDetailJob.id ? (
                          <Spinner className="size-3.5" />
                        ) : historyDetailControlAction === "pause" ? (
                          <Pause size={14} />
                        ) : (
                          <Play size={14} />
                        )}
                        {historyDetailControlAction === "pause" ? "Pause sending" : "Resume sending"}
                      </Button>
                    ) : null}
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
                    <div className="rounded-md bg-cyan-50 p-3 text-cyan-700">
                      <div className="text-xs">Received</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{historyDetailReceivedEvents}</div>
                    </div>
                    <div className="rounded-md bg-fuchsia-50 p-3 text-fuchsia-700">
                      <div className="text-xs">Impressions</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{historyDetailImpressionEvents}</div>
                    </div>
                    <div className="rounded-md bg-rose-50 p-3 text-rose-700">
                      <div className="text-xs">Failed</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{historyDetailFailed}</div>
                    </div>
                    <div className="rounded-md bg-violet-50 p-3 text-violet-700">
                      <div className="text-xs">Opened</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{historyDetailOpenEvents}</div>
                      <div className="mt-0.5 text-[11px] opacity-75">{historyDetailOpened} unique event(s)</div>
                    </div>
                    <div className="rounded-md bg-emerald-50 p-3 text-emerald-700">
                      <div className="text-xs">Rate</div>
                      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{rateLabel(jobSuccessRate(historyDetailJob))}</div>
                    </div>
                  </div>
                </div>
                <div className="border-t bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2 font-heading text-base font-semibold">
                    <MessageSquareText size={17} />
                    Sent content
                    {historyPrimaryContent?.topicCode ? (
                      <Badge variant="secondary" className="h-6 rounded-md px-2 font-mono text-xs">
                        {historyPrimaryContent.topicCode}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                    <div className="min-w-0 rounded-md border bg-muted/15 p-3">
                      <div className="text-xs text-muted-foreground">Title</div>
                      <div className="mt-1 min-w-0 break-words text-sm font-medium">
                        {historyPrimaryContent?.title ?? "Untitled notification"}
                      </div>
                    </div>
                    <div className="min-w-0 rounded-md border bg-muted/15 p-3">
                      <div className="text-xs text-muted-foreground">Content</div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                        {historyPrimaryContent?.message ?? "No content"}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

                <Tabs defaultValue="dashboard" className="space-y-3">
                  <TabsList>
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="events">Events</TabsTrigger>
                  </TabsList>
                  <TabsContent value="dashboard" className="m-0">
                    <HistoryJobDashboard
                      failed={historyDetailFailed}
                      impressions={historyDetailImpressionEvents}
                      opened={historyDetailOpenEvents}
                      received={historyDetailReceivedEvents}
                      requested={historyDetailRequested}
                      rows={historyDeliveryRows}
                      sent={historyDetailSent}
                    />
                  </TabsContent>
                  <TabsContent value="events" className="m-0">
                    <section className="overflow-hidden rounded-xl border bg-background shadow-sm shadow-slate-200/50">
                      <div className="border-b bg-muted/20 p-4">
                        <div className="flex items-center gap-2 font-heading text-base font-semibold">
                          <History size={17} />
                          Notification events
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {deliveryPagination.total} send/received/impression/open event(s) for this topic job. Open Detail to inspect the payload metadata.
                        </div>
                      </div>
                      <div className="overflow-auto">
                        <Table className="min-w-[1420px] text-sm">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Topic / event ID</TableHead>
                              <TableHead className="w-44">App / locale</TableHead>
                              <TableHead className="w-72">Content</TableHead>
                              <TableHead className="w-36">Event</TableHead>
                              <TableHead className="w-28">Status</TableHead>
                              <TableHead className="w-52">Provider</TableHead>
                              <TableHead className="w-44">Time</TableHead>
                              <TableHead className="w-28">Log</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {historyDeliveryRows.length ? (
                              historyDeliveryRows.map((row) => (
                                <TableRow key={row.event.id}>
                                  <TableCell className="max-w-[34rem]">
                                    <div className="truncate font-mono text-sm font-medium" title={row.topicCode ?? undefined}>
                                      {row.topicCode ?? row.event.target_value ?? "No topic"}
                                    </div>
                                    <div className="mt-1 truncate text-xs text-muted-foreground">
                                      {metadataString(row.event, "clientEventId") ?? row.event.id}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-mono text-xs">{metadataString(row.event, "appId") ?? historyDetailJob.app_id ?? "No app id"}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">{metadataString(row.event, "locale") ?? metadataString(row.event, "localeCode") ?? "No locale"}</div>
                                  </TableCell>
                                  <TableCell className="max-w-72">
                                    <div className="truncate text-sm font-medium" title={row.content.title}>
                                      {row.content.title}
                                    </div>
                                    <div className="mt-1 truncate text-xs text-muted-foreground" title={row.content.message}>
                                      {row.content.message}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-mono text-xs">{row.event.event_type}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">{row.events.length} event(s)</div>
                                    {row.topicCode ? <div className="mt-1 text-xs text-muted-foreground">topic {row.topicCode}</div> : null}
                                  </TableCell>
                                  <TableCell>
                                    <StatusBadge status={row.status} />
                                  </TableCell>
                                  <TableCell className="max-w-52">
                                    <div className="truncate font-mono text-xs">{row.event.provider_message_id ?? "No provider id"}</div>
                                    {row.fcmErrorCode ? <div className="mt-1 text-xs text-muted-foreground">{row.fcmErrorCode}</div> : null}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{dateTime(row.event.created_at)}</TableCell>
                                  <TableCell>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setSelectedDeliveryEventId(row.event.id)}
                                    >
                                      <Eye size={14} />
                                      Detail
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableEmptyState
                                colSpan={8}
                                icon={History}
                                title={loadingDeliveryEvents ? "Loading delivery events" : "No delivery events"}
                                description={
                                  loadingDeliveryEvents
                                    ? "The current page is being loaded."
                                    : "FCM send and mobile received/impression/open events for this job will appear here."
                                }
                              />
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      <TablePaginationFooter
                        onPageChange={(page) => void loadDeliveryEventsPage(page)}
                        page={deliveryPagination.page}
                        shown={historyDeliveryRows.length}
                        total={deliveryPagination.total}
                        totalPages={deliveryPagination.totalPages}
                      />
                    </section>
                  </TabsContent>
                </Tabs>

                <Dialog open={Boolean(selectedDeliveryRow)} onOpenChange={(open) => !open && setSelectedDeliveryEventId(null)}>
                  {selectedDeliveryRow ? (
                    <DialogContent className="max-h-[86dvh] gap-0 overflow-hidden p-0 sm:max-w-[min(920px,calc(100vw-2rem))]">
                      <DialogHeader className="border-b px-4 py-3 pr-12">
                        <DialogTitle className="text-base">Notification event detail</DialogTitle>
                        <DialogDescription className="text-xs">
                          Topic, engagement status, provider response, sent content, and stored metadata. No FCM token is stored for topic events.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="max-h-[calc(86dvh-5rem)] space-y-4 overflow-auto p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-md border bg-muted/15 p-3">
                            <div className="text-xs text-muted-foreground">Topic</div>
                            <div className="mt-1 break-all font-mono text-xs">{selectedDeliveryRow.topicCode ?? selectedDeliveryRow.event.target_value ?? "No topic"}</div>
                          </div>
                          <div className="rounded-md border bg-muted/15 p-3">
                            <div className="text-xs text-muted-foreground">Client event ID</div>
                            <div className="mt-1 break-all font-mono text-xs">
                              {metadataString(selectedDeliveryRow.event, "clientEventId") ?? selectedDeliveryRow.event.id}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center gap-2 font-heading text-sm font-semibold">
                            <MessageSquareText size={15} />
                            Sent content
                            {selectedDeliveryRow.content.topicCode ? (
                              <Badge variant="secondary" className="h-6 rounded-md px-2 font-mono text-xs">
                                {selectedDeliveryRow.content.topicCode}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                            <div className="min-w-0 rounded-md bg-muted/25 p-3">
                              <div className="text-xs text-muted-foreground">Title</div>
                              <div className="mt-1 break-words text-sm font-medium">{selectedDeliveryRow.content.title}</div>
                            </div>
                            <div className="min-w-0 rounded-md bg-muted/25 p-3">
                              <div className="text-xs text-muted-foreground">Content</div>
                              <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{selectedDeliveryRow.content.message}</div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="rounded-md border bg-muted/15 p-3">
                            <div className="text-xs text-muted-foreground">Status</div>
                            <div className="mt-2">
                              <StatusBadge status={selectedDeliveryRow.status} />
                            </div>
                          </div>
                          <div className="rounded-md border bg-muted/15 p-3">
                            <div className="text-xs text-muted-foreground">Event</div>
                            <div className="mt-1 font-mono text-xs">{selectedDeliveryRow.event.event_type}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{selectedDeliveryRow.events.length} event(s) grouped</div>
                          </div>
                          <div className="rounded-md border bg-muted/15 p-3">
                            <div className="text-xs text-muted-foreground">Time</div>
                            <div className="mt-1 text-sm">{dateTime(selectedDeliveryRow.event.created_at)}</div>
                          </div>
                        </div>

                        <div className="rounded-md border p-3">
                          <div className="font-heading text-sm font-semibold">Provider log</div>
                          <div className={cn("mt-2 whitespace-pre-wrap break-words text-sm", selectedDeliveryRow.event.error_detail ? "text-rose-700" : "text-muted-foreground")}>
                            {eventLogDetail(selectedDeliveryRow.event)}
                          </div>
                          <div className="mt-3 grid gap-3 text-xs md:grid-cols-3">
                            <div>
                              <div className="text-muted-foreground">Provider ID</div>
                              <div className="mt-1 break-all font-mono">{selectedDeliveryRow.event.provider_message_id ?? "No provider id"}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Provider error code</div>
                              <div className="mt-1 break-all font-mono">{selectedDeliveryRow.fcmErrorCode ?? "No provider error"}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Source</div>
                              <div className="mt-1 font-mono">{metadataString(selectedDeliveryRow.event, "source") ?? "notification_sender"}</div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-md border p-3">
                          <div className="font-heading text-sm font-semibold">Metadata</div>
                          <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-5">
                            {metadataJson(selectedDeliveryRow.metadata)}
                          </pre>
                        </div>
                      </div>
                    </DialogContent>
                  ) : null}
                </Dialog>
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
