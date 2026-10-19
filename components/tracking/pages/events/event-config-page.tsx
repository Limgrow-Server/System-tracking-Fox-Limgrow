"use client";

import { FormEvent, useRef, useState } from "react";
import {
  Activity,
  CircleCheck,
  KeyRound,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";

import { AppConfigSelector } from "@/components/tracking/pages/events/app-config-selector";
import { EmptyPanel, PageHeader } from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showToast } from "@/lib/client/toast";
import type { AppConfigOption } from "@/lib/tracking/app-config";

type EventConfig = {
  allowedEvents: string[];
  enabled: boolean;
  eventMapping: Record<string, string>;
  ga4MeasurementId: string;
  hasGa4ApiSecret: boolean;
};

type ConfigState = "idle" | "loading" | "new" | "ready" | "error";

const defaultEvents = [
  "purchase",
  "app_open",
  "first_open",
  "login",
  "screen_view",
  "button_click",
  "ad_impression",
  "feature_complete",
];

const defaultEventMapping: Record<string, string> = {
  first_open: "app_first_open",
};

function withFirstOpen(events: string[]) {
  if (events.includes("first_open")) return events;
  const appOpenIndex = events.indexOf("app_open");
  const next = [...events];
  next.splice(
    appOpenIndex >= 0 ? appOpenIndex + 1 : next.length,
    0,
    "first_open",
  );
  return next;
}

export function EventConfigPage({ apps }: { apps: AppConfigOption[] }) {
  const requestId = useRef(0);
  const [selectedApp, setSelectedApp] = useState<AppConfigOption | null>(null);
  const [configState, setConfigState] = useState<ConfigState>("idle");
  const [allowedEvents, setAllowedEvents] = useState(defaultEvents);
  const [newEventName, setNewEventName] = useState("");
  const [ga4MeasurementId, setGa4MeasurementId] = useState("");
  const [ga4ApiSecret, setGa4ApiSecret] = useState("");
  const [eventMapping, setEventMapping] =
    useState<Record<string, string>>(defaultEventMapping);
  const [enabled, setEnabled] = useState(true);
  const [hasGa4Secret, setHasGa4Secret] = useState(false);
  const [saving, setSaving] = useState(false);

  function endpoint(app: AppConfigOption) {
    return `/api/admin/event-config?appId=${encodeURIComponent(app.appId)}&platform=${app.platform}`;
  }

  function resetForm() {
    setAllowedEvents(defaultEvents);
    setGa4MeasurementId("");
    setGa4ApiSecret("");
    setEventMapping(defaultEventMapping);
    setEnabled(true);
    setHasGa4Secret(false);
  }

  async function selectApp(app: AppConfigOption) {
    const currentRequest = ++requestId.current;
    setSelectedApp(app);
    setConfigState("loading");
    resetForm();

    try {
      const response = await fetch(endpoint(app), { cache: "no-store" });
      if (currentRequest !== requestId.current) return;
      if (response.status === 404) {
        setConfigState("new");
        return;
      }
      const payload = (await response.json()) as EventConfig & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.message || "Không tải được cấu hình.");
      setAllowedEvents(withFirstOpen(payload.allowedEvents));
      setGa4MeasurementId(payload.ga4MeasurementId);
      setEventMapping({
        ...defaultEventMapping,
        ...(payload.eventMapping || {}),
      });
      setEnabled(payload.enabled);
      setHasGa4Secret(payload.hasGa4ApiSecret);
      setConfigState("ready");
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setConfigState("error");
      await showToast(
        "error",
        error instanceof Error ? error.message : "Không tải được cấu hình.",
      );
    }
  }

  function addEvent() {
    const eventName = newEventName.trim();
    if (!eventName) return;
    if (!/^[a-z][a-z0-9_]{0,79}$/i.test(eventName)) {
      void showToast(
        "warning",
        "Tên event phải bắt đầu bằng chữ và chỉ gồm chữ, số hoặc dấu gạch dưới.",
      );
      return;
    }
    if (allowedEvents.includes(eventName)) {
      void showToast("info", "Event này đã có trong danh sách.");
      return;
    }
    setAllowedEvents((current) => [...current, eventName]);
    setNewEventName("");
  }

  function removeEvent(eventName: string) {
    setAllowedEvents((current) => current.filter((name) => name !== eventName));
    setEventMapping((current) => {
      const next = { ...current };
      delete next[eventName];
      return next;
    });
  }

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    if (!selectedApp) return;
    if (!allowedEvents.length) {
      await showToast("warning", "Cần ít nhất một event được phép.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(endpoint(selectedApp), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          allowedEvents,
          enabled,
          eventMapping: Object.fromEntries(
            allowedEvents.map((name) => [
              name,
              eventMapping[name]?.trim() || defaultEventMapping[name] || name,
            ]),
          ),
          ga4ApiSecret: ga4ApiSecret.trim() || undefined,
          ga4MeasurementId: ga4MeasurementId.trim(),
        }),
      });
      const payload = (await response.json()) as EventConfig & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.message || "Không lưu được cấu hình.");
      setGa4ApiSecret("");
      setHasGa4Secret(payload.hasGa4ApiSecret);
      setEventMapping(payload.eventMapping || {});
      setConfigState("ready");
      await showToast("success", "Đã lưu cấu hình Event và GA4.");
    } catch (error) {
      await showToast(
        "error",
        error instanceof Error ? error.message : "Không lưu được cấu hình.",
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedKey = selectedApp?.key ?? "";
  const formVisible = selectedApp && configState !== "loading";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event Tracking"
        title="Event catalog & GA4"
        description="Quản lý event name đã được accept và cách tự động ánh xạ sang GA4 cho từng ứng dụng. Notification được cấu hình riêng."
      />

      <Card className="overflow-visible">
        <CardHeader className="border-b bg-muted/25">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Chọn ứng dụng</CardTitle>
              <CardDescription>
                Danh sách lấy trực tiếp từ App Mapping, không cần nhập App ID
                thủ công.
              </CardDescription>
            </div>
            <ConfigBadge state={configState} />
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <AppConfigSelector
            apps={apps}
            disabled={saving}
            onChange={(app) => void selectApp(app)}
            value={selectedKey}
          />
        </CardContent>
      </Card>

      {!selectedApp ? (
        <Card>
          <EmptyPanel
            icon={Settings2}
            title="Chọn một ứng dụng để bắt đầu"
            description="Cấu hình Event và GA4 được lưu độc lập cho từng ứng dụng Android hoặc iOS."
          />
        </Card>
      ) : configState === "loading" ? (
        <ConfigSkeleton />
      ) : formVisible ? (
        <form onSubmit={saveConfig} className="space-y-6">
          {configState === "new" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {selectedApp.appName} chưa có đủ GA4/Firebase key trong App
              Mapping để tự liên kết. Bổ sung key hoặc nhập trực tiếp bên dưới.
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity size={18} /> Event catalog
                </CardTitle>
                <CardDescription>
                  Worker chỉ nhận các event trong danh sách và dùng tên GA4
                  tương ứng khi gửi.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={newEventName}
                    onChange={(event) => setNewEventName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addEvent();
                      }
                    }}
                    placeholder="custom_event_name"
                    aria-label="Tên event mới"
                  />
                  <Button type="button" variant="outline" onClick={addEvent}>
                    <Plus /> Thêm event
                  </Button>
                </div>

                <div className="overflow-hidden rounded-lg border">
                  <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
                    <span>Internal event</span>
                    <span>GA4 event name</span>
                    <span className="sr-only">Xóa</span>
                  </div>
                  {allowedEvents.map((eventName, index) => (
                    <div
                      key={eventName}
                      className="relative grid gap-2 border-b px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] sm:items-center sm:gap-3 sm:py-2"
                    >
                      <div className="min-w-0 pr-9 sm:pr-0">
                        <code className="block truncate text-xs font-medium">
                          {eventName}
                        </code>
                        {index === 0 && eventName === "purchase" ? (
                          <span className="text-[11px] text-muted-foreground">
                            IAP / Subscription
                          </span>
                        ) : null}
                        {eventName === "first_open" ? (
                          <span className="text-[11px] text-muted-foreground">
                            Gửi sang GA4 với tên app_first_open
                          </span>
                        ) : null}
                      </div>
                      <Input
                        value={
                          eventMapping[eventName] ??
                          defaultEventMapping[eventName] ??
                          eventName
                        }
                        onChange={(event) =>
                          setEventMapping((current) => ({
                            ...current,
                            [eventName]: event.target.value,
                          }))
                        }
                        aria-label={`GA4 mapping cho ${eventName}`}
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeEvent(eventName)}
                        aria-label={`Xóa ${eventName}`}
                        className="absolute right-2 top-2 text-muted-foreground hover:text-destructive sm:static"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound size={18} /> GA4 destination
                  </CardTitle>
                  <CardDescription>
                    Secret được mã hóa ở backend và không trả lại trình duyệt.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="measurement-id">
                      Firebase App ID / Measurement ID
                    </Label>
                    <Input
                      id="measurement-id"
                      value={ga4MeasurementId}
                      onChange={(event) =>
                        setGa4MeasurementId(event.target.value)
                      }
                      placeholder={
                        selectedApp.platform === "ios"
                          ? "1:1234567890:ios:abcdef123456"
                          : "1:1234567890:android:abcdef123456"
                      }
                      required
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      Tự lấy Firebase App ID và API secret từ App Mapping nếu
                      app đã cấu hình.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="ga4-secret">API secret</Label>
                      {hasGa4Secret ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-emerald-700"
                        >
                          <CircleCheck /> Đã lưu
                        </Badge>
                      ) : null}
                    </div>
                    <Input
                      id="ga4-secret"
                      type="password"
                      value={ga4ApiSecret}
                      onChange={(event) => setGa4ApiSecret(event.target.value)}
                      placeholder={
                        hasGa4Secret
                          ? "Để trống để giữ secret hiện tại"
                          : "Nhập GA4 API secret"
                      }
                      autoComplete="new-password"
                      required={!hasGa4Secret}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 pt-5">
                  <label className="flex items-start gap-3">
                    <Checkbox
                      checked={enabled}
                      onCheckedChange={(value) => setEnabled(value === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Cho phép ingest event
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        Khi tắt, API từ chối event mới của app này nhưng giữ
                        nguyên cấu hình.
                      </span>
                    </span>
                  </label>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={saving || configState === "error"}
                  >
                    <Save /> {saving ? "Đang lưu…" : "Lưu cấu hình Event"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function ConfigBadge({ state }: { state: ConfigState }) {
  if (state === "idle") return <Badge variant="outline">Chưa chọn app</Badge>;
  if (state === "loading") return <Badge variant="secondary">Đang tải…</Badge>;
  if (state === "new") return <Badge variant="outline">Cấu hình mới</Badge>;
  if (state === "error")
    return <Badge variant="destructive">Không tải được</Badge>;
  return (
    <Badge
      variant="outline"
      className="border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      <CircleCheck /> Đã cấu hình
    </Badge>
  );
}

function ConfigSkeleton() {
  return (
    <div className="grid animate-pulse gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
      <div className="h-96 rounded-lg border bg-muted/30" />
      <div className="space-y-6">
        <div className="h-64 rounded-lg border bg-muted/30" />
        <div className="h-32 rounded-lg border bg-muted/30" />
      </div>
    </div>
  );
}
