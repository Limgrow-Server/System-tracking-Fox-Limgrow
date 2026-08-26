"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileJson,
  RadioTower,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AndroidRtdnHistoryPageData,
  PaginationMeta,
} from "@/lib/tracking/page-data";
import type {
  AndroidRtdnEventDto,
  AndroidRtdnSummary,
} from "@/lib/tracking/types";

export type AndroidRtdnHistoryPanelProps = {
  initialHistory: AndroidRtdnHistoryPageData;
  mappingId: string;
  onInspectPayload: (payload: unknown) => void;
};

type AndroidRtdnHistoryResponse = {
  data?: AndroidRtdnEventDto[];
  error?: string;
  page?: number;
  pageSize?: number;
  success?: boolean;
  summary?: AndroidRtdnSummary | null;
  total?: number;
  totalPages?: number;
};

const RTDN_PAGE_SIZE = 8;

function formatEventDate(value: string | null | undefined) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function readableLabel(value: string | null | undefined) {
  if (!value) return "Unknown event";
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function eventStatusMeta(status: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized === "processed") {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      label: "Processed",
    };
  }

  if (normalized === "failed") {
    return {
      className: "border-rose-200 bg-rose-50 text-rose-700",
      label: "Failed",
    };
  }

  if (normalized === "ignored") {
    return {
      className: "border-slate-200 bg-slate-50 text-slate-600",
      label: "Ignored",
    };
  }

  if (normalized === "processing") {
    return {
      className: "border-blue-200 bg-blue-50 text-blue-700",
      label: "Processing",
    };
  }

  return {
    className: "border-amber-200 bg-amber-50 text-amber-700",
    label: normalized ? readableLabel(normalized) : "Received",
  };
}

function numberFromSummary(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function paginationFromPayload(
  payload: AndroidRtdnHistoryResponse,
  requestedPage: number,
  dataLength: number,
): PaginationMeta {
  return {
    page: payload.page ?? requestedPage,
    pageSize: payload.pageSize ?? RTDN_PAGE_SIZE,
    total: payload.total ?? dataLength,
    totalPages: payload.totalPages ?? (dataLength ? 1 : 0),
  };
}

export function AndroidRtdnHistoryPanel({
  initialHistory,
  mappingId,
  onInspectPayload,
}: AndroidRtdnHistoryPanelProps) {
  const [history, setHistory] = useState(initialHistory);
  const [loadingPage, setLoadingPage] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const statusCounts = useMemo(() => {
    const counts = {
      failed: 0,
      ignored: 0,
      processed: 0,
    };

    for (const event of history.events) {
      const status = (event.status ?? "").trim().toLowerCase();
      if (status === "failed") counts.failed += 1;
      if (status === "ignored") counts.ignored += 1;
      if (status === "processed") counts.processed += 1;
    }

    return counts;
  }, [history.events]);

  const summary = history.summary;
  const summaryCards = [
    {
      label: "Received",
      value: numberFromSummary(
        summary?.totalCount ??
          summary?.receivedCount ??
          summary?.total ??
          summary?.received,
        history.pagination.total,
      ),
    },
    {
      label: "Processed",
      value: numberFromSummary(
        summary?.processedCount ?? summary?.processed,
        statusCounts.processed,
      ),
    },
    {
      label: "Ignored",
      value: numberFromSummary(
        summary?.ignoredCount ?? summary?.ignored,
        statusCounts.ignored,
      ),
    },
    {
      label: "Failed",
      value: numberFromSummary(
        summary?.failedCount ?? summary?.failed,
        statusCounts.failed,
      ),
    },
  ];
  const lastEventAt =
    summary?.lastEventAt ??
    summary?.lastNotificationAt ??
    summary?.lastReceivedAt ??
    history.events[0]?.eventTime ??
    history.events[0]?.receivedAt ??
    null;
  const pendingActionCount = numberFromSummary(
    summary?.pendingActionCount,
    history.events.filter((event) => event.requiresAction).length,
  );
  const overdueActionCount = numberFromSummary(
    summary?.overdueActionCount,
    history.events.filter((event) => event.actionOverdue).length,
  );

  async function loadPage(page: number) {
    setLoadingPage(page);
    setRefreshError(null);

    try {
      const params = new URLSearchParams({
        mappingId,
        page: String(page),
        pageSize: String(history.pagination.pageSize || RTDN_PAGE_SIZE),
      });
      const response = await fetch(
        `/api/admin/android-iap/rtdn-events?${params.toString()}`,
      );
      const payload = (await response
        .json()
        .catch(() => null)) as AndroidRtdnHistoryResponse | null;

      if (
        !response.ok ||
        payload?.success === false ||
        !Array.isArray(payload?.data)
      ) {
        throw new Error(
          payload?.error ?? "Refresh Android RTDN history failed.",
        );
      }

      setHistory({
        available: true,
        error: null,
        events: payload.data,
        pagination: paginationFromPayload(payload, page, payload.data.length),
        summary: payload.summary ?? history.summary,
      });
    } catch (error) {
      setRefreshError(
        error instanceof Error
          ? error.message
          : "Refresh Android RTDN history failed.",
      );
    } finally {
      setLoadingPage(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card text-card-foreground">
      <div className="flex flex-col gap-4 border-b bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Android RTDN history</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Inbound Google Play notifications are tracked independently from
            billing state and outbound analytics delivery.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Last event: {formatEventDate(lastEventAt)}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 bg-background"
            disabled={loadingPage !== null}
            onClick={() => void loadPage(1)}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingPage !== null ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid border-b md:grid-cols-3">
        {[
          {
            description: "Pub/Sub accepted, decoded, and persisted",
            label: "1. Inbound RTDN",
          },
          {
            description: "Entitlement, trial phase, renewal, and expiry",
            label: "2. Billing state",
          },
          {
            description: "Firebase and Adjust delivery attempts",
            label: "3. Outbound delivery",
          },
        ].map((layer, index) => (
          <div
            key={layer.label}
            className={`p-4 ${index > 0 ? "border-t md:border-l md:border-t-0" : ""}`}
          >
            <p className="text-xs font-semibold text-foreground">
              {layer.label}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {layer.description}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 border-b sm:grid-cols-4">
        {summaryCards.map((card, index) => (
          <div
            key={card.label}
            className={`p-4 ${index % 2 ? "border-l" : ""} ${index > 1 ? "border-t sm:border-t-0" : ""} ${index === 2 ? "sm:border-l" : ""}`}
          >
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {pendingActionCount > 0 ? (
        <div
          className={`flex gap-3 border-b px-4 py-3 ${
            overdueActionCount > 0
              ? "bg-rose-50 text-rose-800"
              : "bg-amber-50 text-amber-800"
          }`}
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-sm font-semibold">
              {pendingActionCount.toLocaleString()} Google Play refund review
              {pendingActionCount === 1 ? "" : "s"} require manual action
            </p>
            <p className="mt-0.5 text-xs">
              {overdueActionCount > 0
                ? `${overdueActionCount.toLocaleString()} review${overdueActionCount === 1 ? " is" : "s are"} past the 24-hour response window.`
                : "Review these cases before the displayed deadline. The system will not approve or reject refunds automatically."}
            </p>
          </div>
        </div>
      ) : null}

      {!history.available ? (
        <div className="m-4 rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">
            RTDN history is not available yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {history.error ??
              "The transactions below remain available while the RTDN history endpoint is being deployed."}
          </p>
        </div>
      ) : history.events.length ? (
        <div className="max-h-[320px] divide-y overflow-y-auto">
          {history.events.map((event) => {
            const status = eventStatusMeta(event.status);
            const eventName =
              event.notificationTypeName ??
              (event.notificationType !== null
                ? `Notification ${event.notificationType}`
                : readableLabel(event.category));

            return (
              <article
                key={event.id}
                className="grid gap-3 p-4 lg:grid-cols-[minmax(180px,1fr)_minmax(220px,1.3fr)_minmax(180px,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className="truncate text-sm font-semibold"
                      title={eventName}
                    >
                      {readableLabel(eventName)}
                    </p>
                    <Badge
                      variant="outline"
                      className={`px-2 py-0.5 text-[11px] ${status.className}`}
                    >
                      {status.label}
                    </Badge>
                    {event.requiresAction ? (
                      <Badge
                        variant="outline"
                        className={`px-2 py-0.5 text-[11px] ${
                          event.actionOverdue
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {event.actionOverdue
                          ? "Review overdue"
                          : "Manual review"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {readableLabel(event.category)} · Event{" "}
                    {formatEventDate(event.eventTime)}
                  </p>
                </div>

                <div className="min-w-0 text-xs">
                  <p
                    className="truncate font-mono"
                    title={event.orderId ?? event.purchaseToken ?? undefined}
                  >
                    {event.orderId ??
                      event.purchaseToken ??
                      "No purchase reference"}
                  </p>
                  <p
                    className="mt-1 truncate text-muted-foreground"
                    title={event.productId ?? undefined}
                  >
                    {event.productId ??
                      event.packageName ??
                      "No product reference"}
                  </p>
                </div>

                <div className="min-w-0 text-xs text-muted-foreground">
                  <p>Received {formatEventDate(event.receivedAt)}</p>
                  <p
                    className="mt-1 truncate font-mono"
                    title={event.messageId ?? undefined}
                  >
                    {event.messageId
                      ? `Message ${event.messageId}`
                      : "No message ID"}
                  </p>
                  {event.errorMessage ? (
                    <p
                      className="mt-1 truncate text-rose-600"
                      title={event.errorMessage}
                    >
                      {event.errorMessage}
                    </p>
                  ) : null}
                  {event.requiresAction ? (
                    <p
                      className={`mt-1 ${event.actionOverdue ? "text-rose-600" : "text-amber-700"}`}
                    >
                      Due {formatEventDate(event.actionDueAt)} ·{" "}
                      {event.pendingRefundTokenStored
                        ? "Review token secured"
                        : "Review token missing"}
                    </p>
                  ) : null}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 justify-self-start lg:justify-self-end"
                  disabled={event.rawPayload == null}
                  onClick={() => onInspectPayload(event.rawPayload)}
                >
                  <FileJson className="h-3.5 w-3.5" />
                  JSON
                </Button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="m-4 rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">No RTDN events received</p>
          <p className="mt-1 text-xs text-muted-foreground">
            New Google Play subscription and one-time product notifications will
            appear here.
          </p>
        </div>
      )}

      {refreshError ? (
        <p
          className="border-t bg-rose-50 px-4 py-2 text-xs text-rose-700"
          role="alert"
        >
          {refreshError}
        </p>
      ) : null}

      {history.available && history.pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Page {history.pagination.page} of {history.pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              aria-label="Previous RTDN page"
              disabled={history.pagination.page <= 1 || loadingPage !== null}
              onClick={() => void loadPage(history.pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              aria-label="Next RTDN page"
              disabled={
                history.pagination.page >= history.pagination.totalPages ||
                loadingPage !== null
              }
              onClick={() => void loadPage(history.pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
