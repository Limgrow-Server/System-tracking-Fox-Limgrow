import {
  AlertCircle,
  Apple,
  CheckCircle2,
  Circle,
  Globe2,
  LucideIcon,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { platformLabel, toNumber } from "@/lib/tracking/format";
import type { NumberLike, Platform } from "@/lib/tracking/types";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  trend,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "flat";
}) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className="flex size-9 items-center justify-center rounded-lg border bg-muted/40">
          <Icon size={17} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-heading text-2xl font-semibold tracking-tight">{value}</div>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {trend === "up" ? <TrendingUp className="text-emerald-600" size={14} /> : null}
          {trend === "down" ? <TrendingDown className="text-rose-600" size={14} /> : null}
          {trend === "flat" ? <Circle size={9} /> : null}
          <span>{detail}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function PlatformBadge({ platform }: { platform: Platform | string | null }) {
  const isGoogle = platform === "google_play";
  return (
    <Badge variant="outline" className={cn(isGoogle ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-zinc-50 text-zinc-700")}>
      {isGoogle ? <Globe2 size={12} /> : <Apple size={12} />}
      {platformLabel(platform)}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const normalized = status ?? "unknown";
  const labelOverride: Record<string, string> = {
    partial_failed: "Sent",
    sent_with_issues: "Sent",
  };
  const label = labelOverride[normalized] ?? normalized
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const tone =
    ["active", "passed", "sent", "delivered", "healthy", "purchased", "renewed", "served", "published", "approved", "fresh", "succeeded"].includes(normalized)
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : ["pending", "received", "sending", "grace_period", "warning", "draft", "pending_approval", "paused", "stale", "partial_failed", "sent_with_issues"].includes(normalized)
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : ["failed", "invalid", "expired", "refunded", "revoked", "critical", "blocked", "not_found", "unregistered"].includes(normalized)
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-border bg-muted text-muted-foreground";

  return (
    <Badge variant="outline" className={tone}>
      {label}
    </Badge>
  );
}

export function DataSourceBanner({
  connected,
  error,
  fetchedAt,
}: {
  connected: boolean;
  error: string | null;
  fetchedAt: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm md:flex-row md:items-center md:justify-between",
        connected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
      )}
    >
      <div className="flex items-start gap-2">
        {connected ? <CheckCircle2 className="mt-0.5 shrink-0" size={16} /> : <AlertCircle className="mt-0.5 shrink-0" size={16} />}
        <div>
          <div className="font-medium">{connected ? "Connected to Supabase dashboard views" : "Using fallback data"}</div>
          <div className="text-xs opacity-80">{error ?? "Secret values are never loaded into the browser."}</div>
        </div>
      </div>
      <div className="text-xs opacity-80">Fetched {new Date(fetchedAt).toLocaleString("vi-VN")}</div>
    </div>
  );
}

export function EmptyPanel({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <Empty className={cn("min-h-40 rounded-none border-0", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function TableEmptyState({
  colSpan,
  icon,
  title,
  description,
}: {
  colSpan: number;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="p-0">
        <EmptyPanel icon={icon} title={title} description={description} />
      </TableCell>
    </TableRow>
  );
}

export function TablePaginationFooter({
  from,
  loadingPage,
  onPageChange,
  page,
  shown,
  to,
  total,
  totalPages,
}: {
  from?: number;
  loadingPage?: number | null;
  onPageChange?: (page: number) => void;
  page?: number;
  shown: number;
  to?: number;
  total: number;
  totalPages?: number;
}) {
  if (!total) return null;

  const currentPage = page ?? 1;
  const lastPage = Math.max(totalPages ?? 1, 1);
  const pendingPage = typeof loadingPage === "number" ? loadingPage : null;
  const previousPage = currentPage - 1;
  const nextPage = currentPage + 1;
  const previousLoading = pendingPage === previousPage;
  const nextLoading = pendingPage === nextPage;
  const canGoPrevious = Boolean(onPageChange && currentPage > 1 && !pendingPage);
  const canGoNext = Boolean(onPageChange && currentPage < lastPage && !pendingPage);
  const rangeLabel = from && to ? `Showing ${from}-${to} of ${total}` : `Showing ${shown} of ${total}`;

  function goPrevious(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (canGoPrevious) onPageChange?.(currentPage - 1);
  }

  function goNext(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (canGoNext) onPageChange?.(currentPage + 1);
  }

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>{rangeLabel}</span>
      <Pagination className="mx-0 w-auto justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              loading={previousLoading}
              text="Prev"
              className={cn(
                !canGoPrevious && !previousLoading && "pointer-events-none opacity-50",
                previousLoading && "pointer-events-none"
              )}
              onClick={goPrevious}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink
              href="#"
              isActive
              size="default"
              className="min-w-24 px-3"
              onClick={(event) => event.preventDefault()}
            >
              {currentPage} / {lastPage}
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              loading={nextLoading}
              text="Next"
              className={cn(
                !canGoNext && !nextLoading && "pointer-events-none opacity-50",
                nextLoading && "pointer-events-none"
              )}
              onClick={goNext}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

export function RatioBar({
  left,
  right,
  leftLabel,
  rightLabel,
}: {
  left: NumberLike;
  right: NumberLike;
  leftLabel: string;
  rightLabel: string;
}) {
  const leftValue = toNumber(left);
  const rightValue = toNumber(right);
  const total = Math.max(leftValue + rightValue, 1);
  const leftWidth = Math.round((leftValue / total) * 100);

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-md bg-muted">
        <div className="bg-emerald-500" style={{ width: `${leftWidth}%` }} />
        <div className="bg-zinc-800" style={{ width: `${100 - leftWidth}%` }} />
      </div>
    </div>
  );
}
