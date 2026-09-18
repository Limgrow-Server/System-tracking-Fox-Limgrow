"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Apple,
  ArrowUpRight,
  BarChart3,
  Search,
  Smartphone,
} from "lucide-react";

import { PageHeader, StatusBadge, TablePaginationFooter } from "@/components/tracking/primitives";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppConfigOption } from "@/lib/tracking/app-config";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

function PlatformBadge({ platform }: { platform: AppConfigOption["platform"] }) {
  return platform === "ios" ? (
    <Badge
      variant="outline"
      className="gap-1.5 border-zinc-200 bg-zinc-50 text-zinc-700"
    >
      <Apple size={14} />
      iOS
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      <Smartphone size={14} />
      Android
    </Badge>
  );
}

export function EventAnalyticsAppGridPage({
  apps,
}: {
  apps: AppConfigOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingMappingId, setPendingMappingId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"all" | "android" | "ios">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filteredApps = useMemo(() => {
    const search = query.trim().toLowerCase();
    return apps.filter((app) => {
      if (platform !== "all" && app.platform !== platform) return false;
      if (!search) return true;
      return `${app.appName} ${app.appId}`.toLowerCase().includes(search);
    });
  }, [apps, platform, query]);
  const totalPages = Math.max(1, Math.ceil(filteredApps.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleApps = filteredApps.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const startIndex = (safePage - 1) * PAGE_SIZE;

  function href(app: AppConfigOption) {
    return `/analytics/events/${encodeURIComponent(app.mappingId)}?platform=${app.platform}`;
  }

  function openApp(app: AppConfigOption) {
    setPendingMappingId(app.mappingId);
    startTransition(() => router.push(href(app)));
  }

  return (
    <main className="flex h-full flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Event tracking"
        title="Event analytics"
        description="Chọn một ứng dụng để xem event, returning-user retention và trạng thái delivery của riêng app đó."
      />

      <section aria-label="Bộ lọc ứng dụng" className="flex flex-col gap-3 sm:flex-row">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên hoặc Bundle ID…"
            className="pl-8"
          />
        </div>
        <Select
          value={platform}
          onValueChange={(value) => {
            setPlatform(value as "all" | "android" | "ios");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nền tảng</SelectItem>
            <SelectItem value="ios">iOS</SelectItem>
            <SelectItem value="android">Android</SelectItem>
          </SelectContent>
        </Select>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card" aria-label="Danh sách ứng dụng">
        <div className="overflow-x-auto">
          <Table className="min-w-[56rem]">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Ứng dụng</TableHead>
                <TableHead>Nền tảng</TableHead>
                <TableHead>Định danh gửi từ mobile</TableHead>
                <TableHead>Mapping</TableHead>
                <TableHead className="text-right">Dashboard</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleApps.map((app) => {
                const rowPending = isPending && pendingMappingId === app.mappingId;
                return (
                  <TableRow
                    key={app.key}
                    aria-busy={rowPending}
                    role="link"
                    tabIndex={0}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                      rowPending && "pointer-events-none bg-muted/30",
                    )}
                    onClick={() => openApp(app)}
                    onFocus={() => router.prefetch(href(app))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openApp(app);
                      }
                    }}
                    onMouseEnter={() => router.prefetch(href(app))}
                  >
                    <TableCell>
                      <div className="flex min-w-[17rem] items-center gap-3">
                        <Avatar className="size-10 rounded-lg border bg-background">
                          {app.iconUrl ? (
                            <AvatarImage
                              src={app.iconUrl}
                              alt={app.appName}
                              className="rounded-lg"
                            />
                          ) : null}
                          <AvatarFallback className="rounded-lg text-xs font-semibold">
                            {app.appName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{app.appName}</span>
                            {rowPending ? <Spinner /> : null}
                          </div>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Event tracking
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PlatformBadge platform={app.platform} />
                    </TableCell>
                    <TableCell className="max-w-72 truncate font-mono text-xs">
                      {app.appId}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                        <BarChart3 size={15} /> Xem <ArrowUpRight size={14} />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!visibleApps.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-14 text-center">
                    <div className="mx-auto max-w-sm">
                      <p className="font-medium">Không tìm thấy ứng dụng</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Thử đổi từ khóa hoặc bộ lọc nền tảng.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>

      <TablePaginationFooter
        from={visibleApps.length ? startIndex + 1 : 0}
        loadingPage={null}
        onPageChange={setPage}
        page={safePage}
        shown={visibleApps.length}
        to={startIndex + visibleApps.length}
        total={filteredApps.length}
        totalPages={totalPages}
      />
    </main>
  );
}
