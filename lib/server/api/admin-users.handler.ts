import "server-only";

import { isStaffRole } from "@/lib/auth/rbac";
import { requireAdminSession } from "@/lib/server/api/auth";
import { paginatedJson, paginationFromSearchParams } from "@/lib/server/api/pagination";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  createConsoleUser,
  deleteConsoleUser,
  getConsoleUsersPage,
  updateConsoleUser,
  type UserPayload,
} from "@/lib/server/services/users/user.service";

function clean(value: string | null) {
  return value?.trim() ?? "";
}

export async function handleAdminUsersGet(request: Request) {
  try {
    await requireAdminSession();
    const url = new URL(request.url);
    const role = clean(url.searchParams.get("role"));

    return paginatedJson(
      await getConsoleUsersPage({
        ...paginationFromSearchParams(url.searchParams),
        appScopeKey: clean(url.searchParams.get("appScopeKey")) || undefined,
        role: isStaffRole(role) ? role : undefined,
        search: clean(url.searchParams.get("search")) || undefined,
        storeScopeKey: clean(url.searchParams.get("storeScopeKey")) || undefined,
      }),
    );
  } catch (error) {
    return errorJson(error, "List users failed.");
  }
}

export async function handleAdminUsersPost(request: Request) {
  try {
    const admin = await requireAdminSession();
    const payload = await parseJsonBody<UserPayload>(request);
    return okJson(await createConsoleUser(payload, admin));
  } catch (error) {
    return errorJson(error, "Create user failed.");
  }
}

export async function handleAdminUsersPatch(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<UserPayload>(request);
    return okJson(await updateConsoleUser(payload));
  } catch (error) {
    return errorJson(error, "Update user failed.");
  }
}

export async function handleAdminUsersDelete(request: Request) {
  try {
    const admin = await requireAdminSession();
    const payload = await parseJsonBody<UserPayload>(request);
    return okJson(await deleteConsoleUser(payload, admin));
  } catch (error) {
    return errorJson(error, "Delete user failed.");
  }
}
