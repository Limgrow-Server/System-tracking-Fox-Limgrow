import "server-only";

import { requireAdminSession } from "@/lib/server/api/auth";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  createConsoleUser,
  deleteConsoleUser,
  getConsoleUsers,
  updateConsoleUser,
  type UserPayload,
} from "@/lib/server/services/users/user.service";

export async function handleAdminUsersGet() {
  try {
    await requireAdminSession();
    return okJson(await getConsoleUsers());
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
