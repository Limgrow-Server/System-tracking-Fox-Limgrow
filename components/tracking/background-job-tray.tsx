"use client";

import {
  Activity,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripHorizontal,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { subscribeBackgroundJobs } from "@/lib/client/background-jobs";
import { showToast } from "@/lib/client/toast";
import { cn } from "@/lib/utils";
import type { BackgroundJob } from "@/lib/tracking/types";

type BackgroundJobsResponse = {
  activeCount?: number;
  data?: BackgroundJob[];
  error?: string;
  ok?: boolean;
  total?: number;
  updatedAt?: string;
};

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const FINAL_STATUSES = new Set(["succeeded", "failed", "partial"]);
const TRAY_MARGIN = 16;
const TRAY_POSITION_STORAGE_KEY = "tracking-background-job-tray-position";

type TrayPosition = {
  x: number;
  y: number;
};

type TrayDragState = {
  originX: number;
  originY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

function isTrayPosition(value: unknown): value is TrayPosition {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as TrayPosition).x === "number" &&
    typeof (value as TrayPosition).y === "number" &&
    Number.isFinite((value as TrayPosition).x) &&
    Number.isFinite((value as TrayPosition).y)
  );
}

function readStoredTrayPosition() {
  if (typeof window === "undefined") return null;

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(TRAY_POSITION_STORAGE_KEY) ?? "null",
    );
    return isTrayPosition(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persistTrayPosition(position: TrayPosition | null) {
  if (typeof window === "undefined") return;

  if (!position) {
    window.localStorage.removeItem(TRAY_POSITION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    TRAY_POSITION_STORAGE_KEY,
    JSON.stringify(position),
  );
}

function clampTrayPosition(
  position: TrayPosition,
  element: HTMLDivElement | null,
) {
  if (typeof window === "undefined") return position;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const fallbackWidth = Math.max(0, Math.min(384, viewportWidth - TRAY_MARGIN * 2));
  const width = element?.offsetWidth ?? fallbackWidth;
  const height = element?.offsetHeight ?? 48;
  const maxX = Math.max(TRAY_MARGIN, viewportWidth - width - TRAY_MARGIN);
  const maxY = Math.max(TRAY_MARGIN, viewportHeight - height - TRAY_MARGIN);

  return {
    x: Math.min(Math.max(position.x, TRAY_MARGIN), maxX),
    y: Math.min(Math.max(position.y, TRAY_MARGIN), maxY),
  };
}

function statusLabel(status: BackgroundJob["status"]) {
  switch (status) {
    case "failed":
      return "Failed";
    case "partial":
      return "Partial";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "succeeded":
      return "Done";
    default:
      return status;
  }
}

function statusTone(status: BackgroundJob["status"]) {
  if (status === "succeeded") return "text-emerald-700";
  if (status === "failed") return "text-rose-700";
  if (status === "partial") return "text-amber-700";
  return "text-sky-700";
}

function progressPercent(job: BackgroundJob) {
  if (!job.progress_total) return null;
  return Math.min(
    100,
    Math.round((job.progress_current / Math.max(job.progress_total, 1)) * 100),
  );
}

function progressText(job: BackgroundJob) {
  if (!job.progress_total) {
    return job.status === "queued" ? "Preparing" : "Processing";
  }

  return `${job.progress_current}/${job.progress_total}`;
}

function finalToastType(status: BackgroundJob["status"]) {
  if (status === "failed") return "error";
  if (status === "partial") return "warning";
  return "success";
}

function finalToastMessage(job: BackgroundJob) {
  if (job.status === "failed") {
    return `${job.title} failed.`;
  }
  if (job.status === "partial") {
    return `${job.title} finished with issues.`;
  }

  return `${job.title} completed.`;
}

function jobSignature(job: BackgroundJob) {
  return [
    job.id,
    job.status,
    job.progress_current,
    job.progress_total ?? "",
    job.result_url ?? "",
    job.updated_at,
    job.last_error ?? "",
  ].join(":");
}

function jobsSignature(jobs: BackgroundJob[]) {
  return jobs.map(jobSignature).join("|");
}

function BackgroundJobTypeIcon({ type }: { type: BackgroundJob["type"] }) {
  return type === "review_fetch" ? (
    <MessageSquareText size={15} />
  ) : (
    <Send size={15} />
  );
}

function BackgroundJobStatusIcon({
  active,
  status,
}: {
  active: boolean;
  status: BackgroundJob["status"];
}) {
  const className = cn(active && "animate-spin");

  if (status === "succeeded") {
    return <CheckCircle2 size={11} className={className} />;
  }
  if (status === "failed" || status === "partial") {
    return <TriangleAlert size={11} className={className} />;
  }

  return <Loader2 size={11} className={className} />;
}

function BackgroundJobRow({
  job,
  onOpen,
}: {
  job: BackgroundJob;
  onOpen: (job: BackgroundJob) => void;
}) {
  const percent = progressPercent(job);
  const isActive = ACTIVE_STATUSES.has(job.status);
  const canOpen = Boolean(job.result_url) && FINAL_STATUSES.has(job.status);

  const content = (
    <>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
          <BackgroundJobTypeIcon type={job.type} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{job.title}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {job.store_account_name || job.description || job.platform || "System"}
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1">
              <Badge
                variant="outline"
                className={cn("h-5 rounded-md px-1.5 text-[11px]", statusTone(job.status))}
              >
                <BackgroundJobStatusIcon active={isActive} status={job.status} />
                {statusLabel(job.status)}
              </Badge>
              {canOpen ? (
                <ChevronRight size={15} className="text-muted-foreground" />
              ) : null}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              {percent === null ? (
                <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-500/70" />
              ) : (
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    job.status === "failed"
                      ? "bg-rose-500"
                      : job.status === "partial"
                        ? "bg-amber-500"
                        : "bg-emerald-500",
                  )}
                  style={{ width: `${percent}%` }}
                />
              )}
            </div>
            <div className="w-14 text-right text-[11px] text-muted-foreground">
              {progressText(job)}
            </div>
          </div>
          {job.last_error ? (
            <div className="mt-2 line-clamp-2 text-xs text-rose-700">
              {job.last_error}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );

  if (canOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(job)}
        className="block w-full border-b px-3 py-3 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 last:border-b-0"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="border-b px-3 py-3 last:border-b-0">
      {content}
    </div>
  );
}

export function BackgroundJobTray() {
  const router = useRouter();
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [trayPosition, setTrayPosition] = useState<TrayPosition | null>(null);
  const dragStateRef = useRef<TrayDragState | null>(null);
  const hydratedRef = useRef(false);
  const jobsSignatureRef = useRef("");
  const latestTrayPositionRef = useRef<TrayPosition | null>(null);
  const statusRef = useRef<Map<string, BackgroundJob["status"]>>(new Map());
  const trayRef = useRef<HTMLDivElement | null>(null);

  const hasJobs = jobs.length > 0;
  const pollingMs = activeCount > 0 ? 1500 : 10000;
  const visibleJobs = useMemo(() => jobs.slice(0, 8), [jobs]);

  useEffect(() => {
    const storedPosition = readStoredTrayPosition();
    if (!storedPosition) return;

    const nextPosition = clampTrayPosition(storedPosition, trayRef.current);
    latestTrayPositionRef.current = nextPosition;
    setTrayPosition(nextPosition);
  }, []);

  useEffect(() => {
    if (!trayPosition) return;

    const onResize = () => {
      setTrayPosition((current) => {
        if (!current) return current;

        const nextPosition = clampTrayPosition(current, trayRef.current);
        latestTrayPositionRef.current = nextPosition;
        persistTrayPosition(nextPosition);
        return nextPosition.x === current.x && nextPosition.y === current.y
          ? current
          : nextPosition;
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [trayPosition]);

  useEffect(() => {
    if (!trayPosition) return;

    setTrayPosition((current) => {
      if (!current) return current;

      const nextPosition = clampTrayPosition(current, trayRef.current);
      latestTrayPositionRef.current = nextPosition;
      persistTrayPosition(nextPosition);
      return nextPosition.x === current.x && nextPosition.y === current.y
        ? current
        : nextPosition;
    });
  }, [open, trayPosition, visibleJobs.length]);

  const updateJobs = useCallback((nextJobs: BackgroundJob[]) => {
    statusRef.current = new Map(nextJobs.map((job) => [job.id, job.status]));
    const nextActiveCount = nextJobs.filter((job) =>
      ACTIVE_STATUSES.has(job.status),
    ).length;
    const nextSignature = jobsSignature(nextJobs);
    setActiveCount((current) =>
      current === nextActiveCount ? current : nextActiveCount,
    );
    if (jobsSignatureRef.current === nextSignature) return;
    jobsSignatureRef.current = nextSignature;
    setJobs(nextJobs);
  }, []);

  const prependJob = useCallback(
    (job: BackgroundJob) => {
      setHidden(false);
      setOpen(true);
      setJobs((current) => {
        const nextJobs = [
          job,
          ...current.filter((currentJob) => currentJob.id !== job.id),
        ].slice(0, 30);
        statusRef.current = new Map(
          nextJobs.map((nextJob) => [nextJob.id, nextJob.status]),
        );
        jobsSignatureRef.current = jobsSignature(nextJobs);
        setActiveCount(
          nextJobs.filter((nextJob) => ACTIVE_STATUSES.has(nextJob.status))
            .length,
        );
        return nextJobs;
      });
      hydratedRef.current = true;
      setRefreshVersion((current) => current + 1);
    },
    [],
  );

  const openJobResult = useCallback(
    (job: BackgroundJob) => {
      if (!job.result_url || !FINAL_STATUSES.has(job.status)) return;
      setOpen(false);
      router.push(job.result_url);
    },
    [router],
  );

  const moveTray = useCallback((position: TrayPosition) => {
    const nextPosition = clampTrayPosition(position, trayRef.current);
    latestTrayPositionRef.current = nextPosition;
    setTrayPosition(nextPosition);
  }, []);

  const resetTrayPosition = useCallback(() => {
    dragStateRef.current = null;
    latestTrayPositionRef.current = null;
    persistTrayPosition(null);
    setDragging(false);
    setTrayPosition(null);
  }, []);

  const hideTray = useCallback(() => {
    dragStateRef.current = null;
    setDragging(false);
    setHidden(true);
    setOpen(false);
  }, []);

  const startTrayDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;

      const rect = trayRef.current?.getBoundingClientRect();
      if (!rect) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        originX: rect.left,
        originY: rect.top,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      setDragging(true);
      moveTray({ x: rect.left, y: rect.top });
    },
    [moveTray],
  );

  const dragTray = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      event.preventDefault();
      moveTray({
        x: dragState.originX + event.clientX - dragState.startX,
        y: dragState.originY + event.clientY - dragState.startY,
      });
    },
    [moveTray],
  );

  const stopTrayDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      dragStateRef.current = null;
      setDragging(false);
      persistTrayPosition(latestTrayPositionRef.current);
    },
    [],
  );

  useEffect(() => subscribeBackgroundJobs(prependJob), [prependJob]);

  useEffect(() => {
    const onFocus = () => setRefreshVersion((current) => current + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    async function loadJobs() {
      if (!hydratedRef.current) setLoading(true);
      try {
        const response = await fetch("/api/admin/background-jobs", {
          cache: "no-store",
        });
        const payload = (await response.json()) as BackgroundJobsResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Background jobs could not be loaded.");
        }

        if (cancelled) return;

        const nextJobs = payload.data ?? [];
        const previousStatuses = statusRef.current;

        if (hydratedRef.current) {
          for (const job of nextJobs) {
            const previousStatus = previousStatuses.get(job.id);
            if (
              previousStatus &&
              ACTIVE_STATUSES.has(previousStatus) &&
              FINAL_STATUSES.has(job.status)
            ) {
              void showToast(finalToastType(job.status), finalToastMessage(job));
            }
          }
        }

        hydratedRef.current = true;
        updateJobs(nextJobs);
      } catch {
        if (!cancelled) {
          setJobs((current) => current);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          timeoutId = window.setTimeout(loadJobs, pollingMs);
        }
      }
    }

    void loadJobs();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [pollingMs, refreshVersion, updateJobs]);

  if (hidden || (!hasJobs && !loading)) return null;

  return (
    <div
      ref={trayRef}
      className={cn(
        "fixed z-50 w-[calc(100vw-2rem)] max-w-sm",
        !trayPosition && "bottom-4 right-4",
      )}
      style={
        trayPosition
          ? { left: `${trayPosition.x}px`, top: `${trayPosition.y}px` }
          : undefined
      }
    >
      <div className="overflow-hidden rounded-lg border bg-background shadow-lg">
        <div className="flex h-12 w-full items-center gap-1 px-3">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                {activeCount > 0 ? (
                  <Activity size={15} className="animate-pulse text-sky-700" />
                ) : (
                  <Bell size={15} />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  Background jobs
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {activeCount > 0
                    ? `${activeCount} running`
                    : `${jobs.length} recent`}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-2">
              {activeCount > 0 ? (
                <Badge className="h-5 rounded-md px-1.5 text-[11px]">
                  {activeCount}
                </Badge>
              ) : null}
              <Button
                asChild
                variant="ghost"
                size="icon-sm"
                tabIndex={-1}
                className="pointer-events-none"
              >
                <span>{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</span>
              </Button>
            </span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move background jobs panel"
            title="Move panel"
            onPointerDown={startTrayDrag}
            onPointerMove={dragTray}
            onPointerUp={stopTrayDrag}
            onPointerCancel={stopTrayDrag}
            className={cn("cursor-grab touch-none", dragging && "cursor-grabbing")}
          >
            <GripHorizontal size={15} />
          </Button>
          {trayPosition ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Reset background jobs panel position"
              title="Reset position"
              onClick={resetTrayPosition}
            >
              <RotateCcw size={14} />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Hide background jobs panel"
            title="Hide panel"
            onClick={hideTray}
          >
            <X size={14} />
          </Button>
        </div>
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="max-h-80 overflow-hidden">
            <div className="max-h-80 overflow-y-auto border-t">
              {visibleJobs.length ? (
                visibleJobs.map((job) => (
                  <BackgroundJobRow
                    key={job.id}
                    job={job}
                    onOpen={openJobResult}
                  />
                ))
              ) : (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No background jobs
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
