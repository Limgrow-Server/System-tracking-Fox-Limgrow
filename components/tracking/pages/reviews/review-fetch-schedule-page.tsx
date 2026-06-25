"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  ChevronsUpDown,
  Clock3,
  MessageSquareText,
  Pause,
  Play,
  Save,
  Search,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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

const DEFAULT_REVIEW_FETCH_TIME = "09:00";
const DEFAULT_REVIEW_FETCH_TIMEZONE = "Asia/Ho_Chi_Minh";

type ScheduleAction = "delete" | "pause" | "resume" | "save";

type BulkScheduleResponse = {
  appliedCount?: number;
  deleted?: number;
  error?: string;
  message?: string;
  ok?: boolean;
  schedules?: Array<ReviewFetchScheduleDto | null>;
};

type ScheduleAppsResponse = {
  data?: ReviewFetchScheduleApp[];
  error?: string;
  filters?: ReviewFetchSchedulePageData["filters"];
  page?: number;
  pageSize?: number;
  storeOptions?: ReviewFetchSchedulePageData["storeOptions"];
  success?: boolean;
  summary?: ReviewFetchSchedulePageData["summary"];
  total?: number;
  totalPages?: number;
};

function scheduleTimeLabel(schedule: ReviewFetchScheduleDto | null) {
  if (!schedule) return "No schedule";

  return schedule.timeOfDay;
}

function isValidTime(value: string | null | undefined) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value ?? "");
}

function normalizedTime(value: string | null | undefined): string {
  return value && isValidTime(value) ? value : DEFAULT_REVIEW_FETCH_TIME;
}

function timePart(value: number) {
  return String(value).padStart(2, "0");
}

function boundedTimePart(value: string, max: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), max);
}

function sanitizeTimeInput(value: string) {
  const cleanValue = value.replace(/[^\d:]/g, "");
  if (cleanValue.includes(":")) {
    const [hour = "", minute = ""] = cleanValue.split(":");
    return `${hour.replace(/\D/g, "").slice(0, 2)}:${minute.replace(/\D/g, "").slice(0, 2)}`.slice(0, 5);
  }

  const digits = cleanValue.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  if (digits.length === 3) return `${digits.slice(0, 1)}:${digits.slice(1)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function finalizeTimeInput(value: string) {
  if (isValidTime(value)) return value;

  if (value.includes(":")) {
    const [hour = "", minute = ""] = value.split(":");
    return `${timePart(boundedTimePart(hour, 23))}:${timePart(boundedTimePart(minute, 59))}`;
  }

  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (!digits) return DEFAULT_REVIEW_FETCH_TIME;
  const hour = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
  const minute = digits.length <= 2 ? "0" : digits.slice(hour.length);

  return `${timePart(boundedTimePart(hour, 23))}:${timePart(boundedTimePart(minute, 59))}`;
}

function firstConfiguredSchedule(data: ReviewFetchSchedulePageData) {
  return data.apps.find((app) => app.fetchSchedule)?.fetchSchedule ?? null;
}

function scheduleMap(schedules: Array<ReviewFetchScheduleDto | null> | undefined) {
  return new Map(
    (schedules ?? [])
      .filter((schedule): schedule is ReviewFetchScheduleDto => Boolean(schedule))
      .map((schedule) => [schedule.storeMappingId, schedule]),
  );
}

export function ReviewFetchSchedulePage({
  data,
}: {
  data: ReviewFetchSchedulePageData;
}) {
  const router = useRouter();
  const initialSchedule = firstConfiguredSchedule(data);
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
  const [loadingApps, setLoadingApps] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState(
    normalizedTime(initialSchedule?.timeOfDay),
  );
  const timezone = DEFAULT_REVIEW_FETCH_TIMEZONE;

  const selectedStoreLabel =
    selectedStore === "all"
      ? "All Stores"
      : storeOptions.find((store) => store.id === selectedStore)?.name ??
        "All Stores";
  const formDisabled = Boolean(pendingAction) || summary.appCount === 0;
  const canPauseSchedule = summary.activeCount > 0;
  const canResumeSchedule = summary.pausedCount > 0;

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
      if (payload.storeOptions) setStoreOptions(payload.storeOptions);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Schedule apps could not be loaded.",
      );
    } finally {
      setLoadingApps(false);
    }
  }

  function applySchedulesToState(schedules: Array<ReviewFetchScheduleDto | null>) {
    const byMappingId = scheduleMap(schedules);
    const firstSchedule = schedules.find(
      (schedule): schedule is ReviewFetchScheduleDto => Boolean(schedule),
    );

    setApps((current) =>
      current.map((app) => ({
        ...app,
        fetchSchedule: byMappingId.get(app.mappingId) ?? app.fetchSchedule,
      })),
    );
    if (firstSchedule) setTimeOfDay(firstSchedule.timeOfDay);
  }

  async function saveAllSchedules() {
    if (pendingAction) return;

    setPendingAction("save");

    try {
      const scheduledTime = finalizeTimeInput(timeOfDay);
      setTimeOfDay(scheduledTime);

      const response = await fetch("/api/review-fetch-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "all",
          status: "active",
          timeOfDay: scheduledTime,
          timezone,
        }),
      });
      const payload = (await response.json()) as BulkScheduleResponse;

      if (!response.ok || !payload.ok || !payload.schedules) {
        throw new Error(payload.error ?? "Schedules could not be saved.");
      }

      applySchedulesToState(payload.schedules);
      await loadScheduleAppsPage(appPagination.page);
      toast.success(payload.message ?? "Schedules saved.");
      router.refresh();
    } catch (error) {
      toast.error(
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
          scope: "all",
          status,
        }),
      });
      const payload = (await response.json()) as BulkScheduleResponse;

      if (!response.ok || !payload.ok || !payload.schedules) {
        throw new Error(payload.error ?? "Schedules could not be updated.");
      }

      applySchedulesToState(payload.schedules);
      await loadScheduleAppsPage(appPagination.page);
      toast.success(payload.message ?? "Schedules updated.");
      router.refresh();
    } catch (error) {
      toast.error(
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
        body: JSON.stringify({ scope: "all" }),
      });
      const payload = (await response.json()) as BulkScheduleResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Schedules could not be deleted.");
      }

      setApps((current) =>
        current.map((app) => ({ ...app, fetchSchedule: null })),
      );
      await loadScheduleAppsPage(appPagination.page);
      setDeleteDialogOpen(false);
      toast.success(payload.message ?? "Schedules deleted.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Schedules could not be deleted.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Google Play"
        title="Schedule"
        description="Schedule daily comment fetch for all active Android apps."
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
          <CardTitle className="text-base">Daily Schedule</CardTitle>
          <StatusBadge status={summary.scheduleStatus} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,14rem)_1fr] md:items-end">
            <div className="grid gap-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                Run at
              </div>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={5}
                placeholder="HH:mm"
                value={timeOfDay}
                onChange={(event) =>
                  setTimeOfDay(sanitizeTimeInput(event.target.value))
                }
                onBlur={() => setTimeOfDay(finalizeTimeInput(timeOfDay))}
                disabled={formDisabled}
              />
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button
                type="button"
                onClick={saveAllSchedules}
                disabled={formDisabled}
              >
                {pendingAction === "save" ? <Spinner /> : <Save size={14} />}
                Save schedule
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
                      This removes the daily comment fetch schedule from every
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
                        {scheduleTimeLabel(app.fetchSchedule)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[10rem] text-sm">
                        {dateTime(app.fetchSchedule?.nextRunAt ?? null)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[10rem] text-sm">
                        {dateTime(app.fetchSchedule?.lastRunAt ?? null)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={app.fetchSchedule?.status ?? "no_schedule"}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!apps.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10">
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
    </div>
  );
}
