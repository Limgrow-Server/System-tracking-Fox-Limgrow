import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  canAccessPath,
  type ConsoleSession,
  isStaffRole,
} from "@/lib/auth/rbac";
import type { StaffRole } from "@/lib/tracking/types";

function apiBaseUrl() {
  return (
    process.env.SYSTEM_TRACKING_API_URL
    || process.env.SYSTEM_TRACKING_FUNCTIONS_BASE_URL
    || `http://127.0.0.1:${process.env.SYSTEM_TRACKING_API_PORT || "2156"}`
  ).replace(/\/+$/, "");
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function consoleSession(value: unknown): ConsoleSession | null {
  if (!value || typeof value !== "object") return null;
  const session = value as Partial<ConsoleSession>;

  if (
    typeof session.authUserId !== "string"
    || typeof session.memberId !== "string"
    || typeof session.email !== "string"
    || typeof session.name !== "string"
    || !isStaffRole(session.role)
    || session.status !== "active"
    || typeof session.globalAccess !== "boolean"
    || !stringArray(session.appScope)
    || !stringArray(session.storeScope)
  ) {
    return null;
  }

  return session as ConsoleSession;
}

async function resolveConsoleSession(): Promise<ConsoleSession | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;

  try {
    const response = await fetch(`${apiBaseUrl()}/api/auth/session`, {
      cache: "no-store",
      headers: { cookie: cookieHeader },
    });

    if (!response.ok) return null;

    const payload = await response.json() as { session?: unknown };
    return consoleSession(payload.session);
  } catch (error) {
    console.error("Console session API request failed", error);
    return null;
  }
}

export const getConsoleSession = cache(resolveConsoleSession);

export async function requireConsoleSession(allowedRoles?: StaffRole[]) {
  const session = await getConsoleSession();

  if (!session) {
    redirect("/login");
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    redirect("/dashboard?access=denied");
  }

  return session;
}

export async function requireRouteAccess(pathname: string) {
  const session = await requireConsoleSession();

  if (!canAccessPath(session.role, pathname)) {
    redirect("/dashboard?access=denied");
  }

  return session;
}
