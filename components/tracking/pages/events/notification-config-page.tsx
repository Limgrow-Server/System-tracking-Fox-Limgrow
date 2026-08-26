"use client";

import { FormEvent, useRef, useState } from "react";
import {
  BellRing,
  CircleCheck,
  Globe2,
  KeyRound,
  Languages,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { AppConfigSelector } from "@/components/tracking/pages/events/app-config-selector";
import { EmptyPanel, PageHeader } from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/lib/client/toast";
import type { AppConfigOption } from "@/lib/tracking/app-config";
import { notificationTopicName } from "@/lib/tracking/notification-topics";

type NotificationConfig = {
  enabled: boolean;
  hasFirebaseServiceAccount: boolean;
  topicsByLanguage: Record<string, string>;
};

type ConfigState = "idle" | "loading" | "new" | "ready" | "error";

type TopicRow = {
  id: number;
  language: string;
  topic: string;
};

const languageOptions = [
  { label: "Mặc định / tất cả", value: "default" },
  { label: "Tiếng Việt", value: "vi" },
  { label: "English", value: "en" },
  { label: "日本語", value: "ja" },
  { label: "한국어", value: "ko" },
  { label: "ภาษาไทย", value: "th" },
  { label: "Bahasa Indonesia", value: "id" },
  { label: "Español", value: "es" },
  { label: "Français", value: "fr" },
  { label: "Deutsch", value: "de" },
  { label: "Português", value: "pt" },
  { label: "简体中文", value: "zh-cn" },
  { label: "繁體中文", value: "zh-tw" },
];

let topicRowId = 0;

function suggestedTopic(mappingId: string, language: string) {
  return notificationTopicName(mappingId, language === "default" ? "en" : language);
}

function initialRows(mappingId: string): TopicRow[] {
  return ["default", "vi", "en"].map((language) => ({
    id: ++topicRowId,
    language,
    topic: suggestedTopic(mappingId, language),
  }));
}

function rowsFromTopics(topics: Record<string, string>) {
  return Object.entries(topics)
    .sort(([left], [right]) => {
      if (left === "default") return -1;
      if (right === "default") return 1;
      return left.localeCompare(right);
    })
    .map(([language, topic]) => ({ id: ++topicRowId, language, topic }));
}

export function NotificationConfigPage({ apps }: { apps: AppConfigOption[] }) {
  const requestId = useRef(0);
  const [selectedApp, setSelectedApp] = useState<AppConfigOption | null>(null);
  const [configState, setConfigState] = useState<ConfigState>("idle");
  const [enabled, setEnabled] = useState(false);
  const [topicRows, setTopicRows] = useState<TopicRow[]>([]);
  const [firebaseServiceAccount, setFirebaseServiceAccount] = useState("");
  const [hasFirebaseAccount, setHasFirebaseAccount] = useState(false);
  const [saving, setSaving] = useState(false);

  function endpoint(app: AppConfigOption) {
    return `/api/admin/notification-config?appId=${encodeURIComponent(app.appId)}&platform=${app.platform}`;
  }

  async function selectApp(app: AppConfigOption) {
    const currentRequest = ++requestId.current;
    setSelectedApp(app);
    setConfigState("loading");
    setEnabled(false);
    setTopicRows(initialRows(app.mappingId));
    setFirebaseServiceAccount("");
    setHasFirebaseAccount(false);

    try {
      const response = await fetch(endpoint(app), { cache: "no-store" });
      if (currentRequest !== requestId.current) return;
      if (response.status === 404) {
        setConfigState("new");
        return;
      }
      const payload = (await response.json()) as NotificationConfig & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Không tải được cấu hình notification.");
      setEnabled(payload.enabled);
      setTopicRows(rowsFromTopics(payload.topicsByLanguage));
      setHasFirebaseAccount(payload.hasFirebaseServiceAccount);
      setConfigState("ready");
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setConfigState("error");
      await showToast(
        "error",
        error instanceof Error ? error.message : "Không tải được cấu hình notification.",
      );
    }
  }

  function addLanguage() {
    if (!selectedApp) return;
    const used = new Set(topicRows.map((row) => row.language));
    const language = languageOptions.find((option) => !used.has(option.value))?.value;
    if (!language) {
      void showToast("info", "Đã thêm toàn bộ ngôn ngữ có sẵn.");
      return;
    }
    setTopicRows((current) => [
      ...current,
      {
        id: ++topicRowId,
        language,
        topic: suggestedTopic(selectedApp.mappingId, language),
      },
    ]);
  }

  function updateRow(id: number, patch: Partial<TopicRow>) {
    setTopicRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    if (!selectedApp) return;

    const languages = topicRows.map((row) => row.language.trim().toLowerCase());
    if (new Set(languages).size !== languages.length) {
      await showToast("warning", "Mỗi ngôn ngữ chỉ được cấu hình một lần.");
      return;
    }
    if (enabled && !languages.includes("default")) {
      await showToast("warning", "Cần topic mặc định để fallback khi event không có ngôn ngữ.");
      return;
    }

    setSaving(true);
    try {
      const serviceAccount = firebaseServiceAccount.trim()
        ? (JSON.parse(firebaseServiceAccount) as Record<string, unknown>)
        : undefined;
      const response = await fetch(endpoint(selectedApp), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled,
          firebaseServiceAccount: serviceAccount,
          topicsByLanguage: Object.fromEntries(
            topicRows.map((row) => [
              row.language.trim().toLowerCase(),
              row.topic.trim().replace(/^\/topics\//i, ""),
            ]),
          ),
        }),
      });
      const payload = (await response.json()) as NotificationConfig & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Không lưu được cấu hình notification.");
      setFirebaseServiceAccount("");
      setHasFirebaseAccount(payload.hasFirebaseServiceAccount);
      setTopicRows(rowsFromTopics(payload.topicsByLanguage));
      setConfigState("ready");
      await showToast("success", "Đã lưu Firebase topics theo ngôn ngữ.");
    } catch (error) {
      const message =
        error instanceof SyntaxError
          ? "Firebase service account không phải JSON hợp lệ."
          : error instanceof Error
            ? error.message
            : "Không lưu được cấu hình notification.";
      await showToast("error", message);
    } finally {
      setSaving(false);
    }
  }

  const selectedKey = selectedApp?.key ?? "";
  const formVisible = selectedApp && configState !== "loading";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Firebase Messaging"
        title="Notification topics"
        description="Cấu hình Firebase riêng cho từng ứng dụng và định tuyến topic theo ngôn ngữ của event. Không sử dụng FCM device token."
      />

      <Card className="overflow-visible">
        <CardHeader className="border-b bg-muted/25">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Chọn ứng dụng</CardTitle>
              <CardDescription>
                Mỗi ứng dụng có service account và bộ topic riêng.
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
            icon={BellRing}
            title="Chọn ứng dụng để cấu hình topic"
            description="Worker sẽ chọn topic đúng theo locale sau khi event name đã được accept vào catalog."
          />
        </Card>
      ) : configState === "loading" ? (
        <ConfigSkeleton />
      ) : formVisible ? (
        <form onSubmit={saveConfig} className="space-y-6">
          {configState === "new" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Chưa có notification config cho {selectedApp.appName}. Hệ thống đã đề xuất topic mặc định, tiếng Việt và tiếng Anh.
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Languages size={18} /> Topics theo ngôn ngữ
                </CardTitle>
                <CardDescription>
                  Worker ưu tiên locale đầy đủ, sau đó mã ngôn ngữ và cuối cùng là default.
                </CardDescription>
                <CardAction>
                  <Button type="button" variant="outline" onClick={addLanguage}>
                    <Plus /> Thêm ngôn ngữ
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                {topicRows.map((row) => {
                  const selectedLanguage = languageOptions.find(
                    (option) => option.value === row.language,
                  );
                  return (
                    <div
                      key={row.id}
                      className="relative grid gap-3 rounded-lg border bg-muted/15 p-3 md:grid-cols-[12rem_minmax(0,1fr)_2.5rem] md:items-end"
                    >
                      <div className="space-y-2">
                        <Label>Ngôn ngữ</Label>
                        <Select
                          value={row.language}
                          onValueChange={(language) => {
                            updateRow(row.id, {
                              language,
                              topic:
                                selectedApp &&
                                row.topic === suggestedTopic(selectedApp.mappingId, row.language)
                                  ? suggestedTopic(selectedApp.mappingId, language)
                                  : row.topic,
                            });
                          }}
                          disabled={row.language === "default"}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue>
                              {selectedLanguage?.label ?? row.language}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent align="start">
                            {!selectedLanguage ? (
                              <SelectItem value={row.language}>{row.language}</SelectItem>
                            ) : null}
                            {languageOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                                disabled={topicRows.some(
                                  (candidate) =>
                                    candidate.id !== row.id &&
                                    candidate.language === option.value,
                                )}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`topic-${row.id}`}>Firebase topic</Label>
                        <div className="relative">
                          <Globe2 className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                          <Input
                            id={`topic-${row.id}`}
                            value={row.topic}
                            onChange={(event) => updateRow(row.id, { topic: event.target.value })}
                            className="pl-8 font-mono text-xs"
                            placeholder={suggestedTopic(selectedApp.mappingId, row.language)}
                            required={enabled}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setTopicRows((current) => current.filter((item) => item.id !== row.id))
                        }
                        disabled={row.language === "default"}
                        aria-label={`Xóa topic ${row.language}`}
                        className="absolute right-2 top-2 text-muted-foreground hover:text-destructive md:static"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  );
                })}
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  Ví dụ event có <code>metadata.locale = &quot;vi-VN&quot;</code> sẽ dùng topic <code>vi</code>. Nếu không tìm thấy, worker dùng <code>default</code>.
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound size={18} /> Firebase credential
                  </CardTitle>
                  <CardDescription>
                    Một service account cho ứng dụng. JSON được mã hóa trước khi lưu.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="service-account">Service account JSON</Label>
                    {hasFirebaseAccount ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        <CircleCheck /> Đã lưu
                      </Badge>
                    ) : null}
                  </div>
                  <Textarea
                    id="service-account"
                    value={firebaseServiceAccount}
                    onChange={(event) => setFirebaseServiceAccount(event.target.value)}
                    rows={12}
                    className="font-mono text-xs"
                    placeholder={
                      hasFirebaseAccount
                        ? "Để trống để giữ service account hiện tại"
                        : '{"project_id":"…","client_email":"…","private_key":"-----BEGIN PRIVATE KEY-----…"}'
                    }
                    autoComplete="off"
                    required={enabled && !hasFirebaseAccount}
                  />
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
                      <span className="block text-sm font-medium">Bật gửi Firebase topic</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        Chỉ event name đã có trong catalog mới được worker gửi data message.
                      </span>
                    </span>
                  </label>
                  <Button type="submit" className="w-full" disabled={saving || configState === "error"}>
                    <Save /> {saving ? "Đang lưu…" : "Lưu notification config"}
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
  if (state === "error") return <Badge variant="destructive">Không tải được</Badge>;
  return (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
      <CircleCheck /> Đã cấu hình
    </Badge>
  );
}

function ConfigSkeleton() {
  return (
    <div className="grid animate-pulse gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
      <div className="h-96 rounded-lg border bg-muted/30" />
      <div className="space-y-6">
        <div className="h-72 rounded-lg border bg-muted/30" />
        <div className="h-32 rounded-lg border bg-muted/30" />
      </div>
    </div>
  );
}
