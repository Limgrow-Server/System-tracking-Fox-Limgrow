"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronsUpDown,
  Clock3,
  MessageSquareText,
  Pause,
  Play,
  RefreshCw,
  Save,
  Search,
  Smartphone,
  Trash2,
} from "lucide-react";
import { showToast } from "@/lib/client/toast";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyPanel,
  PageHeader,
  StatCard,
  StatusBadge,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { compactNumber, dateTime } from "@/lib/tracking/format";
import type {
  PaginationMeta,
  ReviewFetchScheduleApp,
  ReviewFetchScheduleDto,
  ReviewFetchSchedulePageData,
} from "@/lib/tracking/page-data";
import { cn } from "@/lib/utils";

const DEFAULT_REVIEW_FETCH_INTERVAL_HOURS = 8;
const MIN_REVIEW_FETCH_INTERVAL_HOURS = 1;
const MAX_REVIEW_FETCH_INTERVAL_HOURS = 24;

type ScheduleAction = "delete" | "pause" | "resume" | "save";

type FullScanTarget =
  | { scope: "all" }
  | { appName: string; scope: "app"; storeMappingId: string };

type BulkScheduleResponse = {
  appliedCount?: number;
  deleted?: boolean;
  error?: string;
  message?: string;
  ok?: boolean;
  schedule?: ReviewFetchScheduleDto | null;
};

type ScheduleAppsResponse = {
  data?: ReviewFetchScheduleApp[];
  error?: string;
  filters?: ReviewFetchSchedulePageData["filters"];
  page?: number;
  pageSize?: number;
  schedule?: ReviewFetchScheduleDto | null;
  storeOptions?: ReviewFetchSchedulePageData["storeOptions"];
  success?: boolean;
  summary?: ReviewFetchSchedulePageData["summary"];
  total?: number;
  totalPages?: number;
};

type FullScanResponse = {
  error?: string;
  ok?: boolean;
  result?: {
    enqueued: number;
    requested: number;
    skipped: number;
    status: string;
  };
};

function scheduleIntervalLabel(schedule: ReviewFetchScheduleDto | null) {
  if (!schedule) return "No schedule";

  return `Every ${schedule.intervalHours}h`;
}

function normalizedIntervalHours(value: number | null | undefined) {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_REVIEW_FETCH_INTERVAL_HOURS &&
    value <= MAX_REVIEW_FETCH_INTERVAL_HOURS
  ) {
    return String(value);
  }

  return String(DEFAULT_REVIEW_FETCH_INTERVAL_HOURS);
}

function finalizeIntervalHours(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_REVIEW_FETCH_INTERVAL_HOURS;
  return Math.min(
    Math.max(parsed, MIN_REVIEW_FETCH_INTERVAL_HOURS),
    MAX_REVIEW_FETCH_INTERVAL_HOURS,
  );
}

export function ReviewFetchSchedulePage({
  data,
}: {
  data: ReviewFetchSchedulePageData;
}) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(data.schedule);
  const [apps, setApps] = useState(data.apps);
  const [appPagination, setAppPagination] =
    useState<PaginationMeta>(data.appPagination);
  const [summary, setSummary] = useState(data.summary);
  const [storeOptions, setStoreOptions] = useState(data.storeOptions);
  const [searchQuery, setSearchQuery] = useState(data.filters.search);
  const [selectedStore, setSelectedStore] = useState(
    data.filters.storeProfileId,
  );
  const [openStoreCombobox, setOpenStoreCombobox] = useState(false);
  const [pendingAction, setPendingAction] = useState<ScheduleAction | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fullScanTarget, setFullScanTarget] = useState<FullScanTarget | null>(
    null,
  );
  const [fullScanPending, setFullScanPending] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);
  const [intervalHours, setIntervalHours] = useState(
    normalizedIntervalHours(data.schedule?.intervalHours),
  );

  const selectedStoreLabel =
    selectedStore === "all"
      ? "All Stores"
      : storeOptions.find((store) => store.id === selectedStore)?.name ??
        "All Stores";
  const formDisabled = Boolean(pendingAction) || summary.appCount === 0;
  const canPauseSchedule = schedule?.status === "active";
  const canResumeSchedule = schedule?.status === "paused";

  async function loadScheduleAppsPage(
    page: number,
    overrides?: {
      searchQuery?: string;
      selectedStore?: string;
    },
  ) {
    const nextSearch = overrides?.searchQuery ?? searchQuery;
    const nextStore = overrides?.selectedStore ?? selectedStore;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "10",
    });

    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    if (nextStore !== "all") params.set("storeProfileId", nextStore);

    setLoadingApps(true);

    try {
      const response = await fetch(
        `/api/comments/schedule-apps?${params.toString()}`,
      );
      const payload = (await response.json()) as ScheduleAppsResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Schedule apps could not be loaded.");
      }

      setApps(payload.data);
      setAppPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 10,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
      if (payload.summary) setSummary(payload.summary);
      if ("schedule" in payload) setSchedule(payload.schedule ?? null);
      if (payload.storeOptions) setStoreOptions(payload.storeOptions);
    } catch (error) {
      void showToast("error",
        error instanceof Error
          ? error.message
          : "Schedule apps could not be loaded.",
      );
    } finally {
      setLoadingApps(false);
    }
  }

  async function saveAllSchedules() {
    if (pendingAction) return;

    setPendingAction("save");

    try {
      const scheduledIntervalHours = finalizeIntervalHours(intervalHours);
      setIntervalHours(String(scheduledIntervalHours));

      const response = await fetch("/api/review-fetch-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intervalHours: scheduledIntervalHours,
          status: "active",
        }),
      });
      const payload = (await response.json()) as BulkScheduleResponse;

      if (!response.ok || !payload.ok || !payload.schedule) {
        throw new Error(payload.error ?? "Schedules could not be saved.");
      }

      setSchedule(payload.schedule);
      setIntervalHours(String(payload.schedule.intervalHours));
      await loadScheduleAppsPage(appPagination.page);
      void showToast("success", payload.message ?? "Schedules saved.");
      router.refresh();
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "Schedules could not be saved.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function updateAllScheduleStatus(status: "active" | "paused") {
    if (pendingAction) return;

    setPendingAction(status === "active" ? "resume" : "pause");

    try {
      const response = await fetch("/api/review-fetch-schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
        }),
      });
      const payload = (await response.json()) as BulkScheduleResponse;

      if (!response.ok || !payload.ok || !payload.schedule) {
        throw new Error(payload.error ?? "Schedules could not be updated.");
      }

      setSchedule(payload.schedule);
      setIntervalHours(String(payload.schedule.intervalHours));
      await loadScheduleAppsPage(appPagination.page);
      void showToast("success", payload.message ?? "Schedules updated.");
      router.refresh();
    } catch (error) {
      void showToast("error",
        error instanceof Error
          ? error.message
          : "Schedules could not be updated.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteAllSchedules() {
    if (pendingAction) return;

    setPendingAction("delete");

    try {
      const response = await fetch("/api/review-fetch-schedules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as BulkScheduleResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Schedules could not be deleted.");
      }

      setSchedule(null);
      await loadScheduleAppsPage(appPagination.page);
      setDeleteDialogOpen(false);
      void showToast("success", payload.message ?? "Schedules deleted.");
      router.refresh();
    } catch (error) {
      void showToast("error",
        error instanceof Error
          ? error.message
          : "Schedules could not be deleted.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function enqueueFullScan() {
    if (!fullScanTarget || fullScanPending) return;

    setFullScanPending(true);

    try {
      const response = await fetch("/api/review-fetch-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          fullScanTarget.scope === "all"
            ? { scanMode: "full", scope: "all", triggerType: "manual" }
            : {
                scanMode: "full",
                storeMappingId: fullScanTarget.storeMappingId,
                triggerType: "manual",
              },
        ),
      });
      const payload = (await response.json()) as FullScanResponse;

      if (!response.ok || !payload.ok || !payload.result) {
        throw new Error(payload.error ?? "Full scan could not be queued.");
      }

      setFullScanTarget(null);
      void showToast("success",
        `Queued ${payload.result.enqueued} full scan job(s). ${payload.result.skipped} already running or queued.`,
      );
      router.refresh();
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "Full scan could not be queued.",
      );
    } finally {
      setFullScanPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Google Play"
        title="Schedule"
        description="Fetch Google Play comments repeatedly for all active Android apps."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Apps"
          value={compactNumber(summary.appCount)}
          detail={`${compactNumber(summary.scheduledCount)} scheduled`}
          icon={Smartphone}
          trend="flat"
        />
        <StatCard
          label="Active"
          value={compactNumber(summary.activeCount)}
          detail={`${compactNumber(summary.pausedCount)} paused`}
          icon={Play}
          trend={summary.activeCount ? "up" : "flat"}
        />
        <StatCard
          label="Unscheduled"
          value={compactNumber(summary.unscheduledCount)}
          detail="Missing fetch schedule"
          icon={Pause}
          trend={summary.appCount === summary.scheduledCount ? "up" : "flat"}
        />
        <StatCard
          label="Next Run"
          value={dateTime(summary.nextRunAt)}
          detail="Earliest scheduled app"
          icon={CalendarClock}
          trend="flat"
        />
      </div>

      <Card className="rounded-lg">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Review Fetch Schedule</CardTitle>
          <StatusBadge status={summary.scheduleStatus} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,14rem)_1fr] md:items-end">
            <div className="grid gap-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                Interval
              </div>
              <Input
                type="number"
                inputMode="numeric"
                min={MIN_REVIEW_FETCH_INTERVAL_HOURS}
                max={MAX_REVIEW_FETCH_INTERVAL_HOURS}
                step={1}
                placeholder="Hours"
                value={intervalHours}
                onChange={(event) =>
                  setIntervalHours(event.target.value.replace(/\D/g, "").slice(0, 2))
                }
                onBlur={() =>
                  setIntervalHours(String(finalizeIntervalHours(intervalHours)))
                }
                disabled={formDisabled}
              />
              <div className="text-xs text-muted-foreground">
                Every {finalizeIntervalHours(intervalHours)} hour(s)
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button
                type="button"
                onClick={saveAllSchedules}
                disabled={formDisabled}
              >
                {pendingAction === "save" ? <Spinner /> : <Save size={14} />}
                Start schedule
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => updateAllScheduleStatus("paused")}
                disabled={formDisabled || !canPauseSchedule}
              >
                {pendingAction === "pause" ? <Spinner /> : <Pause size={14} />}
                Pause schedule
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => updateAllScheduleStatus("active")}
                disabled={formDisabled || !canResumeSchedule}
              >
                {pendingAction === "resume" ? <Spinner /> : <Play size={14} />}
                Resume schedule
              </Button>
              <Dialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={formDisabled || summary.scheduledCount === 0}
                  >
                    <Trash2 size={14} />
                    Delete schedule
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete schedule?</DialogTitle>
                    <DialogDescription>
                      This removes the comment fetch schedule from every
                      active Android app.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDeleteDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={deleteAllSchedules}
                      disabled={pendingAction === "delete"}
                    >
                      {pendingAction === "delete" ? (
                        <Spinner />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      Delete schedule
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search apps, packages or stores..."
              className="pl-8"
              value={searchQuery}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSearchQuery(nextValue);
                void loadScheduleAppsPage(1, { searchQuery: nextValue });
              }}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:items-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFullScanTarget({ scope: "all" })}
              disabled={fullScanPending || summary.appCount === 0}
            >
              <RefreshCw size={14} />
              Full scan all apps
            </Button>
            <Popover open={openStoreCombobox} onOpenChange={setOpenStoreCombobox}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openStoreCombobox}
                  className="w-full justify-between lg:w-[260px]"
                >
                  {selectedStoreLabel}
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search store..." />
                  <CommandList>
                    <CommandEmpty>No store found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setSelectedStore("all");
                          setOpenStoreCombobox(false);
                          void loadScheduleAppsPage(1, { selectedStore: "all" });
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 size-4",
                            selectedStore === "all"
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        All Stores
                      </CommandItem>
                      {storeOptions.map((store) => (
                        <CommandItem
                          key={store.id}
                          value={store.name}
                          onSelect={() => {
                            setSelectedStore(store.id);
                            setOpenStoreCombobox(false);
                            void loadScheduleAppsPage(1, {
                              selectedStore: store.id,
                            });
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 size-4",
                              selectedStore === store.id
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {store.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="overflow-x-auto p-4">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Next run</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-left">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <TableRow key={app.mappingId}>
                    <TableCell>
                      <div className="flex min-w-[15rem] items-center gap-3">
                        <Avatar className="size-10 rounded-lg border">
                          {app.appIconUrl ? (
                            <AvatarImage
                              src={app.appIconUrl}
                              alt={app.appName}
                              className="rounded-lg"
                            />
                          ) : null}
                          <AvatarFallback className="rounded-lg text-xs">
                            {app.appName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {app.appName}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {app.identifier}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[10rem] text-sm">
                        {app.storeAccountName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[13rem] items-center gap-2 text-sm">
                        <Clock3 size={14} className="text-muted-foreground" />
                        {scheduleIntervalLabel(schedule)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[10rem] text-sm">
                        {dateTime(schedule?.nextRunAt ?? null)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[10rem] text-sm">
                        {dateTime(schedule?.lastRunAt ?? null)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={schedule?.status ?? "no_schedule"} />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={fullScanPending}
                        onClick={() =>
                          setFullScanTarget({
                            appName: app.appName,
                            scope: "app",
                            storeMappingId: app.mappingId,
                          })
                        }
                      >
                        <RefreshCw size={14} />
                        Full scan
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!apps.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10">
                      <EmptyPanel
                        icon={MessageSquareText}
                        title={loadingApps ? "Loading apps" : "No apps found"}
                        description={
                          loadingApps
                            ? "The current page is being loaded."
                            : "Adjust the current filters."
                        }
                        className="border-0 shadow-none"
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <TablePaginationFooter
            onPageChange={(page) => void loadScheduleAppsPage(page)}
            page={appPagination.page}
            shown={apps.length}
            total={appPagination.total}
            totalPages={appPagination.totalPages}
          />
        </div>
      </div>

      <Dialog
        open={Boolean(fullScanTarget)}
        onOpenChange={(open) => {
          if (!open && !fullScanPending) setFullScanTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {fullScanTarget?.scope === "all"
                ? "Full scan all apps?"
                : "Full scan this app?"}
            </DialogTitle>
            <DialogDescription>
              {fullScanTarget?.scope === "all"
                ? "This will queue a full Google Play review scan for every active Android app. It can consume many Google API requests."
                : `This will queue a full Google Play review scan for ${fullScanTarget?.appName ?? "this app"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              Schedule jobs still use incremental early-stop. Full scan should
              be used when you need to backfill or re-check all reviews Google
              still returns.
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFullScanTarget(null)}
              disabled={fullScanPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={enqueueFullScan}
              disabled={fullScanPending}
            >
              {fullScanPending ? <Spinner /> : <RefreshCw size={14} />}
              Queue full scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
