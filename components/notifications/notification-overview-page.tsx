"use client";

import { useMemo, useState } from "react";
import { Bell, ChevronRight, ListFilter, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  PageHeader,
  StatusBadge,
  TableEmptyState,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime } from "@/lib/tracking/format";
import type { NotificationsPageData, PaginationMeta } from "@/lib/tracking/page-data";
import type { DeviceToken, NotificationSchedule, StoreMapping } from "@/lib/tracking/types";

import {
  ALL_FILTER_VALUE,
  AppIcon,
  AppSearchDropdown,
  PlatformBadge,
  numberLabel,
  scheduleMatchesApp,
  tokensForApp,
} from "./shared";

const OVERVIEW_APP_SKELETON_COUNT = 8;

function statusValue(value: string | null | undefined) {
  return (value ?? "unknown").toLowerCase();
}

function appIdentifier(app: StoreMapping) {
  return app.package_name ?? app.bundle_id ?? app.app_id ?? app.app_name;
}

function latestSeen(tokens: DeviceToken[]) {
  return tokens
    .map((token) => new Date(token.last_seen_at).getTime())
    .filter(Number.isFinite)
    .sort((first, second) => second - first)[0] ?? null;
}

type OverviewAppsResponse = {
  data?: StoreMapping[];
  deviceTokens?: DeviceToken[];
  error?: string;
  notificationSchedules?: NotificationSchedule[];
  page?: number;
  pageSize?: number;
  storeOptions?: string[];
  success?: boolean;
  summary?: NotificationsPageData["notificationSummary"];
  total?: number;
  totalPages?: number;
};

export function NotificationOverviewPage({ data }: { data: NotificationsPageData }) {
  const router = useRouter();
  const [storeMappings, setStoreMappings] = useState(data.storeMappings);
  const [deviceTokens, setDeviceTokens] = useState(data.deviceTokens);
  const [notificationSchedules, setNotificationSchedules] = useState(
    data.notificationSchedules,
  );
  const [overviewPagination, setOverviewPagination] =
    useState<PaginationMeta>(
      data.notificationPagination.overviewApps ?? {
        page: 1,
        pageSize: 10,
        total: data.storeMappings.length,
        totalPages: 1,
      },
    );
  const [summary, setSummary] = useState(data.notificationSummary);
  const [storeOptions, setStoreOptions] = useState(data.notificationStoreOptions);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState(ALL_FILTER_VALUE);
  const [storeFilter, setStoreFilter] = useState(ALL_FILTER_VALUE);
  const [loadingApps, setLoadingApps] = useState(false);
  const [loadingPage, setLoadingPage] = useState<number | null>(null);

  const appRows = useMemo(() => {
    return storeMappings
      .map((app) => {
        const tokens = tokensForApp(app, deviceTokens);
        const activeTokens = tokens.filter((token) => statusValue(token.status) === "active");
        const schedules = notificationSchedules.filter((schedule) => scheduleMatchesApp(schedule, app));
        const activeSchedules = schedules.filter((schedule) => statusValue(schedule.status) === "active");
        const latestSeenAt = latestSeen(tokens);

        return {
          activeSchedules,
          activeTokens,
          app,
          latestSeenAt,
          schedules,
          tokens,
        };
      });
  }, [deviceTokens, notificationSchedules, storeMappings]);

  async function loadOverviewPage(
    page: number,
    overrides?: {
      platformFilter?: string;
      search?: string;
      storeFilter?: string;
    },
  ) {
    const nextSearch = overrides?.search ?? search;
    const nextPlatform = overrides?.platformFilter ?? platformFilter;
    const nextStore = overrides?.storeFilter ?? storeFilter;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "10",
    });

    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    if (nextPlatform !== ALL_FILTER_VALUE) params.set("platform", nextPlatform);
    if (nextStore !== ALL_FILTER_VALUE) params.set("store", nextStore);

    setLoadingApps(true);
    setLoadingPage(page);

    try {
      const response = await fetch(
        `/api/admin/notifications/overview-apps?${params.toString()}`,
      );
      const payload = (await response.json()) as OverviewAppsResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Notification apps could not be loaded.");
      }

      setStoreMappings(payload.data);
      setDeviceTokens(payload.deviceTokens ?? []);
      setNotificationSchedules(payload.notificationSchedules ?? []);
      setOverviewPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 10,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
      if (payload.storeOptions) setStoreOptions(payload.storeOptions);
      if (payload.summary) setSummary(payload.summary);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Notification apps could not be loaded.",
      );
    } finally {
      setLoadingApps(false);
      setLoadingPage(null);
    }
  }

  function selectApp(appId: string) {
    router.push(`/notifications/overview/${encodeURIComponent(appId)}`);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Messaging"
        title="Notification overview"
        description="View mapped apps, registered FCM token records, active devices, and scheduled notification count before sending."
      />

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-background p-4 shadow-sm shadow-slate-200/50">
          <div className="text-xs font-medium text-muted-foreground">Mapped apps</div>
          <div className="mt-2 font-mono text-2xl font-semibold">{numberLabel(summary.appCount)}</div>
          <div className="mt-1 text-xs text-muted-foreground">matching current filters</div>
        </div>
        <div className="rounded-xl border bg-background p-4 shadow-sm shadow-slate-200/50">
          <div className="text-xs font-medium text-muted-foreground">Registered tokens</div>
          <div className="mt-2 font-mono text-2xl font-semibold">{numberLabel(summary.totalTokens)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{numberLabel(summary.activeTokens)} active</div>
        </div>
        <div className="rounded-xl border bg-background p-4 shadow-sm shadow-slate-200/50">
          <div className="text-xs font-medium text-muted-foreground">Schedules</div>
          <div className="mt-2 font-mono text-2xl font-semibold">{numberLabel(summary.totalSchedules)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{numberLabel(summary.activeSchedules)} active</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-background shadow-sm shadow-slate-200/50">
        <div className="space-y-3 border-b bg-muted/20 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 font-heading text-base font-semibold">
                <Bell size={17} />
                App token overview
              </div>
              <div className="text-sm text-muted-foreground">
                {overviewPagination.total} app(s), {numberLabel(summary.activeTokens)} active FCM token record(s). Open a row to view token detail.
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
              <RefreshCw size={15} />
              Refresh
            </Button>
          </div>
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_12rem_14rem]">
            <AppSearchDropdown
              apps={storeMappings}
              onValueChange={(nextValue) => {
                setSearch(nextValue);
                void loadOverviewPage(1, { search: nextValue });
              }}
              placeholder="Search app, app id, package, bundle, store..."
              value={search}
            />
            <Select
              value={platformFilter}
              onValueChange={(value) => {
                setPlatformFilter(value);
                void loadOverviewPage(1, { platformFilter: value });
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>All platforms</SelectItem>
                <SelectItem value="android">Android</SelectItem>
                <SelectItem value="ios">iOS</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={storeFilter}
              onValueChange={(value) => {
                setStoreFilter(value);
                void loadOverviewPage(1, { storeFilter: value });
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL_FILTER_VALUE}>All stores</SelectItem>
                {storeOptions.map((store) => (
                  <SelectItem key={store} value={store}>
                    {store}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-auto">
          <Table className="min-w-[1120px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>App</TableHead>
                <TableHead className="w-32">App ID</TableHead>
                <TableHead className="w-28">Platform</TableHead>
                <TableHead className="w-72">Identifier</TableHead>
                <TableHead className="w-36">Tokens</TableHead>
                <TableHead className="w-36">Schedules</TableHead>
                <TableHead className="w-36">Last seen</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingApps ? (
                Array.from({ length: OVERVIEW_APP_SKELETON_COUNT }).map((_, index) => (
                  <TableRow key={`overview-app-skeleton-${index}`}>
                    <TableCell className="max-w-80">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="size-10 animate-pulse rounded-lg bg-muted" />
                        <div className="min-w-0 flex-1">
                          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-7 w-64 animate-pulse rounded-md bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-5 w-10 animate-pulse rounded bg-muted" />
                      <div className="mt-2 h-3 w-16 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-5 w-10 animate-pulse rounded bg-muted" />
                      <div className="mt-2 h-3 w-16 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              ) : appRows.length ? (
                appRows.map((row) => {
                  const detailAppId = row.app.app_id ?? row.app.id;
                  return (
                    <TableRow
                      key={row.app.id}
                      className="cursor-pointer transition-colors hover:bg-muted/45"
                      onClick={() => selectApp(detailAppId)}
                    >
                      <TableCell className="max-w-80">
                        <div className="flex min-w-0 items-center gap-3">
                          <AppIcon app={row.app} />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{row.app.app_name}</div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">{row.app.store_account_name}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.app.app_id ?? "No app id"}</TableCell>
                      <TableCell>
                        <PlatformBadge platform={row.app.platform} />
                      </TableCell>
                      <TableCell>
                        <div className="truncate rounded-md bg-muted px-2 py-1 font-mono text-xs">{appIdentifier(row.app)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-base font-semibold">{numberLabel(row.tokens.length)}</div>
                        <div className="text-xs text-muted-foreground">{numberLabel(row.activeTokens.length)} active</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-base font-semibold">{numberLabel(row.schedules.length)}</div>
                        <div className="text-xs text-muted-foreground">{numberLabel(row.activeSchedules.length)} active</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.latestSeenAt ? dateTime(new Date(row.latestSeenAt).toISOString()) : "No token"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={statusValue(row.app.status)} />
                      </TableCell>
                      <TableCell>
                        <ChevronRight size={16} className="text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableEmptyState
                  colSpan={9}
                  icon={ListFilter}
                  title={loadingApps ? "Loading apps" : "No apps"}
                  description={
                    loadingApps
                      ? "The current page is being loaded."
                      : "Adjust filters or create app mappings first."
                  }
                />
              )}
            </TableBody>
          </Table>
        </div>
        <TablePaginationFooter
          onPageChange={(page) => void loadOverviewPage(page)}
          page={overviewPagination.page}
          shown={appRows.length}
          total={overviewPagination.total}
          totalPages={overviewPagination.totalPages}
          loadingPage={loadingPage}
        />
      </section>

    </div>
  );
}
