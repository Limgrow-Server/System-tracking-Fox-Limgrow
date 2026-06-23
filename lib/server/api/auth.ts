import "server-only";

import type { ConsoleSession } from "@/lib/auth/rbac";
import { getConsoleSession } from "@/lib/auth/session";
import { forbidden } from "@/lib/server/api/errors";

export async function requireAdminSession(): Promise<ConsoleSession> {
  const session = await getConsoleSession();

  if (!session || session.role !== "Admin") {
    throw forbidden("Admin role is required.");
  }

  return session;
}

