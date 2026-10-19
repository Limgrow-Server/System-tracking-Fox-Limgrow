"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookPlus,
  CheckCheck,
  Clock3,
  Info,
  Inbox,
  RefreshCw,
  UsersRound,
  X,
} from "lucide-react";

import { AppConfigSelector } from "@/components/tracking/pages/events/app-config-selector";
import { EmptyPanel, PageHeader } from "@/components/tracking/primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { showToast } from "@/lib/client/toast";
import type { AppConfigOption } from "@/lib/tracking/app-config";

type PendingEventDefinition = {
  appId: string;
  eventName: string;
  firstReceivedAt: string;
  kind: "purchase" | "user";
  lastReceivedAt: string;
  pendingCount: number;
  platform: "android" | "ios";
  sampleEventId: string;
  sampleMetadata: Record<string, unknown>;
  uniqueUsers: number;
};

type DecisionResponse = {
  acceptedDefinitions?: number;
  message?: string;
  queuedEvents?: number;
  rejectedDefinitions?: number;
  rejectedEvents?: number;
};

function definitionKey(definition: PendingEventDefinition) {
  return JSON.stringify([
    definition.appId,
    definition.platform,
    definition.kind,
    definition.eventName,
  ]);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function EventApprovalPage({
  apps,
  canApprove,
}: {
  apps: AppConfigOption[];
  canApprove: boolean;
}) {
  const [definitions, setDefinitions] = useState<PendingEventDefinition[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppConfigOption | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const loadDefinitions = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: "200" });
      if (selectedApp) {
        query.set("appId", selectedApp.appId);
        query.set("platform", selectedApp.platform);
      }
      const response = await fetch(
        `/api/admin/event-definitions/pending?${query.toString()}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as PendingEventDefinition[] & {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || "Không tải được event mới.");
      }
      const nextDefinitions = Array.isArray(payload) ? payload : [];
      setDefinitions(nextDefinitions);
      setSelectedKeys((current) => {
        const available = new Set(nextDefinitions.map(definitionKey));
        return new Set([...current].filter((key) => available.has(key)));
      });
    } catch (error) {
      await showToast(
        "error",
        error instanceof Error ? error.message : "Không tải được event mới.",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedApp]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDefinitions(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDefinitions]);

  const selectedDefinitions = useMemo(
    () =>
      definitions.filter((definition) =>
        selectedKeys.has(definitionKey(definition)),
      ),
    [definitions, selectedKeys],
  );
  const pendingPayloadCount = definitions.reduce(
    (total, definition) => total + definition.pendingCount,
    0,
  );

  function toggleDefinition(definition: PendingEventDefinition) {
    const key = definitionKey(definition);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function decide(
    action: "accept" | "reject",
    targets: PendingEventDefinition[],
  ) {
    if (!canApprove || !targets.length) return;
    const operationKey = targets.length === 1 ? definitionKey(targets[0]) : "bulk";
    setPendingKey(operationKey);
    try {
      const response = await fetch("/api/admin/event-definitions/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          definitions: targets.map(
            ({ appId, eventName, kind, platform }) => ({
              appId,
              eventName,
              kind,
              platform,
            }),
          ),
        }),
      });
      const payload = (await response.json()) as DecisionResponse;
      if (!response.ok) {
        throw new Error(payload.message || "Không cập nhật được event catalog.");
      }

      if (action === "accept") {
        await showToast(
          "success",
          `Đã lưu ${payload.acceptedDefinitions ?? targets.length} event vào catalog và đưa ${payload.queuedEvents ?? 0} payload vào queue.`,
        );
      } else {
        await showToast(
          "success",
          `Đã từ chối ${payload.rejectedDefinitions ?? targets.length} event và đóng ${payload.rejectedEvents ?? 0} payload đang chờ.`,
        );
      }
      setSelectedKeys(new Set());
      await loadDefinitions();
    } catch (error) {
      await showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Không cập nhật được event catalog.",
      );
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <PageHeader
        eyebrow="Event Tracking"
        title="Incoming event catalog"
        description="Accept event names mới mà ứng dụng gửi lên. Sau khi lưu vào catalog, payload đang chờ và các payload tiếp theo sẽ tự động đi vào worker queue."
        action={
          <Button
            variant="outline"
            onClick={() => void loadDefinitions()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} /> Làm mới
          </Button>
        }
      />

      {!canApprove ? (
        <Alert>
          <Info />
          <AlertTitle>Read-only access</AlertTitle>
          <AlertDescription>
            Chỉ Admin được Accept hoặc Reject event name. Bạn vẫn có thể xem
            payload mẫu đang chờ.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-visible">
        <CardContent className="grid gap-4 pt-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2">
            <div className="text-sm font-medium">Ứng dụng</div>
            <AppConfigSelector
              apps={apps}
              disabled={loading}
              onChange={setSelectedApp}
              placeholder="Tất cả ứng dụng"
              value={selectedApp?.key ?? ""}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedApp ? (
              <Button
                variant="ghost"
                onClick={() => setSelectedApp(null)}
                disabled={loading}
              >
                <X /> Tất cả app
              </Button>
            ) : null}
            <Badge variant="outline">
              {definitions.length.toLocaleString("vi-VN")} event name mới
            </Badge>
            <Badge variant="secondary">
              {pendingPayloadCount.toLocaleString("vi-VN")} payload đã lưu
            </Badge>
          </div>
        </CardContent>
      </Card>

      {canApprove && selectedDefinitions.length ? (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/35 p-3 sm:flex-row sm:items-center">
          <div className="text-sm font-medium">
            Đã chọn {selectedDefinitions.length} event name
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button
              onClick={() => void decide("accept", selectedDefinitions)}
              disabled={pendingKey !== null}
            >
              <CheckCheck /> Accept và lưu vào catalog
            </Button>
            <Button
              variant="destructive"
              onClick={() => void decide("reject", selectedDefinitions)}
              disabled={pendingKey !== null}
            >
              <X /> Reject đã chọn
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div aria-busy="true" aria-label="Đang tải event" className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="space-y-3 pt-5">
                <div className="h-5 w-56 animate-pulse rounded bg-muted" />
                <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted/70" />
                <div className="h-20 animate-pulse rounded-lg bg-muted/60" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : definitions.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyPanel
              icon={Inbox}
              title="Không có event name mới"
              description="Event đã có trong catalog sẽ tự động vào queue. Event name mới từ ứng dụng sẽ xuất hiện tại đây."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {definitions.map((definition) => {
            const key = definitionKey(definition);
            const selected = selectedKeys.has(key);
            return (
              <Card key={key} data-state={selected ? "selected" : undefined}>
                <CardContent className="grid gap-4 pt-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-start">
                  <Checkbox
                    aria-label={`Chọn ${definition.eventName}`}
                    checked={selected}
                    disabled={!canApprove || pendingKey !== null}
                    onCheckedChange={() => toggleDefinition(definition)}
                  />
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-semibold text-blue-700">
                        {definition.eventName}
                      </code>
                      <Badge variant="outline">{definition.kind}</Badge>
                      <Badge variant="outline" className="capitalize">
                        {definition.platform}
                      </Badge>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {definition.appId}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <BookPlus size={13} />
                        {definition.pendingCount.toLocaleString("vi-VN")} payload
                        đã lưu
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <UsersRound size={13} />
                        {definition.uniqueUsers.toLocaleString("vi-VN")} user
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={13} />
                        {dateTime(definition.firstReceivedAt)} → {dateTime(definition.lastReceivedAt)}
                      </span>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        Payload mẫu · {definition.sampleEventId}
                      </div>
                      <pre className="max-h-32 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                        {JSON.stringify(definition.sampleMetadata || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                  {canApprove ? (
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button
                        onClick={() => void decide("accept", [definition])}
                        disabled={pendingKey !== null}
                      >
                        <CheckCheck /> Accept và lưu
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void decide("reject", [definition])}
                        disabled={pendingKey !== null}
                      >
                        <X /> Reject
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
