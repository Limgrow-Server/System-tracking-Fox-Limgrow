"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Bell, Clock3, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  EmptyPanel,
  PageHeader,
  StatusBadge,
  TableEmptyState,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime } from "@/lib/tracking/format";
import type { NotificationsPageData, PaginationMeta } from "@/lib/tracking/page-data";
import type {
  DeviceToken,
  NotificationEvent,
  NotificationJob,
  NotificationSchedule,
  StoreMapping,
} from "@/lib/tracking/types";

import {
  DeliveryDashboard,
  PlatformBadge,
  compactIdentifier,
  jobMatchesApp,
  numberLabel,
  scheduleMatchesApp,
  tokensForApp,
} from "./shared";

function statusValue(value: string | null | undefined) {
  return (value ?? "unknown").toLowerCase();
}

function identifierForToken(token: DeviceToken) {
  return token.package_name ?? token.bundle_id ?? token.product_app_id ?? token.app_id ?? "No identifier";
}

function appMatchesRouteId(app: StoreMapping, appId: string) {
  return app.id === appId || app.app_id?.toLowerCase() === appId.toLowerCase();
}

type TokenListResponse = {
  data?: DeviceToken[];
  error?: string;
  notificationEvents?: NotificationEvent[];
  notificationJobs?: NotificationJob[];
  notificationSchedules?: NotificationSchedule[];
  page?: number;
  pageSize?: number;
  success?: boolean;
  summary?: NotificationsPageData["notificationSummary"];
  total?: number;
  totalPages?: number;
};

export function NotificationTokenDetailPage({
  appId,
  data,
}: {
  appId: string;
  data: NotificationsPageData;
}) {
  const router = useRouter();
  const [deviceTokens, setDeviceTokens] = useState(data.deviceTokens);
  const [notificationJobs, setNotificationJobs] = useState(data.notificationJobs);
  const [notificationEvents, setNotificationEvents] = useState(
    data.notificationEvents,
  );
  const [notificationSchedules, setNotificationSchedules] = useState(
    data.notificationSchedules,
  );
  const [tokenPagination, setTokenPagination] = useState<PaginationMeta>(
    data.notificationPagination.tokens ?? {
      page: 1,
      pageSize: 10,
      total: data.deviceTokens.length,
      totalPages: 1,
    },
  );
  const [tokenSummary, setTokenSummary] = useState(data.notificationSummary);
  const [tokenSearch, setTokenSearch] = useState("");
  const [loadingTokens, setLoadingTokens] = useState(false);
  const selectedApp = useMemo(
    () => data.storeMappings.find((app) => appMatchesRouteId(app, appId)) ?? null,
    [appId, data.storeMappings]
  );

  const selectedTokens = useMemo(() => {
    if (!selectedApp) return [];
    return tokensForApp(selectedApp, deviceTokens)
      .sort((first, second) => new Date(second.last_seen_at).getTime() - new Date(first.last_seen_at).getTime());
  }, [deviceTokens, selectedApp]);

  const selectedSchedules = selectedApp
    ? notificationSchedules.filter((schedule) => scheduleMatchesApp(schedule, selectedApp))
    : [];
  const selectedActiveSchedules = selectedSchedules.filter((schedule) => statusValue(schedule.status) === "active");
  const selectedJobs = useMemo(
    () =>
      selectedApp
        ? notificationJobs.filter((job) => jobMatchesApp(job, selectedApp))
        : [],
    [notificationJobs, selectedApp],
  );
  const selectedJobIds = useMemo(
    () => new Set(selectedJobs.map((job) => job.id)),
    [selectedJobs],
  );
  const selectedEvents = useMemo(
    () =>
      notificationEvents.filter(
        (event) => event.job_id && selectedJobIds.has(event.job_id),
      ),
    [notificationEvents, selectedJobIds],
  );

  async function loadTokenPage(page: number, nextSearch = tokenSearch) {
    const params = new URLSearchParams({
      appId,
      page: String(page),
      pageSize: "10",
    });

    if (nextSearch.trim()) params.set("search", nextSearch.trim());

    setLoadingTokens(true);

    try {
      const response = await fetch(
        `/api/admin/notifications/tokens?${params.toString()}`,
      );
      const payload = (await response.json()) as TokenListResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "FCM tokens could not be loaded.");
      }

      setDeviceTokens(payload.data);
      setNotificationJobs(payload.notificationJobs ?? []);
      setNotificationEvents(payload.notificationEvents ?? []);
      setNotificationSchedules(payload.notificationSchedules ?? []);
      setTokenPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 10,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
      if (payload.summary) setTokenSummary(payload.summary);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "FCM tokens could not be loaded.",
      );
    } finally {
      setLoadingTokens(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Messaging"
        title={selectedApp ? `${selectedApp.app_name} FCM tokens` : "FCM token detail"}
        description="Inspect registered FCM token records for one app."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => router.push("/notifications/overview")}>
          <ArrowLeft size={15} />
          Back to overview
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
          <RefreshCw size={15} />
          Refresh
        </Button>
      </div>

      {selectedApp ? (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-background p-4 shadow-sm shadow-slate-200/50">
              <div className="text-xs font-medium text-muted-foreground">App</div>
              <div className="mt-2 truncate text-lg font-semibold">{selectedApp.app_name}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{selectedApp.store_account_name}</div>
            </div>
            <div className="rounded-xl border bg-background p-4 shadow-sm shadow-slate-200/50">
              <div className="text-xs font-medium text-muted-foreground">Identifier</div>
              <div className="mt-2 truncate font-mono text-sm font-semibold">{compactIdentifier(selectedApp)}</div>
              <div className="mt-2">
                <PlatformBadge platform={selectedApp.platform} />
              </div>
            </div>
            <div className="rounded-xl border bg-background p-4 shadow-sm shadow-slate-200/50">
              <div className="text-xs font-medium text-muted-foreground">Records</div>
              <div className="mt-2 font-mono text-2xl font-semibold">{numberLabel(tokenPagination.total)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {numberLabel(tokenSummary.activeTokens)} active token(s), {numberLabel(selectedActiveSchedules.length)} active schedule(s)
              </div>
            </div>
          </section>

          <DeliveryDashboard events={selectedEvents} jobs={selectedJobs} />

          <section className="overflow-hidden rounded-xl border bg-background shadow-sm shadow-slate-200/50">
            <div className="space-y-3 border-b bg-muted/20 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-heading text-base font-semibold">
                    FCM token detail
                    <PlatformBadge platform={selectedApp.platform} />
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {numberLabel(tokenPagination.total)} token record(s), {numberLabel(tokenSummary.activeTokens)} active.
                  </div>
                </div>
                <label className="relative block w-full lg:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                  <Input
                    value={tokenSearch}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setTokenSearch(nextValue);
                      void loadTokenPage(1, nextValue);
                    }}
                    className="h-9 pl-9"
                    placeholder="Search FCM token, device id, locale, version..."
                  />
                </label>
              </div>
            </div>
            <div className="overflow-auto">
              <Table className="min-w-[980px] text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>FCM token</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-24">Locale</TableHead>
                    <TableHead className="w-40">App version</TableHead>
                    <TableHead className="w-40">OS</TableHead>
                    <TableHead className="w-44">Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedTokens.length ? (
                    selectedTokens.map((token) => (
                      <TableRow key={token.id}>
                        <TableCell className="max-w-[32rem]">
                          <div className="truncate font-mono text-sm font-medium" title={token.fcm_token}>
                            {token.fcm_token}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {token.device_id} · {identifierForToken(token)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={statusValue(token.status)} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{token.locale ?? "No data"}</TableCell>
                        <TableCell>
                          <div className="text-sm">{token.app_version ?? "No data"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{token.os_version ?? "No data"}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Clock3 size={13} />
                            {dateTime(token.last_seen_at)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyState
                      colSpan={6}
                      icon={Bell}
                      description="Mobile has not registered an FCM token for this app yet."
                      title={loadingTokens ? "Loading token records" : "No token records"}
                    />
                  )}
                </TableBody>
              </Table>
            </div>
            <TablePaginationFooter
              onPageChange={(page) => void loadTokenPage(page)}
              page={tokenPagination.page}
              shown={selectedTokens.length}
              total={tokenPagination.total}
              totalPages={tokenPagination.totalPages}
            />
          </section>
        </>
      ) : (
        <section className="overflow-hidden rounded-xl border bg-background p-10 shadow-sm shadow-slate-200/50">
          <EmptyPanel
            icon={Bell}
            title="App not found"
            description="Return to overview and open an existing app row."
          />
        </section>
      )}
    </div>
  );
}
