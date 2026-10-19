"use client";

import type { BackgroundJob } from "@/lib/tracking/types";

export const BACKGROUND_JOB_EVENT = "tracking:background-job";
const BACKGROUND_JOB_CHANNEL = "tracking-background-jobs";

function isBackgroundJob(value: unknown): value is BackgroundJob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as BackgroundJob).id === "string" &&
    typeof (value as BackgroundJob).title === "string"
  );
}

export function announceBackgroundJob(job: unknown) {
  if (!isBackgroundJob(job) || typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<BackgroundJob>(BACKGROUND_JOB_EVENT, { detail: job }),
  );

  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(BACKGROUND_JOB_CHANNEL);
    channel.postMessage(job);
    channel.close();
  }
}

export function subscribeBackgroundJobs(
  onJob: (job: BackgroundJob) => void,
) {
  if (typeof window === "undefined") return () => {};

  const onEvent = (event: Event) => {
    const job = (event as CustomEvent<BackgroundJob>).detail;
    if (isBackgroundJob(job)) onJob(job);
  };
  const channel =
    "BroadcastChannel" in window
      ? new BroadcastChannel(BACKGROUND_JOB_CHANNEL)
      : null;

  window.addEventListener(BACKGROUND_JOB_EVENT, onEvent);
  channel?.addEventListener("message", (event) => {
    if (isBackgroundJob(event.data)) onJob(event.data);
  });

  return () => {
    window.removeEventListener(BACKGROUND_JOB_EVENT, onEvent);
    channel?.close();
  };
}
