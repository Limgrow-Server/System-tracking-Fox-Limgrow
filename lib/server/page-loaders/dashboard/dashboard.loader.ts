import "server-only";

import { fetchSystemTrackingApi } from "@/lib/server-api";
import type {
  IapAppCard,
  IapTrialConversionAnalytics,
} from "@/lib/tracking/page-data";

export type DashboardPendingEventDefinition = {
  appId: string;
  eventName: string;
  lastReceivedAt: string;
  kind: "purchase" | "user";
  pendingCount: number;
  platform: "android" | "ios";
};

export type DashboardPageData = {
  analytics: IapTrialConversionAnalytics | null;
  appCount: number;
  errors: string[];
  fetchedAt: string;
  pendingEventCount: number;
  pendingEventPayloadCount: number;
  recentPendingEvents: DashboardPendingEventDefinition[];
  systemStatus: "ready" | "unavailable";
};

type AppsPayload = {
  data?: IapAppCard[];
  error?: string;
  success?: boolean;
  total?: number;
};

type PendingEventsPayload = DashboardPendingEventDefinition[] & {
  message?: string;
};

type ConversionPayload = {
  analytics?: IapTrialConversionAnalytics | null;
  error?: string;
  success?: boolean;
};

async function responseJson<T>(path: string): Promise<T> {
  const response = await fetchSystemTrackingApi(path, {
    signal: AbortSignal.timeout(8_000),
  });
  const payload = (await response.json()) as T & {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Request failed (${response.status}).`);
  }

  return payload;
}

function failureMessage(label: string, result: PromiseSettledResult<unknown>) {
  if (result.status === "fulfilled") return null;
  const detail = result.reason instanceof Error ? result.reason.message : "Unknown error";
  return `${label}: ${detail}`;
}

export async function getDashboardPageData(): Promise<DashboardPageData> {
  const [healthResult, appsResult, eventsResult, conversionResult] =
    await Promise.allSettled([
      responseJson<{ ok?: boolean; status?: string }>("/health/ready"),
      responseJson<AppsPayload>("/api/admin/iap/apps?page=1&pageSize=4"),
      responseJson<PendingEventsPayload>(
        "/api/admin/event-definitions/pending?limit=100",
      ),
      responseJson<ConversionPayload>("/api/admin/iap/trial-conversion-overview"),
    ]);

  const health = healthResult.status === "fulfilled" ? healthResult.value : null;
  const apps = appsResult.status === "fulfilled" ? appsResult.value : null;
  const events = eventsResult.status === "fulfilled" ? eventsResult.value : null;
  const conversion =
    conversionResult.status === "fulfilled" ? conversionResult.value : null;
  const pendingEvents = Array.isArray(events) ? events : [];
  const errors = [
    failureMessage("System health", healthResult),
    failureMessage("IAP applications", appsResult),
    failureMessage("Pending events", eventsResult),
    failureMessage("Trial conversion", conversionResult),
  ].filter((message): message is string => Boolean(message));

  if (apps && apps.success === false) errors.push(apps.error ?? "IAP applications are unavailable.");
  if (conversion && conversion.success === false) {
    errors.push(conversion.error ?? "Trial conversion is unavailable.");
  }

  return {
    analytics: conversion?.success === false ? null : conversion?.analytics ?? null,
    appCount: apps?.success === false ? 0 : apps?.total ?? apps?.data?.length ?? 0,
    errors: Array.from(new Set(errors)),
    fetchedAt: new Date().toISOString(),
    pendingEventCount: pendingEvents.length,
    pendingEventPayloadCount: pendingEvents.reduce(
      (total, event) => total + event.pendingCount,
      0,
    ),
    recentPendingEvents: pendingEvents.slice(0, 5),
    systemStatus:
      health?.ok && health.status === "ready" ? "ready" : "unavailable",
  };
}
