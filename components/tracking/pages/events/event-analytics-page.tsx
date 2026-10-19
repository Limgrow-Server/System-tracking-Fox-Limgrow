"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Apple,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Eye,
  Inbox,
  MousePointerClick,
  Radio,
  RefreshCw,
  Repeat2,
  Search,
  Smartphone,
  UsersRound,
  X,
} from "lucide-react";

import { EventAnalyticsChart } from "@/components/tracking/pages/events/event-analytics-chart";
import { AppConfigSelector } from "@/components/tracking/pages/events/app-config-selector";
import { PendingNavigationLink } from "@/components/tracking/pending-navigation-link";
import {
  EmptyPanel,
  PageHeader,
  StatusBadge,
} from "@/components/tracking/primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppConfigOption } from "@/lib/tracking/app-config";
import type {
  EventAnalyticsData,
  EventAnalyticsDestinationBreakdown,
  EventAnalyticsRecentEvent,
} from "@/lib/tracking/event-analytics";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS = [
  { label: "7 ngày", value: 7 },
  { label: "28 ngày", value: 28 },
  { label: "90 ngày", value: 90 },
] as const;

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function percent(value: number) {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function changeRate(current: number, previous: number) {
  if (previous > 0) return ((current - previous) / previous) * 100;
  return current > 0 ? 100 : 0;
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function destinationLabel(value: string) {
  if (value === "firebase_topic") return "Firebase topic";
  if (value === "ga4") return "GA4";
  return value.replaceAll("_", " ");
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  live,
  trend,
  value,
}: {
  detail: string;
  icon: typeof Activity;
  label: string;
  live?: boolean;
  trend?: number;
  value: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardDescription className="font-medium">{label}</CardDescription>
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg border bg-muted/40",
              live && "border-emerald-200 bg-emerald-50 text-emerald-700",
            )}
          >
            <Icon size={17} />
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <strong className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
            {value}
          </strong>
          {trend !== undefined ? (
            <span
              className={cn(
                "mb-1 inline-flex items-center text-xs font-medium tabular-nums",
                trend > 0
                  ? "text-emerald-600"
                  : trend < 0
                    ? "text-rose-600"
                    : "text-muted-foreground",
              )}
            >
              {trend > 0 ? "+" : ""}
              {trend.toFixed(0)}%
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Đang tải event analytics"
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-xl border bg-muted/35"
          />
        ))}
      </div>
      <div className="h-[27rem] animate-pulse rounded-xl border bg-muted/30" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.65fr)]">
        <div className="h-96 animate-pulse rounded-xl border bg-muted/30" />
        <div className="h-80 animate-pulse rounded-xl border bg-muted/30" />
      </div>
    </div>
  );
}

function DestinationSummary({
  rows,
}: {
  rows: EventAnalyticsDestinationBreakdown[];
}) {
  const destinations = useMemo(() => {
    const result = new Map<
      string,
      { delivered: number; failed: number; inFlight: number; total: number }
    >();
    for (const row of rows) {
      const item = result.get(row.destination) ?? {
        delivered: 0,
        failed: 0,
        inFlight: 0,
        total: 0,
      };
      item.total += row.count;
      if (row.status === "delivered") item.delivered += row.count;
      else if (row.status === "failed") item.failed += row.count;
      else item.inFlight += row.count;
      result.set(row.destination, item);
    }
    return Array.from(result.entries());
  }, [rows]);

  if (!destinations.length) {
    return (
      <p className="py-5 text-sm text-muted-foreground">
        Chưa có worker delivery trong khoảng này.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {destinations.map(([destination, counts]) => {
        const rate = counts.total ? (counts.delivered / counts.total) * 100 : 0;
        return (
          <div key={destination} className="rounded-lg bg-muted/45 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                {destinationLabel(destination)}
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {percent(rate)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{counts.delivered.toLocaleString("vi-VN")} delivered</span>
              {counts.inFlight ? (
                <span>
                  {counts.inFlight.toLocaleString("vi-VN")} processing
                </span>
              ) : null}
              {counts.failed ? (
                <span className="text-rose-600">
                  {counts.failed.toLocaleString("vi-VN")} failed
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EventAnalyticsPage({
  apps,
  initialApp,
}: {
  apps: AppConfigOption[];
  initialApp: AppConfigOption;
}) {
  const router = useRouter();
  const requestId = useRef(0);
  const [switchingApp, startAppTransition] = useTransition();
  const selectedApp = initialApp;
  const [days, setDays] = useState(28);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<EventAnalyticsData | null>(null);
  const [loading, setLoading] = useState(Boolean(apps.length));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectedEvent, setInspectedEvent] =
    useState<EventAnalyticsRecentEvent | null>(null);

  const loadAnalytics = useCallback(
    async (silent = false) => {
      if (!selectedApp) {
        setLoading(false);
        return;
      }
      const currentRequest = ++requestId.current;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams({
          appId: selectedApp.appId,
          days: String(days),
          platform: selectedApp.platform,
        });
        if (selectedEvent) query.set("eventName", selectedEvent);
        const response = await fetch(
          `/api/admin/events/analytics?${query.toString()}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as EventAnalyticsData & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(payload.message || "Không tải được event analytics.");
        if (currentRequest !== requestId.current) return;
        setData(payload);
      } catch (loadError) {
        if (currentRequest !== requestId.current) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Không tải được event analytics.",
        );
      } finally {
        if (currentRequest === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [days, selectedApp, selectedEvent],
  );

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadAnalytics(), 0);
    const refreshTimer = window.setInterval(
      () => void loadAnalytics(true),
      30_000,
    );
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadAnalytics]);

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data?.eventCatalog ?? [];
    return (data?.eventCatalog ?? []).filter((row) =>
      row.eventName.toLowerCase().includes(query),
    );
  }, [data?.eventCatalog, search]);

  const statusTotal = useMemo(
    () =>
      (data?.statusBreakdown ?? []).reduce((sum, row) => sum + row.count, 0),
    [data?.statusBreakdown],
  );
  const totalTrend = data
    ? changeRate(data.summary.totalEvents, data.summary.previousTotalEvents)
    : 0;
  const usersTrend = data
    ? changeRate(data.summary.uniqueUsers, data.summary.previousUniqueUsers)
    : 0;
  const completionRate = data?.summary.totalEvents
    ? (data.summary.completedEvents / data.summary.totalEvents) * 100
    : 0;
  const retentionTrend = data
    ? changeRate(
        data.summary.retentionEvents,
        data.summary.previousRetentionEvents,
      )
    : 0;
  const retentionRate = data?.summary.uniqueUsers
    ? (data.summary.returningUsers / data.summary.uniqueUsers) * 100
    : 0;
  const selectedKey = selectedApp?.key ?? "";

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <header className="space-y-4">
        <PendingNavigationLink
          href="/analytics/events"
          className="w-fit gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Tất cả ứng dụng
        </PendingNavigationLink>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-11 rounded-xl border bg-background">
            {selectedApp.iconUrl ? (
              <AvatarImage
                alt={selectedApp.appName}
                className="rounded-xl"
                src={selectedApp.iconUrl}
              />
            ) : null}
            <AvatarFallback className="rounded-xl text-xs font-semibold">
              {selectedApp.appName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate font-heading text-xl font-semibold tracking-tight">
                {selectedApp.appName}
              </h1>
              <Badge variant="outline" className="gap-1.5">
                {selectedApp.platform === "ios" ? (
                  <Apple size={12} />
                ) : (
                  <Smartphone size={12} />
                )}
                {selectedApp.platform === "ios" ? "iOS" : "Android"}
              </Badge>
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {selectedApp.appId}
            </p>
          </div>
        </div>
      </header>

      <PageHeader
        eyebrow="Event Tracking"
        title="Event analytics"
        description="Theo dõi event server đã nhận theo từng ứng dụng, từ lúc chờ được thêm vào catalog đến khi worker giao thành công sang GA4 hoặc Firebase topic."
        action={
          data ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Cập nhật {dateTime(data.generatedAt)}
            </div>
          ) : null
        }
      />

      <Card className="overflow-visible">
        <CardContent className="grid gap-4 pt-5 lg:grid-cols-[minmax(0,1fr)_12rem_auto] lg:items-end">
          <div className="space-y-2">
            <Label>Ứng dụng</Label>
            <AppConfigSelector
              apps={apps}
              disabled={refreshing || switchingApp}
              onChange={(app) => {
                if (app.mappingId === selectedApp.mappingId) return;
                startAppTransition(() => {
                  router.push(
                    `/analytics/events/${encodeURIComponent(app.mappingId)}?platform=${app.platform}`,
                  );
                });
              }}
              value={selectedKey}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="analytics-range">Khoảng thời gian</Label>
            <Select
              value={String(days)}
              onValueChange={(value) => setDays(Number(value))}
            >
              <SelectTrigger id="analytics-range" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => void loadAnalytics(true)}
            disabled={!selectedApp || refreshing}
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            Làm mới
          </Button>
        </CardContent>
      </Card>

      {selectedEvent ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <MousePointerClick size={15} />
          Đang phân tích event{" "}
          <code className="font-semibold">{selectedEvent}</code>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-blue-900 hover:bg-blue-100"
            onClick={() => setSelectedEvent(null)}
          >
            <X /> Xem tất cả event
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <Activity />
          <AlertTitle>Không tải được dữ liệu event</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!selectedApp ? (
        <Card>
          <EmptyPanel
            icon={Smartphone}
            title="Chưa có ứng dụng"
            description="Tạo App Mapping trước để xem event analytics theo từng app."
          />
        </Card>
      ) : loading && !data ? (
        <AnalyticsSkeleton />
      ) : data ? (
        <>
          <section
            aria-label="Event summary"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
          >
            <MetricCard
              detail={`So với ${days} ngày liền trước`}
              icon={Activity}
              label="Tổng event"
              trend={totalTrend}
              value={compactNumber(data.summary.totalEvents)}
            />
            <MetricCard
              detail="User ID hoặc Firebase app instance đã nhận diện"
              icon={UsersRound}
              label="Người dùng định danh"
              trend={usersTrend}
              value={compactNumber(data.summary.uniqueUsers)}
            />
            <MetricCard
              detail={`${data.summary.returningUsers.toLocaleString("vi-VN")} user quay lại · ${percent(retentionRate)} user định danh`}
              icon={Repeat2}
              label="Retention opens"
              trend={retentionTrend}
              value={compactNumber(data.summary.retentionEvents)}
            />
            <MetricCard
              detail={`${data.summary.failedEvents.toLocaleString("vi-VN")} failed · ${data.summary.inFlightEvents.toLocaleString("vi-VN")} đang xử lý`}
              icon={CheckCircle2}
              label="Tỉ lệ hoàn tất"
              value={percent(completionRate)}
            />
            <MetricCard
              detail="Tự làm mới mỗi 30 giây"
              icon={Radio}
              label="Event trong 30 phút"
              live
              value={compactNumber(data.summary.last30Minutes)}
            />
          </section>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>{selectedEvent ?? "Xu hướng event"}</CardTitle>
              <CardDescription>
                {selectedEvent
                  ? `Số lần server nhận ${selectedEvent} theo ngày.`
                  : "Tổng event và 4 event phổ biến nhất theo ngày."}
              </CardDescription>
              <CardAction>
                <Badge variant="outline">{days} ngày</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="pt-4">
              {data.summary.totalEvents ? (
                <EventAnalyticsChart
                  catalog={data.eventCatalog}
                  end={data.range.end}
                  selectedEvent={data.selectedEvent}
                  start={data.range.start}
                  trend={data.trend}
                />
              ) : (
                <EmptyPanel
                  icon={Activity}
                  title="Chưa nhận event trong khoảng này"
                  description="Khi app gọi Event API, biểu đồ sẽ hiển thị số event server nhận theo từng ngày."
                  className="min-h-[21rem]"
                />
              )}
            </CardContent>
          </Card>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.65fr)]">
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Danh mục event</CardTitle>
                <CardDescription>
                  Chọn một dòng để mở dashboard riêng cho event đó.
                </CardDescription>
                <CardAction>
                  <div className="relative w-56 max-w-full">
                    <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Tìm event…"
                      className="pl-8"
                    />
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Event name</TableHead>
                        <TableHead className="text-right">
                          Event count
                        </TableHead>
                        <TableHead className="text-right">Users</TableHead>
                        <TableHead className="text-right">Per user</TableHead>
                        <TableHead className="pr-4 text-right">
                          Completed
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCatalog.length ? (
                        filteredCatalog.map((row) => {
                          const perUser = row.uniqueUsers
                            ? row.eventCount / row.uniqueUsers
                            : 0;
                          const completed = row.eventCount
                            ? (row.completedCount / row.eventCount) * 100
                            : 0;
                          return (
                            <TableRow
                              key={row.eventName}
                              data-state={
                                selectedEvent === row.eventName
                                  ? "selected"
                                  : undefined
                              }
                              className="cursor-pointer"
                              tabIndex={0}
                              onClick={() => setSelectedEvent(row.eventName)}
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  event.preventDefault();
                                  setSelectedEvent(row.eventName);
                                }
                              }}
                            >
                              <TableCell className="pl-4">
                                <div className="flex items-center gap-2 font-mono text-xs font-semibold text-blue-700">
                                  {row.eventName} <ArrowUpRight size={13} />
                                </div>
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  Cuối {dateTime(row.lastReceivedAt)}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs tabular-nums">
                                {row.eventCount.toLocaleString("vi-VN")}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs tabular-nums">
                                {row.uniqueUsers.toLocaleString("vi-VN")}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs tabular-nums">
                                {perUser.toFixed(2)}
                              </TableCell>
                              <TableCell className="pr-4 text-right font-mono text-xs tabular-nums">
                                {percent(completed)}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="p-0">
                            <EmptyPanel
                              icon={Inbox}
                              title="Không có event phù hợp"
                              description={
                                search
                                  ? "Thử tên event khác."
                                  : "App chưa gửi event trong khoảng thời gian đã chọn."
                              }
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Trạng thái pipeline</CardTitle>
                  <CardDescription>
                    Từ ingest đến worker completion.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.statusBreakdown.length ? (
                    data.statusBreakdown.map((row) => (
                      <div
                        key={row.status}
                        className="flex items-center justify-between gap-3"
                      >
                        <StatusBadge status={row.status} />
                        <span className="font-mono text-sm font-semibold tabular-nums">
                          {row.count.toLocaleString("vi-VN")}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {percent(
                              statusTotal ? (row.count / statusTotal) * 100 : 0,
                            )}
                          </span>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="py-5 text-sm text-muted-foreground">
                      Chưa có trạng thái để thống kê.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Delivery health</CardTitle>
                  <CardDescription>
                    Đích giao sau khi event name đã được accept vào catalog.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DestinationSummary rows={data.destinationBreakdown} />
                </CardContent>
              </Card>
            </div>
          </section>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Event stream gần đây</CardTitle>
              <CardDescription>
                50 event mới nhất trong bộ lọc hiện tại. Mở payload để kiểm tra
                metadata và delivery.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead className="pr-4 text-right">Payload</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentEvents.length ? (
                      data.recentEvents.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="pl-4">
                            <div className="font-mono text-xs font-semibold">
                              {event.eventName}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              {selectedApp.platform === "ios" ? (
                                <Apple size={12} />
                              ) : (
                                <Smartphone size={12} />
                              )}
                              {event.kind}
                              {event.isReturningOpen ? (
                                <Badge
                                  variant="outline"
                                  className="ml-1 border-blue-200 bg-blue-50 text-[10px] text-blue-700"
                                >
                                  Returning open
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={event.status} />
                          </TableCell>
                          <TableCell className="max-w-44 truncate font-mono text-xs">
                            {event.userId || "anonymous"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {event.deliveries.length ? (
                                event.deliveries.map((delivery) => (
                                  <Badge
                                    key={delivery.destination}
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    {destinationLabel(delivery.destination)} ·{" "}
                                    {delivery.status}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Chưa giao
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {dateTime(event.createdAt)}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setInspectedEvent(event)}
                            >
                              <Eye /> Xem
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <EmptyPanel
                            icon={Clock3}
                            title="Chưa có event gần đây"
                            description="Event mới sẽ xuất hiện ở đây ngay sau khi Event API nhận request."
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Sheet
        open={Boolean(inspectedEvent)}
        onOpenChange={(open) => {
          if (!open) setInspectedEvent(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {inspectedEvent ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base">
                  {inspectedEvent.eventName}
                </SheetTitle>
                <SheetDescription>
                  Event ID {inspectedEvent.id}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <span className="block text-xs text-muted-foreground">
                      Status
                    </span>
                    <span className="mt-1 block">
                      <StatusBadge status={inspectedEvent.status} />
                    </span>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <span className="block text-xs text-muted-foreground">
                      Attempts
                    </span>
                    <strong className="mt-1 block font-mono tabular-nums">
                      {inspectedEvent.attemptCount}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <span className="block text-xs text-muted-foreground">
                      Occurred
                    </span>
                    <span className="mt-1 block text-xs">
                      {dateTime(inspectedEvent.occurredAt)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <span className="block text-xs text-muted-foreground">
                      Received
                    </span>
                    <span className="mt-1 block text-xs">
                      {dateTime(inspectedEvent.createdAt)}
                    </span>
                  </div>
                </div>
                <section>
                  <h3 className="text-sm font-semibold">Metadata</h3>
                  <pre className="mt-2 max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-5">
                    {safeJson(inspectedEvent.metadata)}
                  </pre>
                </section>
                <section>
                  <h3 className="text-sm font-semibold">Deliveries</h3>
                  <div className="mt-2 space-y-2">
                    {inspectedEvent.deliveries.length ? (
                      inspectedEvent.deliveries.map((delivery) => (
                        <div
                          key={delivery.destination}
                          className="rounded-lg border p-3 text-xs"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <strong>
                              {destinationLabel(delivery.destination)}
                            </strong>
                            <StatusBadge status={delivery.status} />
                          </div>
                          <div className="mt-2 text-muted-foreground">
                            HTTP {delivery.responseCode ?? "—"} ·{" "}
                            {delivery.attemptCount} attempt ·{" "}
                            {dateTime(delivery.deliveredAt)}
                          </div>
                          {delivery.lastError ? (
                            <p className="mt-2 break-words text-rose-600">
                              {delivery.lastError}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Event chưa đi qua worker delivery.
                      </p>
                    )}
                  </div>
                </section>
                {inspectedEvent.lastError ? (
                  <Alert variant="destructive">
                    <Activity />
                    <AlertTitle>Last error</AlertTitle>
                    <AlertDescription className="break-words">
                      {inspectedEvent.lastError}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
