import "server-only";

import type { ConsoleSession } from "@/lib/auth/rbac";
import { getConsoleSession } from "@/lib/auth/session";
import { forbidden } from "@/lib/server/api/errors";
import type { StaffRole } from "@/lib/tracking/types";

export async function requireAdminSession(): Promise<ConsoleSession> {
  const session = await getConsoleSession();

  if (!session || session.role !== "Admin") {
    throw forbidden("Admin role is required.");
  }

  return session;
}

export async function requireConsoleApiSession(
  allowedRoles: StaffRole[],
): Promise<ConsoleSession> {
  const session = await getConsoleSession();

  if (!session || !allowedRoles.includes(session.role)) {
    throw forbidden(`${allowedRoles.join(" or ")} role is required.`);
  }

  return session;
}
