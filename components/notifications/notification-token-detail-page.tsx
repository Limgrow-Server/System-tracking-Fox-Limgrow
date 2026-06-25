"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Bell, Clock3, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyPanel, PageHeader, StatusBadge, TableEmptyState } from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime } from "@/lib/tracking/format";
import type { NotificationsPageData } from "@/lib/tracking/page-data";
import type { DeviceToken, StoreMapping } from "@/lib/tracking/types";

import {
  DeliveryDashboard,
  PlatformIcon,
  compactIdentifier,
  jobMatchesApp,
  numberLabel,
  platformLabel,
  scheduleMatchesApp,
  tokensForApp,
  valuesMatchSearch,
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

export function NotificationTokenDetailPage({
  appId,
  data,
}: {
  appId: string;
  data: NotificationsPageData;
}) {
  const router = useRouter();
  const [tokenSearch, setTokenSearch] = useState("");
  const selectedApp = useMemo(
    () => data.storeMappings.find((app) => appMatchesRouteId(app, appId)) ?? null,
    [appId, data.storeMappings]
  );

  const selectedTokens = useMemo(() => {
    if (!selectedApp) return [];
    return tokensForApp(selectedApp, data.deviceTokens)
      .filter((token) =>
        valuesMatchSearch([
          token.fcm_token,
          token.device_id,
          token.app_id,
          token.product_app_id,
          token.package_name,
          token.bundle_id,
          token.locale,
          token.app_version,
          token.os_version,
          token.status,
        ], tokenSearch)
      )
      .sort((first, second) => new Date(second.last_seen_at).getTime() - new Date(first.last_seen_at).getTime());
  }, [data.deviceTokens, selectedApp, tokenSearch]);

  const selectedActiveTokens = selectedTokens.filter((token) => statusValue(token.status) === "active");
  const selectedSchedules = selectedApp
    ? data.notificationSchedules.filter((schedule) => scheduleMatchesApp(schedule, selectedApp))
    : [];
  const selectedActiveSchedules = selectedSchedules.filter((schedule) => statusValue(schedule.status) === "active");
  const selectedJobs = useMemo(
    () =>
      selectedApp
        ? data.notificationJobs.filter((job) => jobMatchesApp(job, selectedApp))
        : [],
    [data.notificationJobs, selectedApp],
  );
  const selectedJobIds = useMemo(
    () => new Set(selectedJobs.map((job) => job.id)),
    [selectedJobs],
  );
  const selectedEvents = useMemo(
    () =>
      data.notificationEvents.filter(
        (event) => event.job_id && selectedJobIds.has(event.job_id),
      ),
    [data.notificationEvents, selectedJobIds],
  );

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
                <Badge variant="secondary" className="h-6 gap-1.5 rounded-md px-2 text-xs">
                  <PlatformIcon platform={selectedApp.platform} />
                  {platformLabel(selectedApp.platform)}
                </Badge>
              </div>
            </div>
            <div className="rounded-xl border bg-background p-4 shadow-sm shadow-slate-200/50">
              <div className="text-xs font-medium text-muted-foreground">Records</div>
              <div className="mt-2 font-mono text-2xl font-semibold">{numberLabel(selectedTokens.length)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {numberLabel(selectedActiveTokens.length)} active token(s), {numberLabel(selectedActiveSchedules.length)} active schedule(s)
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
                    <Badge variant="secondary" className="h-6 gap-1.5 rounded-md px-2 text-xs">
                      <PlatformIcon platform={selectedApp.platform} />
                      {platformLabel(selectedApp.platform)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {numberLabel(selectedTokens.length)} token record(s), {numberLabel(selectedActiveTokens.length)} active.
                  </div>
                </div>
                <label className="relative block w-full lg:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                  <Input
                    value={tokenSearch}
                    onChange={(event) => setTokenSearch(event.target.value)}
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
                      title="No token records"
                      description="Mobile has not registered an FCM token for this app yet."
                    />
                  )}
                </TableBody>
              </Table>
            </div>
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
