"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  Apple,
  BarChart3,
  Bell,
  CheckCircle2,
  MousePointerClick,
  Search,
  Send,
  Smartphone,
  TriangleAlert,
} from "lucide-react";

import { TableEmptyState } from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  searchTextVariants,
  valuesMatchSearch as fuzzyValuesMatchSearch,
} from "@/lib/search";
import { dateTime } from "@/lib/tracking/format";
import type { NotificationsPageData } from "@/lib/tracking/page-data";
import type {
  CredentialSecretMetadata,
  DeviceToken,
  NotificationEvent,
  NotificationJob,
  NotificationSchedule,
  StoreMapping,
} from "@/lib/tracking/types";
import { cn } from "@/lib/utils";
import type { DeliveryLineChartProps } from "./notification-charts";

const DeliveryLineChart = dynamic<DeliveryLineChartProps>(
  () => import("./notification-charts").then((mod) => mod.DeliveryLineChart),
  {
    loading: () => <div className="h-full w-full animate-pulse rounded-md bg-muted" />,
    ssr: false,
  },
);

export type PlatformFilter = "android" | "ios";
export type NotificationFunctionSection = "overview" | "send" | "schedules" | "history";
export type ScheduleMode = "now" | "once" | "daily" | "monthly";

export type LocaleRow = {
  enabled: boolean;
  label: string;
  message: string;
  title: string;
  topicCode: string;
};

export type SendResult = {
  deviceId: string | null;
  error: string | null;
  fcmErrorCode?: string | null;
  fcmToken?: string | null;
  invalidToken?: boolean;
  ok: boolean;
  providerMessageId: string | null;
  status: number;
  targetType: string;
  targetValue: string;
  topicCode: string | null;
};

export type SendResponse = {
  ok?: boolean;
  error?: string;
  result?: {
    batchCount?: number;
    errorCount?: number;
    job?: NotificationJob;
    queued?: boolean;
    results?: SendResult[];
    sentCount?: number;
    targetCount?: number;
  };
};

export type GenerateResponse = {
  ok?: boolean;
  error?: string;
  notifications?: Array<{
    message: string;
    title: string;
    topicCode: string;
  }>;
};

export type ScheduleResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  schedule?: NotificationSchedule;
};

export type ScheduleContentResponse = ScheduleResponse;

export type AppSendSummary = {
  appId: string;
  appName: string;
  error?: string;
  errorCount: number;
  jobId?: string;
  platform: PlatformFilter | string;
  queued?: boolean;
  batchCount?: number;
  results: SendResult[];
  sentCount: number;
  totalCount: number;
};

type DeliveryBucket = {
  failed: number;
  impressions: number;
  key: string;
  label: string;
  opened: number;
  rate: number;
  received: number;
  requested: number;
  sent: number;
};

type DeliveryMetricKey = "requested" | "sent" | "received" | "impressions" | "failed" | "opened" | "rate";

const DELIVERY_METRICS: Array<{
  color: string;
  icon: ReactNode;
  key: DeliveryMetricKey;
  label: string;
  stroke: string;
}> = [
  { color: "bg-slate-500", icon: <Bell size={12} />, key: "requested", label: "Requested", stroke: "#64748b" },
  { color: "bg-blue-600", icon: <Send size={12} />, key: "sent", label: "Sent", stroke: "#2563eb" },
  { color: "bg-sky-600", icon: <CheckCircle2 size={12} />, key: "received", label: "Received", stroke: "#0284c7" },
  { color: "bg-orange-600", icon: <Activity size={12} />, key: "impressions", label: "Impressions", stroke: "#ea580c" },
  { color: "bg-rose-600", icon: <TriangleAlert size={12} />, key: "failed", label: "Failed", stroke: "#e11d48" },
  { color: "bg-violet-600", icon: <MousePointerClick size={12} />, key: "opened", label: "Opened", stroke: "#7c3aed" },
  { color: "bg-emerald-600", icon: <CheckCircle2 size={12} />, key: "rate", label: "Rate", stroke: "#059669" },
];

export const TITLE_MAX_LENGTH = 45;
export const MESSAGE_MAX_LENGTH = 90;
export const ALL_FILTER_VALUE = "__all__";
export const SCHEDULE_DATA_KEY = "__notificationSchedule";

export const LANGUAGES = [
  { topicCode: "zh", label: "Chinese" },
  { topicCode: "hi", label: "Hindi" },
  { topicCode: "es", label: "Spanish" },
  { topicCode: "fa", label: "Persian" },
  { topicCode: "ar", label: "Arabic" },
  { topicCode: "tr", label: "Turkish" },
  { topicCode: "fr", label: "French" },
  { topicCode: "bn", label: "Bengali" },
  { topicCode: "en", label: "English" },
  { topicCode: "pt", label: "Portuguese" },
  { topicCode: "sw", label: "Swahili" },
  { topicCode: "in", label: "Indonesian" },
  { topicCode: "it", label: "Italian" },
  { topicCode: "ja", label: "Japanese" },
  { topicCode: "de", label: "German" },
  { topicCode: "pa", label: "Punjabi" },
] as const;

export function createLocaleRows(): LocaleRow[] {
  return LANGUAGES.map((language) => ({
    enabled: true,
    label: language.label,
    message: "",
    title: "",
    topicCode: language.topicCode,
  }));
}

export function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function localeRowsFromPayload(value: unknown, fallbackTitle = "", fallbackMessage = "") {
  const payload = Array.isArray(value) ? value : [];
  const byTopicCode = new Map<string, { enabled: boolean; message: string; title: string }>();

  payload.forEach((item) => {
    const record = objectRecord(item);
    const topicCode = String(record.topicCode ?? record.languageCode ?? "").trim().toLowerCase();
    if (!topicCode) return;
    byTopicCode.set(topicCode, {
      enabled: record.enabled !== false,
      message: String(record.message ?? record.body ?? "").trim(),
      title: String(record.title ?? "").trim(),
    });
  });

  return createLocaleRows().map((row) => {
    const saved = byTopicCode.get(row.topicCode);
    if (!saved && row.topicCode !== "en") return { ...row, enabled: false };

    return {
      ...row,
      enabled: saved?.enabled ?? row.topicCode === "en",
      message: saved?.message ?? fallbackMessage,
      title: saved?.title ?? fallbackTitle,
    };
  });
}

export function localePayloadForRows(rows: LocaleRow[]) {
  return rows
    .filter((row) => row.enabled)
    .map((row) => ({
      enabled: true,
      message: row.message.trim(),
      title: row.title.trim(),
      topicCode: row.topicCode,
    }));
}

export function primaryLocaleRow(rows: Array<{ message: string; title: string; topicCode: string }>) {
  return rows.find((row) => row.topicCode === "en") ?? rows[0] ?? null;
}

export function scheduleDisplayNotification(schedule: NotificationSchedule) {
  const rows = localePayloadForRows(localeRowsFromPayload(schedule.locale_payload, schedule.title ?? "", schedule.message ?? ""));
  const primary = primaryLocaleRow(rows);
  return {
    message: primary?.message || schedule.message || "",
    title: primary?.title || schedule.title || "Untitled notification",
  };
}

export function scheduleAutoGenerateEnabled(schedule: NotificationSchedule | null) {
  const scheduleData = objectRecord(objectRecord(schedule?.data_payload)[SCHEDULE_DATA_KEY]);
  return scheduleData.autoGenerateContent === true;
}

export function scheduleDataWithAutoGenerate(schedule: NotificationSchedule, autoGenerateContent: boolean) {
  const data = { ...objectRecord(schedule.data_payload) };
  const current = objectRecord(data[SCHEDULE_DATA_KEY]);
  data[SCHEDULE_DATA_KEY] = {
    ...current,
    autoGenerateContent,
    generateNotes: schedule.app_name
      ? `Generate fresh scheduled push copy for the display name "${schedule.app_name}". Do not mention package, bundle, store, or app id.`
      : "Generate fresh generic scheduled push copy. Do not mention any package name, store name, or app-specific identifier.",
  };
  return data;
}

function appInitial(value: string | null | undefined) {
  return (value?.trim().charAt(0) || "A").toUpperCase();
}

function topicSegment(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/^\/topics\//i, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9\-_.~%]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function topicBaseForApp(app: StoreMapping) {
  return topicSegment(app.app_id || app.app_name || app.package_name || app.bundle_id || app.id);
}

export function appIdentifierForApp(app: StoreMapping) {
  return app.app_id || app.app_name || app.package_name || app.bundle_id || app.id;
}

export function todayDateInput() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
  }).format(new Date());
}

export function matchingFirebaseCredentials(app: StoreMapping, credentials: CredentialSecretMetadata[]) {
  return credentials.filter((credential) => {
    if (credential.platform !== app.platform) return false;
    if (credential.credential_purpose !== "firebase_admin") return false;
    if (credential.status !== "active") return false;
    return credential.store_profile_id === app.store_profile_id || credential.store_account_name === app.store_account_name;
  });
}

export function appMatchesSearch(app: StoreMapping, search: string) {
  return fuzzyValuesMatchSearch([
    app.app_name,
    app.app_id,
    app.store_account_name,
    app.package_name,
    app.bundle_id,
    app.platform,
    app.status,
  ], search);
}

function normalizedValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function normalizedValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => searchTextVariants(value))
        .map(normalizedValue)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function valuesOverlap(
  leftValues: Array<string | null | undefined>,
  rightValues: Array<string | null | undefined>
) {
  const rightSet = new Set(normalizedValues(rightValues));
  return normalizedValues(leftValues).some((value) => rightSet.has(value));
}

function sameValue(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizedValue(left);
  return Boolean(normalizedLeft && normalizedLeft === normalizedValue(right));
}

export function deviceTokenMatchesApp(
  device: DeviceToken,
  app: StoreMapping,
  options: { activeOnly?: boolean } = {}
) {
  if (device.platform !== app.platform) return false;
  if (options.activeOnly && device.status !== "active") return false;

  const appIdentifier = app.platform === "android" ? app.package_name : app.bundle_id;
  const deviceIdentifiers = normalizedValues([device.app_identifier]);
  if (sameValue(appIdentifier, device.app_identifier)) return true;
  if (sameValue(app.package_name, device.package_name)) return true;
  if (sameValue(app.bundle_id, device.bundle_id)) return true;

  const appIds = normalizedValues([app.app_id]);
  const deviceIds = normalizedValues([device.app_id, device.product_app_id]);
  if (appIds.length && deviceIds.length) {
    return valuesOverlap(appIds, deviceIds);
  }

  return !deviceIds.length && !deviceIdentifiers.length && sameValue(device.store_account_name, app.store_account_name);
}

export function tokensForApp(app: StoreMapping | null, devices: DeviceToken[], options: { activeOnly?: boolean } = {}) {
  if (!app) return [];
  return devices.filter((device) => deviceTokenMatchesApp(device, app, options));
}

export function devicesForApp(app: StoreMapping | null, devices: DeviceToken[]) {
  if (!app) return [];

  const seen = new Set<string>();
  return devices.filter((device) => {
    if (!deviceTokenMatchesApp(device, app, { activeOnly: true })) return false;
    if (seen.has(device.device_id)) return false;
    seen.add(device.device_id);
    return true;
  });
}

export function jobMatchesApp(job: NotificationJob, app: StoreMapping) {
  if (job.platform !== app.platform) return false;
  if (job.app_mapping_id) return sameValue(job.app_mapping_id, app.id);

  if (sameValue(app.package_name, job.package_name)) return true;
  if (sameValue(app.bundle_id, job.bundle_id)) return true;

  const appIds = normalizedValues([app.app_id]);
  const jobIds = normalizedValues([job.app_id]);
  if (appIds.length && jobIds.length) {
    return valuesOverlap(appIds, jobIds);
  }

  if (!jobIds.length && sameValue(job.app_name, app.app_name)) return true;
  return !jobIds.length
    && !job.package_name
    && !job.bundle_id
    && sameValue(job.store_account_name, app.store_account_name);
}

export function scheduleMatchesApp(schedule: NotificationSchedule, app: StoreMapping) {
  if (schedule.platform !== app.platform) return false;
  if (schedule.app_mapping_id) return sameValue(schedule.app_mapping_id, app.id);

  if (sameValue(app.package_name, schedule.package_name)) return true;
  if (sameValue(app.bundle_id, schedule.bundle_id)) return true;

  const appIds = normalizedValues([app.app_id]);
  const scheduleIds = normalizedValues([schedule.app_id]);
  if (appIds.length && scheduleIds.length) {
    return valuesOverlap(appIds, scheduleIds);
  }

  if (!scheduleIds.length && sameValue(schedule.app_name, app.app_name)) return true;
  return !scheduleIds.length
    && !schedule.package_name
    && !schedule.bundle_id
    && sameValue(schedule.store_account_name, app.store_account_name);
}

export function AppIcon({ app }: { app: StoreMapping }) {
  if (app.app_icon_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={app.app_icon_url}
        alt={`${app.app_name} icon`}
        className="size-9 rounded-md border object-cover"
        decoding="async"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex size-9 items-center justify-center rounded-md border bg-muted text-sm font-semibold text-muted-foreground">
      {appInitial(app.app_name)}
    </div>
  );
}

export function PlatformIcon({ platform }: { platform: PlatformFilter | string }) {
  return platform === "ios" ? <Apple size={14} /> : <Smartphone size={14} />;
}

export function platformBadgeClass(platform: PlatformFilter | string | null | undefined) {
  if (platform === "ios") return "border-sky-200 bg-sky-50 text-sky-700";
  if (platform === "android") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

export function PlatformBadge({
  className,
  platform,
}: {
  className?: string;
  platform: PlatformFilter | string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("h-6 gap-1.5 rounded-md px-2 text-xs", platformBadgeClass(platform), className)}
    >
      <PlatformIcon platform={platform} />
      {platformLabel(platform)}
    </Badge>
  );
}

export function scheduleLabel(schedule: NotificationSchedule) {
  if (schedule.schedule_type === "daily") return `Daily ${schedule.time_of_day ?? ""}`;
  if (schedule.schedule_type === "monthly") return `Monthly day ${schedule.day_of_month ?? 1} ${schedule.time_of_day ?? ""}`;
  return schedule.scheduled_at ? dateTime(schedule.scheduled_at) : "Once";
}

export function compactIdentifier(app: StoreMapping) {
  return app.app_id ?? app.package_name ?? app.bundle_id ?? app.id;
}

export function AppSearchDropdown({
  apps,
  onValueChange,
  placeholder,
  value,
}: {
  apps: StoreMapping[];
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const suggestions = useMemo(
    () => apps.filter((app) => appMatchesSearch(app, query)).slice(0, 8),
    [apps, query],
  );
  const cleanQuery = query.trim();

  function applyValue(nextValue: string) {
    const cleanValue = nextValue.trim();
    onValueChange(cleanValue);
    setQuery(cleanValue);
    setOpen(false);
  }

  function chooseApp(app: StoreMapping) {
    applyValue(app.app_name);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery(value);
      }}
    >
      <PopoverTrigger asChild>
        <label className="relative block min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyValue(query);
              }
              if (event.key === "Escape") {
                setQuery(value);
                setOpen(false);
              }
            }}
            className="h-9 pl-9"
            placeholder={placeholder}
          />
        </label>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-80 max-w-[calc(100vw-2rem)] p-1.5"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {suggestions.length ? (
          <div className="space-y-1">
            {suggestions.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => chooseApp(app)}
                onMouseDown={(event) => event.preventDefault()}
                className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <AppIcon app={app} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{app.app_name}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {compactIdentifier(app)}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {app.store_account_name ?? "Unknown store"}
                  </div>
                </div>
                <PlatformBadge platform={app.platform} className="shrink-0" />
              </button>
            ))}
          </div>
        ) : cleanQuery ? (
          <button
            type="button"
            onClick={() => applyValue(cleanQuery)}
            onMouseDown={(event) => event.preventDefault()}
            className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
              <Search size={15} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">Search all apps</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">{cleanQuery}</div>
            </div>
          </button>
        ) : (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No apps available</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function numberLabel(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}

export function rateLabel(value: number) {
  return `${Math.round(value)}%`;
}

function dayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function jobRequestedCount(job: NotificationJob) {
  const counted = Math.max(0, job.sent_count) + Math.max(0, job.error_count);
  const targetCount = job.target_type === "device" ? job.target_values.length : 0;
  return Math.max(counted, targetCount);
}

export function jobFailedCount(job: NotificationJob) {
  const requested = jobRequestedCount(job);
  return Math.min(requested, Math.max(Math.max(0, job.error_count), requested - Math.max(0, job.sent_count)));
}

export function jobSuccessRate(job: NotificationJob) {
  const requested = jobRequestedCount(job);
  return requested ? (Math.max(0, job.sent_count) / requested) * 100 : 0;
}

export function notificationJobBadgeStatus(job: NotificationJob) {
  if (Math.max(0, job.sent_count) > 0 && Math.max(0, job.error_count) > 0) return "sent_with_issues";
  return job.status;
}

export function valuesMatchSearch(values: Array<string | null | undefined>, search: string) {
  return fuzzyValuesMatchSearch(values, search);
}

function notificationEventText(event: NotificationEvent) {
  return [event.event_type, event.status].filter(Boolean).join(" ").toLowerCase();
}

function isNotificationOpenEvent(event: NotificationEvent) {
  const text = notificationEventText(event);
  return text.includes("open") || text.includes("click") || text.includes("tap");
}

function isNotificationReceivedEvent(event: NotificationEvent) {
  const text = notificationEventText(event);
  return text.includes("received") || text.includes("delivered");
}

function isNotificationImpressionEvent(event: NotificationEvent) {
  const text = notificationEventText(event);
  return text.includes("impression") || text.includes("display") || text.includes("shown");
}

function notificationEventCount(events: NotificationEvent[], predicate: (event: NotificationEvent) => boolean) {
  return events.filter(predicate).length;
}

function notificationUniqueEventCount(events: NotificationEvent[], predicate: (event: NotificationEvent) => boolean) {
  const unique = new Set<string>();
  events.forEach((event) => {
    if (!predicate(event)) return;
    unique.add(event.device_id ?? event.target_value ?? event.id);
  });
  return unique.size;
}

export function notificationOpenEventCount(events: NotificationEvent[]) {
  return notificationEventCount(events, isNotificationOpenEvent);
}

export function notificationReceivedEventCount(events: NotificationEvent[]) {
  return notificationEventCount(events, isNotificationReceivedEvent);
}

export function notificationImpressionEventCount(events: NotificationEvent[]) {
  return notificationEventCount(events, isNotificationImpressionEvent);
}

export function notificationUniqueOpenCount(events: NotificationEvent[]) {
  return notificationUniqueEventCount(events, isNotificationOpenEvent);
}

export function notificationUniqueReceivedCount(events: NotificationEvent[]) {
  return notificationUniqueEventCount(events, isNotificationReceivedEvent);
}

export function notificationUniqueImpressionCount(events: NotificationEvent[]) {
  return notificationUniqueEventCount(events, isNotificationImpressionEvent);
}

function buildDeliveryBuckets(jobs: NotificationJob[], events: NotificationEvent[] = [], days = 30): DeliveryBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));

  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      failed: 0,
      impressions: 0,
      key: dayKey(date),
      label: dayLabel(date),
      opened: 0,
      rate: 0,
      received: 0,
      requested: 0,
      sent: 0,
    };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  jobs.forEach((job) => {
    const date = new Date(job.sent_at ?? job.created_at);
    if (Number.isNaN(date.getTime())) return;
    date.setHours(0, 0, 0, 0);
    const bucket = byKey.get(dayKey(date));
    if (!bucket) return;
    bucket.requested += jobRequestedCount(job);
    bucket.sent += Math.max(0, job.sent_count);
    bucket.failed += jobFailedCount(job);
  });

  events.forEach((event) => {
    const date = new Date(event.created_at);
    if (Number.isNaN(date.getTime())) return;
    date.setHours(0, 0, 0, 0);
    const bucket = byKey.get(dayKey(date));
    if (!bucket) return;
    if (isNotificationReceivedEvent(event)) bucket.received += 1;
    if (isNotificationImpressionEvent(event)) bucket.impressions += 1;
    if (isNotificationOpenEvent(event)) bucket.opened += 1;
  });

  buckets.forEach((bucket) => {
    bucket.rate = bucket.requested ? Math.round((bucket.sent / bucket.requested) * 100) : 0;
  });

  return buckets;
}

function DeliveryMetric({
  color,
  icon,
  label,
  sub,
  value,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  sub: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={cn("flex size-5 items-center justify-center rounded-md text-white", color)}>{icon}</span>
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

export function DeliveryDashboard({
  events,
  jobs,
}: {
  events: NotificationEvent[];
  jobs: NotificationJob[];
}) {
  const [visibleMetricKeys, setVisibleMetricKeys] = useState<DeliveryMetricKey[]>(["sent", "received", "impressions", "opened"]);
  const buckets = buildDeliveryBuckets(jobs, events);
  const sent = jobs.reduce((total, job) => total + Math.max(0, job.sent_count), 0);
  const requested = jobs.reduce((total, job) => total + jobRequestedCount(job), 0);
  const failed = jobs.reduce((total, job) => total + jobFailedCount(job), 0);
  const successRate = requested ? (sent / requested) * 100 : 0;
  const received = notificationUniqueReceivedCount(events);
  const impressions = notificationUniqueImpressionCount(events);
  const opened = notificationUniqueOpenCount(events);
  const receivedEvents = notificationReceivedEventCount(events);
  const impressionEvents = notificationImpressionEventCount(events);
  const openEvents = notificationOpenEventCount(events);
  const visibleMetrics = DELIVERY_METRICS.filter((metric) => visibleMetricKeys.includes(metric.key));
  const metricStats: Record<DeliveryMetricKey, { sub: string; value: string }> = {
    failed: {
      sub: `${jobs.length} send job(s)`,
      value: numberLabel(failed),
    },
    impressions: {
      sub: `${numberLabel(impressions)} unique token(s)`,
      value: numberLabel(impressionEvents),
    },
    opened: {
      sub: `${numberLabel(opened)} unique token(s)`,
      value: numberLabel(openEvents),
    },
    rate: {
      sub: "success rate",
      value: rateLabel(successRate),
    },
    received: {
      sub: `${numberLabel(received)} unique token(s)`,
      value: numberLabel(receivedEvents),
    },
    requested: {
      sub: `${jobs.length} send job(s)`,
      value: numberLabel(requested),
    },
    sent: {
      sub: `${jobs.length} send job(s)`,
      value: numberLabel(sent),
    },
  };
  const toggleMetric = (key: DeliveryMetricKey, checked: boolean) => {
    setVisibleMetricKeys((current) => {
      if (checked) return current.includes(key) ? current : [...current, key];
      return current.length > 1 ? current.filter((item) => item !== key) : current;
    });
  };

  return (
    <section className="grid gap-3 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {visibleMetrics.map((metric) => (
          <DeliveryMetric
            key={metric.key}
            color={metric.color}
            icon={metric.icon}
            label={metric.label}
            sub={metricStats[metric.key].sub}
            value={metricStats[metric.key].value}
          />
        ))}
      </div>

      <Card size="sm" className="overflow-hidden rounded-xl">
        <CardHeader className="border-b bg-muted/20 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 size={16} />
                Delivery dashboard
              </CardTitle>
              <CardDescription className="text-xs">Last 30 days from saved notification jobs.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">View</span>
              {DELIVERY_METRICS.map((metric) => {
                const checked = visibleMetricKeys.includes(metric.key);
                return (
                  <button
                    key={metric.key}
                    type="button"
                    onClick={() => toggleMetric(metric.key, !checked)}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition",
                      checked
                        ? "border-border bg-background text-foreground shadow-sm"
                        : "border-transparent bg-muted/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-3.5 items-center justify-center rounded-[4px] border transition",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background"
                      )}
                    >
                      {checked ? <CheckCircle2 size={10} /> : null}
                    </span>
                    <span className={cn("size-2 rounded-full", metric.color)} />
                    {metric.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          <div className="h-72 rounded-lg border bg-background p-2">
            <DeliveryLineChart buckets={buckets} metrics={visibleMetrics} />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function platformLabel(platform: PlatformFilter | string | null | undefined) {
  return platform === "ios" ? "iOS" : "Android";
}

export function notificationHref(section: NotificationFunctionSection, app?: StoreMapping | null) {
  const params = app ? `?app=${encodeURIComponent(app.id)}` : "";
  return `/notifications/${section}${params}`;
}

export function sectionLabel(section: NotificationFunctionSection) {
  if (section === "overview") return "Overview";
  if (section === "schedules") return "Schedules";
  if (section === "history") return "History";
  return "Send";
}

export function validateMessageRows(rows: LocaleRow[]) {
  if (!rows.length) throw new Error("Enable at least one language.");

  for (const row of rows) {
    if (!row.title.trim() || !row.message.trim()) throw new Error(`Missing title or message for ${row.topicCode}.`);
    if (row.title.length > TITLE_MAX_LENGTH) throw new Error(`${row.topicCode} title is longer than ${TITLE_MAX_LENGTH} characters.`);
    if (row.message.length > MESSAGE_MAX_LENGTH) throw new Error(`${row.topicCode} message is longer than ${MESSAGE_MAX_LENGTH} characters.`);
  }
}

export function appSelectionDescription(apps: StoreMapping[], devices: DeviceToken[]) {
  const deviceCount = apps.reduce((total, app) => total + devicesForApp(app, devices).length, 0);
  return `${apps.length} mapped app(s), ${deviceCount} active FCM token(s). Select one or more apps to send together.`;
}

function AppStatusDot({ status }: { status: string | null | undefined }) {
  const normalized = (status ?? "").toLowerCase();
  const isActive = normalized === "active";
  const isInactive = normalized === "inactive" || normalized === "paused";
  const label = isActive ? "Active" : isInactive ? "Inactive" : status ?? "Unknown";

  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-2.5 shrink-0 rounded-full ring-2 ring-background",
        isActive
          ? "bg-emerald-500"
          : isInactive
            ? "bg-amber-400"
            : "bg-slate-300"
      )}
    />
  );
}

export function AppSelectionTable({
  apps,
  credentials,
  deviceCounts,
  devices,
  fillHeight = false,
  schedules,
  scheduleStats,
  search,
  selectedAppIdSet,
  updateAppSelection,
  onSearchChange,
}: {
  apps: StoreMapping[];
  credentials: NotificationsPageData["credentialSecrets"];
  deviceCounts?: Record<string, number>;
  devices: DeviceToken[];
  fillHeight?: boolean;
  schedules: NotificationSchedule[];
  scheduleStats?: NotificationsPageData["notificationScheduleStats"];
  search: string;
  selectedAppIdSet: Set<string>;
  updateAppSelection: (appId: string, checked?: boolean) => void;
  onSearchChange: (value: string) => void;
}) {
  const totalDeviceCount = useMemo(
    () => apps.reduce((total, app) => total + (deviceCounts?.[app.id] ?? tokensForApp(app, devices, { activeOnly: true }).length), 0),
    [apps, deviceCounts, devices],
  );
  const filteredApps = useMemo(
    () =>
      apps
        .filter((app) => appMatchesSearch(app, search))
        .map((app) => {
          const localSchedules = schedules.filter((schedule) => scheduleMatchesApp(schedule, app));
          const stat = scheduleStats?.[app.id];

          return {
            activeSchedules: (stat?.active ?? 0) + localSchedules.filter((schedule) => schedule.status === "active").length,
            app,
            credentials: matchingFirebaseCredentials(app, credentials),
            totalSchedules: (stat?.total ?? 0) + localSchedules.length,
            totalTokens: deviceCounts?.[app.id] ?? tokensForApp(app, devices, { activeOnly: true }).length,
          };
        }),
    [apps, credentials, deviceCounts, devices, scheduleStats, schedules, search],
  );

  return (
    <Card size="sm" className={cn("min-h-0 overflow-hidden rounded-xl bg-card shadow-sm shadow-slate-200/50", fillHeight && "flex h-full flex-col")}>
      <CardHeader className="shrink-0 border-b bg-muted/20 py-2.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-sm">Target app</CardTitle>
            <CardDescription className="max-w-3xl text-xs">
              {apps.length} mapped app(s), {totalDeviceCount} active FCM token(s). Select one or more apps to send together.
            </CardDescription>
          </div>
          <div className="w-full lg:w-80">
            <AppSearchDropdown
              apps={apps}
              onValueChange={onSearchChange}
              placeholder="Search app, package, bundle, store..."
              value={search}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("px-0", fillHeight && "min-h-0 flex-1")}>
        <div className={cn("overflow-auto", fillHeight ? "h-full min-h-0" : "max-h-52")}>
          <Table className={cn("text-sm", fillHeight && "min-w-[840px] table-fixed")}>
            <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <TableHead className="h-9 w-[56px] pl-4">Pick</TableHead>
                <TableHead className="h-9 w-[30%] min-w-56">App</TableHead>
                <TableHead className="h-9 w-28">Platform</TableHead>
                <TableHead className="h-9 w-[32%] min-w-56">Identifier</TableHead>
                <TableHead className="h-9 w-32">Tokens</TableHead>
                <TableHead className="h-9 w-24">Config</TableHead>
                <TableHead className="h-9 w-24">Schedules</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApps.length ? (
                filteredApps.map(({ activeSchedules, app, credentials: appCredentials, totalSchedules, totalTokens }) => {
                  const selected = selectedAppIdSet.has(app.id);

                  return (
                    <TableRow
                      key={app.id}
                      onClick={() => updateAppSelection(app.id)}
                      className={cn("cursor-pointer transition-colors hover:bg-muted/45", selected && "bg-emerald-50/60 hover:bg-emerald-50")}
                    >
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => updateAppSelection(app.id, checked === true)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Select ${app.app_name}`}
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-3">
                          <AppIcon app={app} />
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="truncate font-medium">{app.app_name}</div>
                              <AppStatusDot status={app.status} />
                            </div>
                            <div className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground">{app.store_account_name}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <PlatformBadge platform={app.platform} />
                      </TableCell>
                      <TableCell>
                        <div className="max-w-full truncate rounded-md bg-muted px-2 py-1 font-mono text-xs">{compactIdentifier(app)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{totalTokens}</div>
                        <div className="text-xs text-muted-foreground">active</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-6 gap-1 rounded-md px-2 text-xs",
                            appCredentials.length ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
                          )}
                        >
                          {appCredentials.length ? <CheckCircle2 size={12} /> : <TriangleAlert size={12} />}
                          {appCredentials.length ? "ready" : "missing"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{totalSchedules}</div>
                        <div className="text-xs text-muted-foreground">{activeSchedules} active</div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableEmptyState colSpan={7} icon={Bell} title="No apps" description="Create app mappings first, then return here." />
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function RecordFilterControls({
  apps,
  appFilter,
  onAppFilterChange,
  onSearchChange,
  onStoreFilterChange,
  placeholder,
  search,
  storeFilter,
  stores,
}: {
  apps: StoreMapping[];
  appFilter: string;
  onAppFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onStoreFilterChange: (value: string) => void;
  placeholder: string;
  search: string;
  storeFilter: string;
  stores: string[];
}) {
  return (
    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_15rem_13rem]">
      <AppSearchDropdown
        apps={apps}
        onValueChange={onSearchChange}
        placeholder={placeholder}
        value={search}
      />
      <Select value={appFilter} onValueChange={onAppFilterChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="All apps" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={ALL_FILTER_VALUE}>All apps</SelectItem>
          {apps.map((app) => (
            <SelectItem key={app.id} value={app.id}>
              {app.app_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={storeFilter} onValueChange={onStoreFilterChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="All stores" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={ALL_FILTER_VALUE}>All stores</SelectItem>
          {stores.map((store) => (
            <SelectItem key={store} value={store}>
              {store}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
