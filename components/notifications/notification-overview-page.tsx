"use client";

import { useMemo, useState } from "react";
import { Bell, ChevronRight, ListFilter, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader, StatusBadge, TableEmptyState } from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime } from "@/lib/tracking/format";
import type { NotificationsPageData } from "@/lib/tracking/page-data";
import type { DeviceToken, StoreMapping } from "@/lib/tracking/types";

import {
  ALL_FILTER_VALUE,
  AppIcon,
  PlatformIcon,
  appMatchesSearch,
  numberLabel,
  platformLabel,
  scheduleMatchesApp,
  tokensForApp,
} from "./shared";

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

export function NotificationOverviewPage({ data }: { data: NotificationsPageData }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState(ALL_FILTER_VALUE);
  const [storeFilter, setStoreFilter] = useState(ALL_FILTER_VALUE);

  const storeOptions = useMemo(
    () =>
      Array.from(new Set(data.storeMappings.flatMap((app) => (app.store_account_name ? [app.store_account_name] : []))))
        .sort((first, second) => first.localeCompare(second)),
    [data.storeMappings]
  );

  const appRows = useMemo(() => {
    return data.storeMappings
      .map((app) => {
        const tokens = tokensForApp(app, data.deviceTokens);
        const activeTokens = tokens.filter((token) => statusValue(token.status) === "active");
        const schedules = data.notificationSchedules.filter((schedule) => scheduleMatchesApp(schedule, app));
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
      })
      .filter((row) => {
        if (platformFilter !== ALL_FILTER_VALUE && row.app.platform !== platformFilter) return false;
        if (storeFilter !== ALL_FILTER_VALUE && row.app.store_account_name !== storeFilter) return false;
        return appMatchesSearch(row.app, search);
      });
  }, [data.deviceTokens, data.notificationSchedules, data.storeMappings, platformFilter, search, storeFilter]);

  const totalTokens = appRows.reduce((total, row) => total + row.tokens.length, 0);
  const activeTokens = appRows.reduce((total, row) => total + row.activeTokens.length, 0);
  const totalSchedules = appRows.reduce((total, row) => total + row.schedules.length, 0);
  const activeSchedules = appRows.reduce((total, row) => total + row.activeSchedules.length, 0);

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
          <div className="mt-2 font-mono text-2xl font-semibold">{numberLabel(appRows.length)}</div>
          <div className="mt-1 text-xs text-muted-foreground">matching current filters</div>
        </div>
        <div className="rounded-xl border bg-background p-4 shadow-sm shadow-slate-200/50">
          <div className="text-xs font-medium text-muted-foreground">Registered tokens</div>
          <div className="mt-2 font-mono text-2xl font-semibold">{numberLabel(totalTokens)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{numberLabel(activeTokens)} active</div>
        </div>
        <div className="rounded-xl border bg-background p-4 shadow-sm shadow-slate-200/50">
          <div className="text-xs font-medium text-muted-foreground">Schedules</div>
          <div className="mt-2 font-mono text-2xl font-semibold">{numberLabel(totalSchedules)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{numberLabel(activeSchedules)} active</div>
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
                {appRows.length} app(s), {numberLabel(activeTokens)} active FCM token record(s). Open a row to view token detail.
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
              <RefreshCw size={15} />
              Refresh
            </Button>
          </div>
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_12rem_14rem]">
            <label className="relative block min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 pl-9"
                placeholder="Search app, app id, package, bundle, store..."
              />
            </label>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>All platforms</SelectItem>
                <SelectItem value="android">Android</SelectItem>
                <SelectItem value="ios">iOS</SelectItem>
              </SelectContent>
            </Select>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
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
              {appRows.length ? (
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
                        <Badge variant="secondary" className="h-6 gap-1.5 rounded-md px-2 text-xs">
                          <PlatformIcon platform={row.app.platform} />
                          {platformLabel(row.app.platform)}
                        </Badge>
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
                <TableEmptyState colSpan={9} icon={ListFilter} title="No apps" description="Adjust filters or create app mappings first." />
              )}
            </TableBody>
          </Table>
        </div>
      </section>

    </div>
  );
}
