"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, Pause, PencilLine, Play, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { showToast } from "@/lib/client/toast";

import {
  PageHeader,
  StatusBadge,
  TableEmptyState,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime } from "@/lib/tracking/format";
import type { NotificationsPageData, PaginationMeta } from "@/lib/tracking/page-data";
import type { NotificationSchedule, StoreMapping } from "@/lib/tracking/types";
import { cn } from "@/lib/utils";

import {
  ALL_FILTER_VALUE,
  type LocaleRow,
  MESSAGE_MAX_LENGTH,
  PlatformBadge,
  RecordFilterControls,
  type ScheduleContentResponse,
  type ScheduleResponse,
  TITLE_MAX_LENGTH,
  createLocaleRows,
  localePayloadForRows,
  localeRowsFromPayload,
  primaryLocaleRow,
  scheduleAutoGenerateEnabled,
  scheduleDataWithAutoGenerate,
  scheduleDisplayNotification,
  scheduleLabel,
  validateMessageRows,
} from "./shared";

type EditableScheduleType = "once" | "daily" | "monthly";

type SchedulesListResponse = {
  data?: NotificationSchedule[];
  error?: string;
  page?: number;
  pageSize?: number;
  storeMappings?: StoreMapping[];
  storeOptions?: string[];
  success?: boolean;
  total?: number;
  totalPages?: number;
};

function editableScheduleType(value: string | null | undefined): EditableScheduleType {
  return value === "daily" || value === "monthly" ? value : "once";
}

function hcmDateInput(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
  }).formatToParts(safeDate);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function hcmTimeInput(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "09:00";
  const parts = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("hour") || "09"}:${part("minute") || "00"}`;
}

export function NotificationSchedulesPage({
  canManage = false,
  data,
  deferInitialLoad = false,
  initialAppId,
}: {
  canManage?: boolean;
  data: NotificationsPageData;
  deferInitialLoad?: boolean;
  initialAppId?: string;
}) {
  const initialLoadStarted = useRef(false);
  const [storeMappings, setStoreMappings] = useState(data.storeMappings);
  const platformApps = useMemo(() => storeMappings, [storeMappings]);
  const resolvedInitialAppId = initialAppId ?? "";
  const [recordSearch, setRecordSearch] = useState("");
  const [recordAppFilter, setRecordAppFilter] = useState(resolvedInitialAppId || ALL_FILTER_VALUE);
  const [recordStoreFilter, setRecordStoreFilter] = useState(ALL_FILTER_VALUE);
  const [schedules, setSchedules] = useState(data.notificationSchedules);
  const [schedulePagination, setSchedulePagination] = useState<PaginationMeta>(
    data.notificationPagination.schedules ?? {
      page: 1,
      pageSize: 10,
      total: data.notificationSchedules.length,
      totalPages: 1,
    },
  );
  const [storeFilterOptions, setStoreFilterOptions] = useState(
    data.notificationStoreOptions,
  );
  const [loadingSchedules, setLoadingSchedules] = useState(deferInitialLoad);
  const [editingSchedule, setEditingSchedule] = useState<NotificationSchedule | null>(null);
  const [editingScheduleRows, setEditingScheduleRows] = useState<LocaleRow[]>(() => createLocaleRows());
  const [editingScheduleAutoGenerate, setEditingScheduleAutoGenerate] = useState(false);
  const [editingScheduleType, setEditingScheduleType] = useState<EditableScheduleType>("once");
  const [editingScheduledDate, setEditingScheduledDate] = useState(hcmDateInput(null));
  const [editingTimeOfDay, setEditingTimeOfDay] = useState("09:00");
  const [editingDayOfMonth, setEditingDayOfMonth] = useState("1");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const visibleSchedules = schedules;

  async function loadSchedulesPage(
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

    setLoadingSchedules(true);

    try {
      const response = await fetch(
        `/api/admin/notifications/schedules?${params.toString()}`,
      );
      const payload = (await response.json()) as SchedulesListResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Notification schedules could not be loaded.");
      }

      setSchedules(payload.data);
      if (payload.storeMappings) setStoreMappings(payload.storeMappings);
      setSchedulePagination({
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
          : "Notification schedules could not be loaded.",
      );
    } finally {
      setLoadingSchedules(false);
    }
  }

  useEffect(() => {
    if (!deferInitialLoad || initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void loadSchedulesPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferInitialLoad]);

  function updateEditingScheduleRow(topicCode: string, patch: Partial<LocaleRow>) {
    setEditingScheduleRows((current) => current.map((row) => (row.topicCode === topicCode ? { ...row, ...patch } : row)));
  }

  function openScheduleEditor(schedule: NotificationSchedule) {
    if (!canManage) return;
    setEditingSchedule(schedule);
    setEditingScheduleRows(localeRowsFromPayload(schedule.locale_payload, schedule.title ?? "", schedule.message ?? ""));
    setEditingScheduleAutoGenerate(scheduleAutoGenerateEnabled(schedule));
    setEditingScheduleType(editableScheduleType(schedule.schedule_type));
    setEditingScheduledDate(hcmDateInput(schedule.scheduled_at ?? schedule.next_run_at));
    setEditingTimeOfDay(schedule.time_of_day ?? hcmTimeInput(schedule.scheduled_at ?? schedule.next_run_at));
    setEditingDayOfMonth(String(schedule.day_of_month ?? 1));
  }

  function applyScheduleBaseText() {
    const primary = primaryLocaleRow(localePayloadForRows(editingScheduleRows));
    if (!primary) return;

    setEditingScheduleRows((current) =>
      current.map((row) =>
        row.enabled
          ? {
            ...row,
            message: primary.message,
            title: primary.title,
          }
          : row
      )
    );
  }

  function enableAllScheduleLanguages() {
    setEditingScheduleRows((current) => current.map((row) => ({ ...row, enabled: true })));
  }

  function scheduleEnglishOnly() {
    setEditingScheduleRows((current) => current.map((row) => ({ ...row, enabled: row.topicCode === "en" })));
  }

  async function saveScheduleContent() {
    if (!canManage) return;
    if (!editingSchedule) return;

    const enabledEditingRows = editingScheduleRows.filter((row) => row.enabled);
    try {
      validateMessageRows(enabledEditingRows);
    } catch (error) {
      void showToast("error", error instanceof Error ? error.message : "Schedule title and content are required.");
      return;
    }

    setPendingAction(`content-${editingSchedule.id}`);

    try {
      const response = await fetch("/api/admin/notifications/schedules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data: scheduleDataWithAutoGenerate(
            editingSchedule,
            (editingScheduleType === "daily" || editingScheduleType === "monthly") && editingScheduleAutoGenerate
          ),
          dayOfMonth: Number(editingDayOfMonth),
          id: editingSchedule.id,
          notifications: localePayloadForRows(enabledEditingRows),
          scheduledDate: editingScheduledDate,
          scheduleType: editingScheduleType,
          timeOfDay: editingTimeOfDay,
        }),
      });
      const payload = (await response.json()) as ScheduleContentResponse;
      if (!response.ok || !payload.ok || !payload.schedule) throw new Error(payload.error ?? "Update schedule content failed.");

      setSchedules((current) => current.map((schedule) => (schedule.id === payload.schedule!.id ? payload.schedule! : schedule)));
      await loadSchedulesPage(schedulePagination.page);
      setEditingSchedule(null);
      void showToast("success", "Schedule updated.");
    } catch (error) {
      void showToast("error", error instanceof Error ? error.message : "Update schedule content failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function dispatchSchedule(scheduleId: string) {
    if (!canManage) return;
    setPendingAction(`dispatch-${scheduleId}`);

    try {
      const response = await fetch("/api/admin/notifications/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; result?: { total?: number } };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Dispatch failed.");
      void showToast("success", `Dispatcher processed ${payload.result?.total ?? 0} schedule(s).`);
      await loadSchedulesPage(schedulePagination.page);
    } catch (error) {
      void showToast("error", error instanceof Error ? error.message : "Dispatch failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function updateScheduleStatus(schedule: NotificationSchedule, status: "active" | "paused") {
    if (!canManage) return;
    setPendingAction(`schedule-${schedule.id}`);

    try {
      const response = await fetch("/api/admin/notifications/schedules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: schedule.id, status }),
      });
      const payload = (await response.json()) as ScheduleResponse;
      if (!response.ok || !payload.ok || !payload.schedule) throw new Error(payload.error ?? "Update schedule failed.");
      setSchedules((current) => current.map((item) => (item.id === payload.schedule!.id ? payload.schedule! : item)));
      await loadSchedulesPage(schedulePagination.page);
      void showToast("success", payload.message ?? "Schedule updated.");
    } catch (error) {
      void showToast("error", error instanceof Error ? error.message : "Update schedule failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteSchedule(schedule: NotificationSchedule) {
    if (!canManage) return;
    setPendingAction(`delete-${schedule.id}`);
    const previous = schedules;
    setSchedules((current) => current.filter((item) => item.id !== schedule.id));

    try {
      const response = await fetch("/api/admin/notifications/schedules", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: schedule.id }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Delete schedule failed.");
      await loadSchedulesPage(
        previous.length <= 1 && schedulePagination.page > 1
          ? schedulePagination.page - 1
          : schedulePagination.page,
      );
      void showToast("success", "Schedule deleted.");
    } catch (error) {
      setSchedules(previous);
      void showToast("error", error instanceof Error ? error.message : "Delete schedule failed.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Messaging"
        title="Notification schedules"
        description="View scheduled notifications and filter by app, store, or search keyword."
      />

      <section className="overflow-hidden rounded-xl border bg-background shadow-sm shadow-slate-200/50">
        <div className="space-y-3 border-b bg-muted/20 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-heading text-base font-semibold">
                <CalendarClock size={18} />
                Scheduled notifications
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {schedulePagination.total} schedule(s), {visibleSchedules.filter((schedule) => schedule.status === "active").length} active on this page.
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSchedulesPage(schedulePagination.page)}
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
              void loadSchedulesPage(1, { appFilter: value });
            }}
            onSearchChange={(value) => {
              setRecordSearch(value);
              void loadSchedulesPage(1, { search: value });
            }}
            onStoreFilterChange={(value) => {
              setRecordStoreFilter(value);
              void loadSchedulesPage(1, { storeFilter: value });
            }}
            placeholder="Search schedule, app, package, bundle, store..."
            search={recordSearch}
            storeFilter={recordStoreFilter}
            stores={storeFilterOptions}
          />
        </div>
        <div className="max-h-[calc(100dvh-19rem)] overflow-auto">
          <Table className="min-w-[1180px] text-sm">
            <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <TableHead>Schedule</TableHead>
                <TableHead className="w-48">App</TableHead>
                <TableHead className="w-44">App ID</TableHead>
                <TableHead className="w-48">Store</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-44">Next run</TableHead>
                <TableHead className="w-44">Last run</TableHead>
                {canManage ? <TableHead className="w-36">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSchedules.length ? (
                visibleSchedules.map((schedule) => {
                  const displayNotification = scheduleDisplayNotification(schedule);
                  const canAutoGenerate = schedule.schedule_type === "daily" || schedule.schedule_type === "monthly";
                  const autoGenerate = canAutoGenerate && scheduleAutoGenerateEnabled(schedule);

                  return (
                    <TableRow key={schedule.id}>
                      <TableCell className="max-w-80">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{scheduleLabel(schedule)}</span>
                          {autoGenerate ? (
                            <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px]">
                              <Sparkles size={11} />
                              Auto content
                            </Badge>
                          ) : null}
                        </div>
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => openScheduleEditor(schedule)}
                            className="mt-1 block max-w-full text-left text-xs text-muted-foreground hover:text-foreground"
                          >
                            <span className="line-clamp-1 font-medium">{displayNotification.title}</span>
                            {displayNotification.message ? <span className="line-clamp-1">{displayNotification.message}</span> : null}
                          </button>
                        ) : (
                          <div className="mt-1 max-w-full text-left text-xs text-muted-foreground">
                          <span className="line-clamp-1 font-medium">{displayNotification.title}</span>
                          {displayNotification.message ? <span className="line-clamp-1">{displayNotification.message}</span> : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <PlatformBadge platform={schedule.platform} />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{schedule.app_name}</div>
                            <div className="truncate font-mono text-[11px] text-muted-foreground">
                              {schedule.package_name ?? schedule.bundle_id ?? schedule.topic_base}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-40 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs">
                          {schedule.app_id ?? "N/A"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-48">
                        <div className="truncate text-sm">{schedule.store_account_name ?? "Unknown store"}</div>
                        <div className="text-xs text-muted-foreground">{schedule.timezone}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={schedule.status} />
                        {schedule.last_status ? <div className="mt-1 text-xs text-muted-foreground">{schedule.last_status}</div> : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{dateTime(schedule.next_run_at)}</TableCell>
                      <TableCell className="max-w-56">
                        <div className="text-sm text-muted-foreground">{dateTime(schedule.last_run_at)}</div>
                        {schedule.last_error ? <div className="mt-1 line-clamp-2 text-xs text-rose-600">{schedule.last_error}</div> : null}
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="outline" size="icon-sm" onClick={() => openScheduleEditor(schedule)} title="Edit content">
                              <PencilLine size={14} />
                            </Button>
                            <Button variant="outline" size="icon-sm" onClick={() => dispatchSchedule(schedule.id)} title="Run now">
                              {pendingAction === `dispatch-${schedule.id}` ? <Spinner className="size-3.5" /> : <Play size={14} />}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              onClick={() => updateScheduleStatus(schedule, schedule.status === "active" ? "paused" : "active")}
                              title={schedule.status === "active" ? "Pause" : "Activate"}
                            >
                              {pendingAction === `schedule-${schedule.id}` ? <Spinner className="size-3.5" /> : schedule.status === "active" ? <Pause size={14} /> : <Play size={14} />}
                            </Button>
                            <Button variant="outline" size="icon-sm" onClick={() => deleteSchedule(schedule)} title="Delete">
                              {pendingAction === `delete-${schedule.id}` ? <Spinner className="size-3.5" /> : <Trash2 size={14} />}
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              ) : (
                <TableEmptyState
                  colSpan={canManage ? 8 : 7}
                  icon={CalendarClock}
                  title={loadingSchedules ? "Loading schedules" : "No schedules"}
                  description={
                    loadingSchedules
                      ? "The current page is being loaded."
                      : "Scheduled notification jobs will appear here."
                  }
                />
              )}
            </TableBody>
          </Table>
        </div>
        <TablePaginationFooter
          onPageChange={(page) => void loadSchedulesPage(page)}
          page={schedulePagination.page}
          shown={visibleSchedules.length}
          total={schedulePagination.total}
          totalPages={schedulePagination.totalPages}
        />
      </section>

      {canManage ? (
      <Dialog open={Boolean(editingSchedule)} onOpenChange={(open) => !open && setEditingSchedule(null)}>
        <DialogContent className="max-h-[86dvh] gap-0 overflow-hidden p-0 sm:max-w-[min(980px,calc(100vw-2rem))]">
          <DialogHeader className="border-b px-4 py-3 pr-12">
            <DialogTitle className="text-base">Schedule content</DialogTitle>
            <DialogDescription className="text-xs">
              Review and edit the notification copy saved for this schedule.
            </DialogDescription>
          </DialogHeader>

          {editingSchedule ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2">
                <div className="min-w-0 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{editingSchedule.app_name}</span>
                  <span> · {scheduleLabel(editingSchedule)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={applyScheduleBaseText}>
                    Apply EN text
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={scheduleEnglishOnly}>
                    EN only
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={enableAllScheduleLanguages}>
                    All languages
                  </Button>
                </div>
              </div>

              <div className="max-h-[56dvh] overflow-auto px-4 py-3">
                <div className="mb-3 rounded-lg border bg-background p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <CalendarClock size={15} />
                    Schedule timing
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Mode</Label>
                      <Select value={editingScheduleType} onValueChange={(value) => setEditingScheduleType(value as EditableScheduleType)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="once">Pick date and time</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {editingScheduleType === "once" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="editScheduledDate" className="text-xs">Date</Label>
                        <Input
                          id="editScheduledDate"
                          type="date"
                          className="h-9"
                          value={editingScheduledDate}
                          onChange={(event) => setEditingScheduledDate(event.target.value)}
                        />
                      </div>
                    ) : null}

                    {editingScheduleType === "monthly" ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Day of month</Label>
                        <Select value={editingDayOfMonth} onValueChange={setEditingDayOfMonth}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 31 }, (_, index) => String(index + 1)).map((day) => (
                              <SelectItem key={day} value={day}>
                                Day {day}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <Label htmlFor="editTimeOfDay" className="text-xs">Time</Label>
                      <Input
                        id="editTimeOfDay"
                        type="time"
                        className="h-9"
                        value={editingTimeOfDay}
                        onChange={(event) => setEditingTimeOfDay(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Times use Asia/Ho_Chi_Minh and will recalculate the next run after saving.
                  </div>
                </div>

                {editingScheduleType === "daily" || editingScheduleType === "monthly" ? (
                  <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
                    <Checkbox
                      checked={editingScheduleAutoGenerate}
                      onCheckedChange={(checked) => setEditingScheduleAutoGenerate(checked === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Auto-generate scheduled content</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Dispatcher will generate fresh generic copy before each scheduled send. Manual rows below stay as the fallback.
                      </span>
                    </span>
                  </label>
                ) : null}

                <div className="overflow-hidden rounded-lg border">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 w-11 pl-3">On</TableHead>
                        <TableHead className="h-8 min-w-28">Lang</TableHead>
                        <TableHead className="h-8 min-w-44">Title</TableHead>
                        <TableHead className="h-8 min-w-72">Content</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editingScheduleRows.map((row) => {
                        const titleTooLong = row.title.length > TITLE_MAX_LENGTH;
                        const messageTooLong = row.message.length > MESSAGE_MAX_LENGTH;

                        return (
                          <TableRow key={row.topicCode} className={!row.enabled ? "opacity-55" : undefined}>
                            <TableCell className="py-1.5 pl-3">
                              <Checkbox
                                checked={row.enabled}
                                onCheckedChange={(checked) => updateEditingScheduleRow(row.topicCode, { enabled: checked === true })}
                                aria-label={`Enable ${row.label}`}
                              />
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="font-medium">{row.label}</div>
                              <div className="text-xs text-muted-foreground">{row.topicCode}</div>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                value={row.title}
                                onChange={(event) => updateEditingScheduleRow(row.topicCode, { title: event.target.value })}
                                className={cn("h-9", titleTooLong && "border-rose-300 focus-visible:ring-rose-200")}
                                disabled={!row.enabled}
                                maxLength={TITLE_MAX_LENGTH}
                                placeholder="Default title"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 pr-3">
                              <Input
                                value={row.message}
                                onChange={(event) => updateEditingScheduleRow(row.topicCode, { message: event.target.value })}
                                className={cn("h-9", messageTooLong && "border-rose-300 focus-visible:ring-rose-200")}
                                disabled={!row.enabled}
                                maxLength={MESSAGE_MAX_LENGTH}
                                placeholder="Default content"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <DialogFooter className="m-0 rounded-none px-4 py-3">
                <Button type="button" variant="outline" onClick={() => setEditingSchedule(null)}>
                  Close
                </Button>
                <Button type="button" onClick={saveScheduleContent} disabled={pendingAction === `content-${editingSchedule.id}`}>
                  {pendingAction === `content-${editingSchedule.id}` ? <Spinner /> : <CheckCircle2 size={15} />}
                  Save schedule
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      ) : null}
    </div>
  );
}
