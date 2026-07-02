"use client";

import {
  Activity,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  MessageSquareText,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const hydratedRef = useRef(false);
  const jobsSignatureRef = useRef("");
  const statusRef = useRef<Map<string, BackgroundJob["status"]>>(new Map());

  const hasJobs = jobs.length > 0;
  const pollingMs = activeCount > 0 ? 1500 : 10000;
  const visibleJobs = useMemo(() => jobs.slice(0, 8), [jobs]);

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

  if (!hasJobs && !loading) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm">
      <div className="overflow-hidden rounded-lg border bg-background shadow-lg">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex h-12 w-full items-center justify-between gap-3 px-3 text-left"
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
