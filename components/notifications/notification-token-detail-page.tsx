"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Bell, Clock3, RefreshCw, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/client/toast";

import {
  EmptyPanel,
  PageHeader,
  StatusBadge,
  TableEmptyState,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { valuesMatchSearch } from "@/lib/search";
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

const TOKEN_SKELETON_COUNT = 8;

function statusValue(value: string | null | undefined) {
  return (value ?? "unknown").toLowerCase();
}

function identifierForToken(token: DeviceToken) {
  return token.app_identifier ?? token.package_name ?? token.bundle_id ?? token.product_app_id ?? token.app_id ?? "No identifier";
}

function appMatchesRouteId(app: StoreMapping, appId: string) {
  const normalizedAppId = appId.toLowerCase();

  return (
    app.id === appId ||
    app.app_id?.toLowerCase() === normalizedAppId ||
    app.package_name?.toLowerCase() === normalizedAppId ||
    app.bundle_id?.toLowerCase() === normalizedAppId ||
    valuesMatchSearch([app.id, app.app_id, app.package_name, app.bundle_id], appId)
  );
}

function tokenDetailValue(value: string | null | undefined) {
  return value?.trim() || "No data";
}

function TokenDetailItem({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={mono ? "mt-1 break-all font-mono text-xs" : "mt-1 break-words text-sm font-medium"}>
        {tokenDetailValue(value)}
      </div>
    </div>
  );
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

type DeleteTokenResponse = {
  deletedCount?: number;
  error?: string;
  ok?: boolean;
};

export function NotificationTokenDetailPage({
  appId,
  canManage,
  data,
}: {
  appId: string;
  canManage: boolean;
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
  const [loadingPage, setLoadingPage] = useState<number | null>(null);
  const [deletingTokenId, setDeletingTokenId] = useState<string | null>(null);
  const [deletingSelectedTokens, setDeletingSelectedTokens] = useState(false);
  const [selectedToken, setSelectedToken] = useState<DeviceToken | null>(null);
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<DeviceToken | null>(null);
  const selectedApp = useMemo(
    () => data.storeMappings.find((app) => appMatchesRouteId(app, appId)) ?? null,
    [appId, data.storeMappings]
  );

  const selectedTokens = useMemo(() => {
    if (!selectedApp) return [];
    return tokensForApp(selectedApp, deviceTokens)
      .sort((first, second) => new Date(second.last_seen_at).getTime() - new Date(first.last_seen_at).getTime());
  }, [deviceTokens, selectedApp]);
  const selectedTokenIdSet = useMemo(
    () => new Set(selectedTokenIds),
    [selectedTokenIds],
  );
  const selectedVisibleTokens = useMemo(
    () => selectedTokens.filter((token) => selectedTokenIdSet.has(token.id)),
    [selectedTokenIdSet, selectedTokens],
  );
  const allVisibleTokensSelected =
    selectedTokens.length > 0 &&
    selectedTokens.every((token) => selectedTokenIdSet.has(token.id));
  const someVisibleTokensSelected =
    !allVisibleTokensSelected &&
    selectedTokens.some((token) => selectedTokenIdSet.has(token.id));

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
    setLoadingPage(page);

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
      setSelectedTokenIds([]);
      setTokenPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 10,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
      if (payload.summary) setTokenSummary(payload.summary);
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "FCM tokens could not be loaded.",
      );
    } finally {
      setLoadingTokens(false);
      setLoadingPage(null);
    }
  }

  function openDeleteTokenDialog(token: DeviceToken) {
    setSelectedToken(null);
    setTokenToDelete(token);
  }

  function updateTokenSelection(tokenId: string, checked: boolean) {
    setSelectedTokenIds((current) => {
      if (checked) return current.includes(tokenId) ? current : [...current, tokenId];
      return current.filter((id) => id !== tokenId);
    });
  }

  function updateVisibleTokenSelection(checked: boolean) {
    const visibleIds = selectedTokens.map((token) => token.id);
    setSelectedTokenIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...visibleIds]));
      }

      const visibleIdSet = new Set(visibleIds);
      return current.filter((id) => !visibleIdSet.has(id));
    });
  }

  function clearSelectedTokens() {
    setSelectedTokenIds([]);
  }

  async function deleteToken(token: DeviceToken) {
    setDeletingTokenId(token.id);

    try {
      const response = await fetch(
        `/api/admin/notifications/tokens?id=${encodeURIComponent(token.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as DeleteTokenResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "FCM token could not be deleted.");
      }

      void showToast("success", "FCM token deleted.");
      setTokenToDelete(null);
      setSelectedToken((current) => current?.id === token.id ? null : current);
      setSelectedTokenIds((current) => current.filter((id) => id !== token.id));
      const nextPage = selectedTokens.length <= 1 && tokenPagination.page > 1
        ? tokenPagination.page - 1
        : tokenPagination.page;
      await loadTokenPage(nextPage);
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "FCM token could not be deleted.",
      );
    } finally {
      setDeletingTokenId(null);
    }
  }

  async function deleteSelectedTokens() {
    const ids = selectedVisibleTokens.map((token) => token.id);
    if (!ids.length) return;

    setDeletingSelectedTokens(true);

    try {
      const response = await fetch("/api/admin/notifications/tokens", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const payload = (await response.json()) as DeleteTokenResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "FCM tokens could not be deleted.");
      }

      const deletedCount = payload.deletedCount ?? ids.length;
      void showToast("success", `${numberLabel(deletedCount)} FCM token(s) deleted.`);
      setBulkDeleteOpen(false);
      setSelectedToken((current) => current && ids.includes(current.id) ? null : current);
      setSelectedTokenIds([]);
      const nextPage = selectedTokens.length <= ids.length && tokenPagination.page > 1
        ? tokenPagination.page - 1
        : tokenPagination.page;
      await loadTokenPage(nextPage);
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "FCM tokens could not be deleted.",
      );
    } finally {
      setDeletingSelectedTokens(false);
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
                <div className="flex w-full flex-col gap-2 lg:w-[30rem]">
                  {canManage ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {selectedVisibleTokens.length ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={clearSelectedTokens}
                          disabled={deletingSelectedTokens}
                        >
                          Clear {numberLabel(selectedVisibleTokens.length)}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={!selectedVisibleTokens.length || deletingSelectedTokens}
                        onClick={() => setBulkDeleteOpen(true)}
                      >
                        {deletingSelectedTokens ? <Spinner className="size-3.5" /> : <Trash2 size={14} />}
                        Delete selected
                      </Button>
                    </div>
                  ) : null}
                  <label className="relative block w-full">
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
            </div>
            <div className="overflow-auto">
              <Table className={canManage ? "min-w-[1220px] text-sm" : "min-w-[1080px] text-sm"}>
                <TableHeader>
                  <TableRow>
                    {canManage ? (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allVisibleTokensSelected ? true : someVisibleTokensSelected ? "indeterminate" : false}
                          disabled={!selectedTokens.length || loadingTokens || deletingSelectedTokens}
                          onCheckedChange={(checked) => updateVisibleTokenSelection(checked === true)}
                          aria-label="Select all FCM tokens on this page"
                        />
                      </TableHead>
                    ) : null}
                    <TableHead>FCM token</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-32">Device type</TableHead>
                    <TableHead className="w-24">Locale</TableHead>
                    <TableHead className="w-40">App version</TableHead>
                    <TableHead className="w-40">OS</TableHead>
                    <TableHead className="w-44">Last seen</TableHead>
                    {canManage ? <TableHead className="w-20 text-right">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingTokens ? (
                    Array.from({ length: TOKEN_SKELETON_COUNT }).map((_, index) => (
                      <TableRow key={`token-skeleton-${index}`}>
                        {canManage ? (
                          <TableCell>
                            <div className="size-4 animate-pulse rounded bg-muted" />
                          </TableCell>
                        ) : null}
                        <TableCell className="max-w-[32rem]">
                          <div className="h-4 w-72 animate-pulse rounded bg-muted" />
                          <div className="mt-2 h-3 w-52 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-14 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <div className="ml-auto h-7 w-7 animate-pulse rounded-md bg-muted" />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  ) : selectedTokens.length ? (
                    selectedTokens.map((token) => (
                      <TableRow
                        key={token.id}
                        className="cursor-pointer transition-colors hover:bg-muted/35"
                        onClick={() => setSelectedToken(token)}
                      >
                        {canManage ? (
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={selectedTokenIdSet.has(token.id)}
                              disabled={deletingSelectedTokens}
                              onCheckedChange={(checked) => updateTokenSelection(token.id, checked === true)}
                              aria-label={`Select FCM token for ${token.device_id}`}
                            />
                          </TableCell>
                        ) : null}
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
                        <TableCell className="font-mono text-xs">{token.device_type ?? "No data"}</TableCell>
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
                        {canManage ? (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon-sm"
                              title="Delete FCM token"
                              disabled={deletingTokenId === token.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                openDeleteTokenDialog(token);
                              }}
                            >
                              {deletingTokenId === token.id ? <Spinner className="size-3.5" /> : <Trash2 size={14} />}
                              <span className="sr-only">Delete FCM token</span>
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyState
                      colSpan={canManage ? 9 : 7}
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
              loadingPage={loadingPage}
            />
          </section>

          <Dialog open={Boolean(selectedToken)} onOpenChange={(open) => !open && setSelectedToken(null)}>
            <DialogContent className="max-h-[86dvh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>FCM token detail</DialogTitle>
                <DialogDescription>
                  Token identity, app matching fields, and device metadata for this app.
                </DialogDescription>
              </DialogHeader>

              {selectedToken ? (
                <div className="space-y-4">
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="text-xs font-medium text-muted-foreground">FCM token</div>
                    <div className="mt-1 break-all font-mono text-xs">{selectedToken.fcm_token}</div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <TokenDetailItem label="Device ID" value={selectedToken.device_id} mono />
                    <TokenDetailItem label="App identifier" value={selectedToken.app_identifier} mono />
                    <TokenDetailItem label="Status" value={selectedToken.status} />
                    <TokenDetailItem label="Device type" value={selectedToken.device_type} />
                    <TokenDetailItem label="App ID" value={selectedToken.app_id} mono />
                    <TokenDetailItem label="Product app ID" value={selectedToken.product_app_id} mono />
                    <TokenDetailItem label="Package name" value={selectedToken.package_name} mono />
                    <TokenDetailItem label="Bundle ID" value={selectedToken.bundle_id} mono />
                    <TokenDetailItem label="Store" value={selectedToken.store_account_name} />
                    <TokenDetailItem label="Store platform" value={selectedToken.store_platform} />
                    <TokenDetailItem label="Locale" value={selectedToken.locale} />
                    <TokenDetailItem label="App version" value={selectedToken.app_version} />
                    <TokenDetailItem label="OS version" value={selectedToken.os_version} />
                    <TokenDetailItem label="Device model" value={selectedToken.device_model} />
                    <TokenDetailItem label="Manufacturer" value={selectedToken.device_manufacturer} />
                    <TokenDetailItem label="Firebase project" value={selectedToken.firebase_project_id} mono />
                    <TokenDetailItem label="Last seen" value={dateTime(selectedToken.last_seen_at)} />
                    <TokenDetailItem label="Created" value={dateTime(selectedToken.created_at)} />
                    <TokenDetailItem label="Updated" value={dateTime(selectedToken.updated_at)} />
                  </div>
                  {canManage ? (
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={deletingTokenId === selectedToken.id}
                        onClick={() => openDeleteTokenDialog(selectedToken)}
                      >
                        {deletingTokenId === selectedToken.id ? <Spinner className="size-3.5" /> : <Trash2 size={14} />}
                        Delete token
                      </Button>
                    </DialogFooter>
                  ) : null}
                </div>
              ) : null}
            </DialogContent>
          </Dialog>

          <Dialog
            open={bulkDeleteOpen}
            onOpenChange={(open) => {
              if (!open && !deletingSelectedTokens) setBulkDeleteOpen(false);
            }}
          >
            <DialogContent showCloseButton={!deletingSelectedTokens}>
              <DialogHeader>
                <DialogTitle>Delete selected FCM tokens</DialogTitle>
                <DialogDescription>
                  {numberLabel(selectedVisibleTokens.length)} selected token(s) will be removed from active targeting and token lists.
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
                {selectedVisibleTokens.slice(0, 8).map((token) => (
                  <div key={token.id} className="rounded-md border bg-background p-2">
                    <div className="truncate font-mono text-xs">{token.device_id}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{identifierForToken(token)}</div>
                  </div>
                ))}
                {selectedVisibleTokens.length > 8 ? (
                  <div className="px-1 text-xs text-muted-foreground">
                    +{numberLabel(selectedVisibleTokens.length - 8)} more token(s)
                  </div>
                ) : null}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={deletingSelectedTokens}
                  onClick={() => setBulkDeleteOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!selectedVisibleTokens.length || deletingSelectedTokens}
                  onClick={() => void deleteSelectedTokens()}
                >
                  {deletingSelectedTokens ? <Spinner className="size-3.5" /> : <Trash2 size={14} />}
                  Delete selected
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={Boolean(tokenToDelete)}
            onOpenChange={(open) => {
              if (!open && !deletingTokenId) setTokenToDelete(null);
            }}
          >
            <DialogContent showCloseButton={!deletingTokenId}>
              <DialogHeader>
                <DialogTitle>Delete FCM token</DialogTitle>
                <DialogDescription>
                  This token will be removed from active targeting and token lists.
                </DialogDescription>
              </DialogHeader>

              {tokenToDelete ? (
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-xs font-medium text-muted-foreground">Device</div>
                  <div className="mt-1 truncate font-mono text-xs">{tokenToDelete.device_id}</div>
                  <div className="mt-2 text-xs font-medium text-muted-foreground">FCM token</div>
                  <div className="mt-1 break-all font-mono text-xs">{tokenToDelete.fcm_token}</div>
                </div>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(deletingTokenId)}
                  onClick={() => setTokenToDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!tokenToDelete || Boolean(deletingTokenId)}
                  onClick={() => tokenToDelete && void deleteToken(tokenToDelete)}
                >
                  {deletingTokenId ? <Spinner className="size-3.5" /> : <Trash2 size={14} />}
                  Delete token
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
