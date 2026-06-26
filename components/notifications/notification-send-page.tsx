"use client";

import { useMemo, useState } from "react";
import { Activity, Bell, ChevronRight, Clock3, Languages, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/client/toast";

import { PageHeader, StatusBadge } from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { NotificationsPageData } from "@/lib/tracking/page-data";
import type { NotificationEvent, NotificationJob, NotificationSchedule, StoreMapping } from "@/lib/tracking/types";
import { cn } from "@/lib/utils";

import {
  AppSelectionTable,
  type AppSendSummary,
  type GenerateResponse,
  type LocaleRow,
  MESSAGE_MAX_LENGTH,
  SCHEDULE_DATA_KEY,
  type ScheduleMode,
  type ScheduleResponse,
  type SendResponse,
  TITLE_MAX_LENGTH,
  createLocaleRows,
  devicesForApp,
  appIdentifierForApp,
  matchingFirebaseCredentials,
  platformLabel,
  rateLabel,
  todayDateInput,
  topicBaseForApp,
  validateMessageRows,
} from "./shared";

export function NotificationSendPage({
  data,
  initialAppId,
}: {
  data: NotificationsPageData;
  initialAppId?: string;
}) {
  const router = useRouter();
  const platformApps = useMemo(() => data.storeMappings, [data.storeMappings]);
  const resolvedInitialAppId = platformApps.find((app) => app.id === initialAppId)?.id ?? "";
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>(() => (resolvedInitialAppId ? [resolvedInitialAppId] : []));
  const [search, setSearch] = useState("");
  const [baseTitle, setBaseTitle] = useState("");
  const [baseMessage, setBaseMessage] = useState("");
  const [localeRows, setLocaleRows] = useState<LocaleRow[]>(() => createLocaleRows());
  const [showLocalizedRows, setShowLocalizedRows] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [scheduledDate, setScheduledDate] = useState(todayDateInput());
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [autoGenerateScheduled, setAutoGenerateScheduled] = useState(false);
  const [, setJobs] = useState(data.notificationJobs);
  const [, setEvents] = useState(data.notificationEvents);
  const [schedules, setSchedules] = useState(data.notificationSchedules);
  const [lastSendSummaries, setLastSendSummaries] = useState<AppSendSummary[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const selectedAppIdSet = useMemo(() => new Set(selectedAppIds), [selectedAppIds]);
  const selectedApps = useMemo(
    () => platformApps.filter((app) => selectedAppIdSet.has(app.id)),
    [platformApps, selectedAppIdSet]
  );
  const selectedDevices = useMemo(
    () => selectedApps.flatMap((app) => devicesForApp(app, data.deviceTokens)),
    [data.deviceTokens, selectedApps]
  );
  const enabledRows = localeRows.filter((row) => row.enabled);
  const selectedReadyAppCount = selectedApps.filter((app) => matchingFirebaseCredentials(app, data.credentialSecrets).length).length;
  const selectedAppsWithDevices = selectedApps.filter((app) => devicesForApp(app, data.deviceTokens).length).length;
  const selectedMissingConfigCount = Math.max(selectedApps.length - selectedReadyAppCount, 0);
  const selectedAppHasConfig = selectedApps.length > 0 && selectedMissingConfigCount === 0;
  const canTranslateContent =
    Boolean(baseTitle.trim() && baseMessage.trim()) &&
    baseTitle.length <= TITLE_MAX_LENGTH &&
    baseMessage.length <= MESSAGE_MAX_LENGTH;
  const canAutoGenerateSchedule = scheduleMode === "daily" || scheduleMode === "monthly";

  function generationContext() {
    const app = selectedApps.length === 1 ? selectedApps[0] : null;
    return {
      appName: app?.app_name ?? "the app",
      notes: app
        ? `Use the display name "${app.app_name}" as context. Do not mention package, bundle, store, or app id. Make this copy feel different from previous attempts.`
        : "Keep the copy generic and reusable across multiple apps. Do not mention package name, bundle id, store name, or app-specific identifier. Make this copy feel different from previous attempts.",
      variantSeed: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }

  function updateLocaleRow(topicCode: string, patch: Partial<LocaleRow>) {
    setLocaleRows((current) => current.map((row) => (row.topicCode === topicCode ? { ...row, ...patch } : row)));
  }

  function applyBaseText() {
    setLocaleRows((current) =>
      current.map((row) =>
        row.enabled
          ? {
            ...row,
            message: baseMessage,
            title: baseTitle,
          }
          : row
      )
    );
  }

  function enableAllLanguages() {
    setLocaleRows((current) => current.map((row) => ({ ...row, enabled: true })));
  }

  function englishOnly() {
    setLocaleRows((current) => current.map((row) => ({ ...row, enabled: row.topicCode === "en" })));
  }

  function rowsForDelivery() {
    const fallbackTitle = baseTitle.trim();
    const fallbackMessage = baseMessage.trim();

    return enabledRows.map((row) => ({
      ...row,
      message: row.message.trim() || fallbackMessage,
      title: row.title.trim() || fallbackTitle,
    }));
  }

  function buildPayloadForApp(app: StoreMapping) {
    const deliveryRows = rowsForDelivery();
    validateMessageRows(deliveryRows);
    const appDevices = devicesForApp(app, data.deviceTokens);
    const deviceIds = appDevices.map((device) => device.device_id);
    if (!deviceIds.length) throw new Error(`${app.app_name} does not have any active FCM token.`);

    const appIdentifier = appIdentifierForApp(app);

    return {
      appId: appIdentifier,
      appName: app.app_name,
      bundleId: app.bundle_id,
      data: {},
      deviceIds,
      notifications: deliveryRows.map((row) => ({
        message: row.message,
        title: row.title,
        topicCode: row.topicCode,
      })),
      packageName: app.package_name,
      platform: app.platform,
      productAppId: appIdentifier,
      storeAccountName: app.store_account_name,
      storePlatform: app.store_platform,
      storeProfileId: app.store_profile_id,
      targetType: "device",
      topicBase: topicBaseForApp(app),
    };
  }

  async function generateContent() {
    setPendingAction("generate");

    try {
      const context = generationContext();
      const response = await fetch("/api/admin/notifications/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appName: context.appName,
          intent: "generate",
          message: baseMessage,
          notes: context.notes,
          title: baseTitle,
          variantSeed: context.variantSeed,
        }),
      });
      const payload = (await response.json()) as GenerateResponse;
      if (!response.ok || !payload.ok || !payload.notifications) {
        throw new Error(payload.error ?? "Generate failed.");
      }

      const english = payload.notifications.find((item) => item.topicCode === "en") ?? payload.notifications[0];
      setBaseTitle(english?.title ?? "");
      setBaseMessage(english?.message ?? "");
      setLocaleRows((current) =>
        current.map((row) => {
          const generated = payload.notifications!.find((item) => item.topicCode === row.topicCode);
          return generated
            ? {
              ...row,
              enabled: true,
              message: generated.message,
              title: generated.title,
            }
            : row;
        })
      );
      setShowLocalizedRows(true);
      void showToast("success", `Generated and translated ${payload.notifications.length} language row(s).`);
    } catch (error) {
      void showToast("error", error instanceof Error ? error.message : "Generate failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function translateLocalizedCopy() {
    if (!baseTitle.trim() || !baseMessage.trim()) {
      void showToast("error", "Enter title and content before translating.");
      return;
    }

    setPendingAction("translate");

    try {
      const context = generationContext();
      const response = await fetch("/api/admin/notifications/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appName: context.appName,
          intent: "translate",
          message: baseMessage,
          notes: "Translate the provided title and content into each locale. Keep the meaning close and do not add new claims.",
          title: baseTitle,
          variantSeed: context.variantSeed,
        }),
      });
      const payload = (await response.json()) as GenerateResponse;
      if (!response.ok || !payload.ok || !payload.notifications) {
        throw new Error(payload.error ?? "Translate failed.");
      }

      setLocaleRows((current) =>
        current.map((row) => {
          const generated = payload.notifications!.find((item) => item.topicCode === row.topicCode);
          return generated
            ? {
              ...row,
              enabled: true,
              message: generated.message,
              title: generated.title,
            }
            : row;
        })
      );
      setShowLocalizedRows(true);
      void showToast("success", `Translated ${payload.notifications.length} language row(s).`);
    } catch (error) {
      void showToast("error", error instanceof Error ? error.message : "Translate failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function sendNow() {
    if (!selectedApps.length) {
      void showToast("error", "Select at least one app first.");
      return;
    }

    try {
      validateMessageRows(rowsForDelivery());
    } catch (error) {
      void showToast("error", error instanceof Error ? error.message : "Notification title and content are required.");
      return;
    }

    setPendingAction("send");
    setLastSendSummaries([]);

    const summaries: AppSendSummary[] = [];
    const nextJobs: NotificationJob[] = [];
    const nextEvents: NotificationEvent[] = [];

    try {
      for (const app of selectedApps) {
        try {
          const appDevices = devicesForApp(app, data.deviceTokens);
          const response = await fetch("/api/admin/notifications/send", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildPayloadForApp(app)),
          });
          const payload = (await response.json()) as SendResponse;
          if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Send notification failed.");

          const results = payload.result?.results ?? [];
          const sentCount = payload.result?.sentCount ?? results.filter((result) => result.ok).length;
          const errorCount = payload.result?.errorCount ?? results.filter((result) => !result.ok).length;
          const totalCount = Math.max(results.length, sentCount + errorCount, appDevices.length);
          const resultJob = payload.result?.job;

          if (resultJob) {
            nextJobs.push(resultJob);
            if (results.length) {
              const createdAt = new Date().toISOString();
              nextEvents.push(...results.map((result, index) => ({
                created_at: createdAt,
                device_id: result.deviceId,
                error_code: result.ok ? null : `fcm_http_${result.status}`,
                error_detail: result.error,
                event_type: result.ok ? "fcm_sent" : "fcm_failed",
                id: `local-${resultJob.id}-${index}`,
                job_id: resultJob.id,
                metadata: {
                  fcmErrorCode: result.fcmErrorCode ?? null,
                  fcmToken: result.fcmToken ?? null,
                  invalidToken: result.invalidToken ?? false,
                  topicCode: result.topicCode,
                },
                notification_id: resultJob.id,
                platform: app.platform,
                provider_message_id: result.providerMessageId,
                status: result.ok ? "sent" : "failed",
                target_type: result.targetType,
                target_value: result.targetValue,
              })));
            }
          }

          summaries.push({
            appId: appIdentifierForApp(app),
            appName: app.app_name,
            errorCount,
            jobId: resultJob?.id,
            platform: app.platform,
            results,
            sentCount,
            totalCount,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Send notification failed.";
          const totalCount = Math.max(devicesForApp(app, data.deviceTokens).length, 1);
          summaries.push({
            appId: appIdentifierForApp(app),
            appName: app.app_name,
            error: message,
            errorCount: totalCount,
            platform: app.platform,
            results: [],
            sentCount: 0,
            totalCount,
          });
        }
      }

      if (nextJobs.length) {
        setJobs((current) => [
          ...nextJobs,
          ...current.filter((job) => !nextJobs.some((nextJob) => nextJob.id === job.id)),
        ]);
      }
      if (nextEvents.length) {
        const nextJobIds = new Set(nextJobs.map((job) => job.id));
        setEvents((current) => [...nextEvents, ...current.filter((event) => !event.job_id || !nextJobIds.has(event.job_id))]);
      }

      setLastSendSummaries(summaries);
      const sentCount = summaries.reduce((total, summary) => total + summary.sentCount, 0);
      const errorCount = summaries.reduce((total, summary) => total + summary.errorCount, 0);
      const totalCount = summaries.reduce((total, summary) => total + summary.totalCount, 0);
      const failedApps = summaries.filter((summary) => summary.errorCount > 0).length;
      if (failedApps) {
        void showToast("error", `Send finished with issues: ${sentCount}/${totalCount} token(s) sent, ${errorCount} failed.`);
      } else {
        void showToast("success", `Send finished: ${sentCount}/${totalCount} token(s) sent.`);
      }
      router.refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function saveSchedule() {
    if (scheduleMode === "now") {
      await sendNow();
      return;
    }

    if (!selectedApps.length) {
      void showToast("error", "Select at least one app first.");
      return;
    }

    try {
      validateMessageRows(rowsForDelivery());
    } catch (error) {
      void showToast("error", error instanceof Error ? error.message : "Notification title and content are required.");
      return;
    }

    setPendingAction("schedule");

    try {
      const savedSchedules: NotificationSchedule[] = [];
      const errors: string[] = [];

      for (const app of selectedApps) {
        try {
          const response = await fetch("/api/admin/notifications/schedules", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ...buildPayloadForApp(app),
              data: canAutoGenerateSchedule
                ? {
                  [SCHEDULE_DATA_KEY]: {
                    autoGenerateContent: autoGenerateScheduled,
                    generateNotes: selectedApps.length === 1
                      ? `Generate fresh scheduled push copy for the display name "${app.app_name}". Do not mention package, bundle, store, or app id.`
                      : "Generate fresh generic scheduled push copy. Do not mention any package name, bundle id, store name, or app-specific identifier.",
                  },
                }
                : {},
              dayOfMonth: Number(dayOfMonth),
              name: `${app.app_name} ${scheduleMode}`,
              scheduledDate,
              scheduleType: scheduleMode,
              timeOfDay,
            }),
          });
          const payload = (await response.json()) as ScheduleResponse;
          if (!response.ok || !payload.ok || !payload.schedule) {
            throw new Error(payload.error ?? "Save schedule failed.");
          }
          savedSchedules.push(payload.schedule);
        } catch (error) {
          errors.push(`${app.app_name}: ${error instanceof Error ? error.message : "Save schedule failed."}`);
        }
      }

      if (savedSchedules.length) {
        setSchedules((current) => [
          ...savedSchedules,
          ...current.filter((schedule) => !savedSchedules.some((savedSchedule) => savedSchedule.id === schedule.id)),
        ]);
      }

      if (errors.length) {
        void showToast("error", `${savedSchedules.length} schedule(s) saved, ${errors.length} failed.`);
      } else {
        void showToast("success", `${savedSchedules.length} schedule(s) saved.`);
      }
      router.refresh();
    } catch (error) {
      void showToast("error", error instanceof Error ? error.message : "Save schedule failed.");
    } finally {
      setPendingAction(null);
    }
  }

  function updateAppSelection(appId: string, checked?: boolean) {
    setSelectedAppIds((current) => {
      const selected = current.includes(appId);
      const shouldSelect = checked ?? !selected;
      if (shouldSelect && !selected) return [...current, appId];
      if (!shouldSelect && selected) return current.filter((id) => id !== appId);
      return current;
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Messaging"
        title="Notification send"
        description="Choose one or more mapped apps, then send now or save a schedule. Notifications are sent only to saved FCM tokens."
      />

      <section className="w-full min-w-0">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-[calc(100dvh-18rem)] min-h-[34rem] max-h-[46rem] w-full min-w-0 rounded-xl"
        >
          <ResizablePanel defaultSize={58} minSize={42} className="min-w-0">
            <div className="h-full min-w-0">
              <AppSelectionTable
                apps={platformApps}
                credentials={data.credentialSecrets}
                devices={data.deviceTokens}
                fillHeight
                schedules={schedules}
                search={search}
                selectedAppIdSet={selectedAppIdSet}
                updateAppSelection={updateAppSelection}
                onSearchChange={setSearch}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="mx-2 bg-transparent [&>div]:h-12 [&>div]:w-1.5 [&>div]:bg-border" />
          <ResizablePanel defaultSize={42} minSize={34} className="min-w-0">
            <aside className="h-full min-h-0 overflow-y-auto overflow-x-hidden rounded-xl border bg-card text-sm shadow-sm shadow-slate-200/50 ring-1 ring-foreground/10">
              <div className="flex items-start justify-between gap-3 border-b bg-muted/20 p-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
                    <Bell size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-heading text-sm font-medium">Message</div>
                  </div>
                </div>
                <Badge variant="secondary" className="h-6 rounded-md px-2 text-[11px]">
                  {enabledRows.length} langs
                </Badge>
              </div>

              <div className="space-y-3 p-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="notification-title" className="text-xs">Title</Label>
                    <span className={cn("text-xs", baseTitle.length > TITLE_MAX_LENGTH ? "text-rose-600" : "text-muted-foreground")}>
                      {baseTitle.length}/{TITLE_MAX_LENGTH}
                    </span>
                  </div>
                  <Input
                    id="notification-title"
                    className="h-9 bg-background text-sm"
                    value={baseTitle}
                    onChange={(event) => setBaseTitle(event.target.value)}
                    maxLength={TITLE_MAX_LENGTH}
                    placeholder="Short notification title"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="notification-content" className="text-xs">Content</Label>
                    <span className={cn("text-xs", baseMessage.length > MESSAGE_MAX_LENGTH ? "text-rose-600" : "text-muted-foreground")}>
                      {baseMessage.length}/{MESSAGE_MAX_LENGTH}
                    </span>
                  </div>
                  <Textarea
                    id="notification-content"
                    value={baseMessage}
                    onChange={(event) => setBaseMessage(event.target.value)}
                    maxLength={MESSAGE_MAX_LENGTH}
                    className="min-h-[5.5rem] resize-none bg-background text-sm"
                    placeholder="One short sentence for the push body"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="h-8 justify-start bg-foreground text-xs text-background hover:bg-foreground/90"
                    onClick={generateContent}
                    disabled={pendingAction !== null}
                  >
                    {pendingAction === "generate" ? <Spinner /> : <Sparkles size={16} />}
                    Generate
                  </Button>
                  <Button
                    type="button"
                    className="h-8 justify-start bg-foreground text-xs text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
                    onClick={translateLocalizedCopy}
                    disabled={!canTranslateContent || pendingAction !== null}
                  >
                    {pendingAction === "translate" ? <Spinner /> : <Languages size={16} />}
                    Translate
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLocalizedRows(true)}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border bg-muted/25 p-2.5 text-left transition-all hover:border-primary/30 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Languages size={15} />
                      Localized content
                      <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px]">
                        {enabledRows.length} on
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      Review or edit translated rows.
                    </div>
                  </div>
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
                    <ChevronRight size={14} />
                  </div>
                </button>
              </div>

              <div className="space-y-2.5 border-t bg-muted/10 p-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
                    <Send size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-heading text-sm font-medium">Delivery</div>
                  </div>
                </div>

                <div className="rounded-lg border bg-background p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Target apps</div>
                      <div className="mt-0.5 truncate text-sm font-medium">
                        {selectedApps.length ? `${selectedApps.length} app(s) selected` : "None selected"}
                      </div>
                    </div>
                    {selectedApps.length ? (
                      <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px]">
                        {selectedApps.length} selected
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md bg-muted/35 p-2">
                      <div className="text-muted-foreground">Tokens</div>
                      <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">{selectedDevices.length}</div>
                    </div>
                    <div className="rounded-md bg-muted/35 p-2">
                      <div className="text-muted-foreground">With tokens</div>
                      <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">{selectedAppsWithDevices}/{selectedApps.length || 0}</div>
                    </div>
                    <div className="rounded-md bg-muted/35 p-2">
                      <div className="text-muted-foreground">Config</div>
                      <div className={cn("mt-0.5 text-base font-semibold", selectedApps.length ? selectedAppHasConfig ? "text-emerald-700" : "text-amber-700" : "text-muted-foreground")}>
                        {selectedApps.length ? `${selectedReadyAppCount}/${selectedApps.length}` : "Pick app"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Mode</Label>
                    <Select value={scheduleMode} onValueChange={(value) => setScheduleMode(value as ScheduleMode)}>
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="now">Send immediately</SelectItem>
                        <SelectItem value="once">Pick date and time</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="h-9 px-3 text-xs" onClick={saveSchedule} disabled={pendingAction !== null || !selectedApps.length || !selectedDevices.length}>
                    {pendingAction === "schedule" || pendingAction === "send" ? <Spinner /> : scheduleMode === "now" ? <Send size={16} /> : <Clock3 size={16} />}
                    {scheduleMode === "now" ? "Send" : "Save"}
                  </Button>
                </div>

                {scheduleMode === "once" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="scheduledDate" className="text-xs">Date</Label>
                      <Input id="scheduledDate" type="date" className="h-8" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="onceTime" className="text-xs">Time</Label>
                      <Input id="onceTime" type="time" className="h-8" value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value)} />
                    </div>
                  </div>
                ) : null}

                {scheduleMode === "daily" ? (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="dailyTime" className="text-xs">Daily time</Label>
                      <Input id="dailyTime" type="time" className="h-8" value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value)} />
                    </div>
                    <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-2 text-xs">
                      <Checkbox
                        checked={autoGenerateScheduled}
                        onCheckedChange={(checked) => setAutoGenerateScheduled(checked === true)}
                        className="size-4"
                      />
                      <span className="min-w-0 truncate">
                        <span className="font-medium">Auto-generate content</span>
                        <span className="text-muted-foreground"> before each send</span>
                      </span>
                    </label>
                  </div>
                ) : null}

                {scheduleMode === "monthly" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Day</Label>
                        <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
                          <SelectTrigger className="h-8 w-full">
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
                      <div className="space-y-1">
                        <Label htmlFor="monthlyTime" className="text-xs">Time</Label>
                        <Input id="monthlyTime" type="time" className="h-8" value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value)} />
                      </div>
                    </div>
                    <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-2 text-xs">
                      <Checkbox
                        checked={autoGenerateScheduled}
                        onCheckedChange={(checked) => setAutoGenerateScheduled(checked === true)}
                        className="size-4"
                      />
                      <span className="min-w-0 truncate">
                        <span className="font-medium">Auto-generate content</span>
                        <span className="text-muted-foreground"> before each send</span>
                      </span>
                    </label>
                  </div>
                ) : null}
              </div>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>

        <Dialog open={showLocalizedRows} onOpenChange={setShowLocalizedRows}>
          <DialogContent className="max-h-[82dvh] gap-0 overflow-hidden p-0 sm:max-w-[min(880px,calc(100vw-2rem))]">
            <DialogHeader className="border-b px-4 py-3 pr-12">
              <DialogTitle className="text-base">Localized content</DialogTitle>
              <DialogDescription className="text-xs">
                Review translated rows before sending. Empty fields use the default message.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2 border-b bg-muted/20 px-4 py-2">
              <Button type="button" size="sm" variant="outline" onClick={applyBaseText}>
                Apply text
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={englishOnly}>
                EN only
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={enableAllLanguages}>
                All languages
              </Button>
            </div>

            <div className="max-h-[52dvh] overflow-auto px-4 py-3">
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
                    {localeRows.map((row) => {
                      const titleTooLong = row.title.length > TITLE_MAX_LENGTH;
                      const messageTooLong = row.message.length > MESSAGE_MAX_LENGTH;

                      return (
                        <TableRow key={row.topicCode} className={!row.enabled ? "opacity-55" : undefined}>
                          <TableCell className="py-1.5 pl-3">
                            <Checkbox
                              checked={row.enabled}
                              onCheckedChange={(checked) => updateLocaleRow(row.topicCode, { enabled: checked === true })}
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
                              onChange={(event) => updateLocaleRow(row.topicCode, { title: event.target.value })}
                              className={cn("h-9", titleTooLong && "border-rose-300 focus-visible:ring-rose-200")}
                              disabled={!row.enabled}
                              maxLength={TITLE_MAX_LENGTH}
                              placeholder={baseTitle || "Default title"}
                            />
                          </TableCell>
                          <TableCell className="py-1.5 pr-3">
                            <Input
                              value={row.message}
                              onChange={(event) => updateLocaleRow(row.topicCode, { message: event.target.value })}
                              className={cn("h-9", messageTooLong && "border-rose-300 focus-visible:ring-rose-200")}
                              disabled={!row.enabled}
                              maxLength={MESSAGE_MAX_LENGTH}
                              placeholder={baseMessage || "Default content"}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter className="m-0 rounded-none px-4 py-3" showCloseButton />
          </DialogContent>
        </Dialog>
      </section>

      {lastSendSummaries.length ? (
        <section className="overflow-hidden rounded-xl border bg-background shadow-sm shadow-slate-200/50">
          <div className="flex items-center gap-2 border-b bg-muted/20 p-3 font-heading text-sm font-semibold">
            <Activity size={16} />
            Last send result
          </div>
          <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
            {lastSendSummaries.map((summary) => {
              const failed = Math.max(0, summary.errorCount);
              const total = Math.max(summary.totalCount, summary.sentCount + failed);
              const successRate = total ? (summary.sentCount / total) * 100 : 0;
              const firstError = summary.error ?? summary.results.find((result) => result.error)?.error;

              return (
                <Card key={summary.appId} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{summary.appName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{platformLabel(summary.platform)} · {total} token(s)</div>
                    </div>
                    <StatusBadge status={failed ? summary.sentCount ? "sent_with_issues" : "failed" : "sent"} />
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                    <div className="rounded-md bg-muted/35 p-2">
                      <div className="text-muted-foreground">Total</div>
                      <div className="mt-1 font-mono text-base font-semibold tabular-nums">{total}</div>
                    </div>
                    <div className="rounded-md bg-blue-50 p-2 text-blue-700">
                      <div>Sent</div>
                      <div className="mt-1 font-mono text-base font-semibold tabular-nums">{summary.sentCount}</div>
                    </div>
                    <div className="rounded-md bg-rose-50 p-2 text-rose-700">
                      <div>Failed</div>
                      <div className="mt-1 font-mono text-base font-semibold tabular-nums">{failed}</div>
                    </div>
                    <div className="rounded-md bg-emerald-50 p-2 text-emerald-700">
                      <div>Rate</div>
                      <div className="mt-1 font-mono text-base font-semibold tabular-nums">{rateLabel(successRate)}</div>
                    </div>
                  </div>
                  {summary.jobId ? <div className="mt-1 truncate text-xs text-muted-foreground">Job {summary.jobId}</div> : null}
                  {firstError ? <div className="mt-2 line-clamp-2 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-700">{firstError}</div> : null}
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
