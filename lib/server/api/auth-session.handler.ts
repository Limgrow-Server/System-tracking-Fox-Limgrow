import "server-only";

import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  loginConsoleUser,
  logoutConsoleUser,
  type LoginPayload,
} from "@/lib/server/services/auth/auth.service";

export async function handleAuthLoginPost(request: Request) {
  try {
    const payload = await parseJsonBody<LoginPayload>(request);
    return okJson(await loginConsoleUser(payload));
  } catch (error) {
    return errorJson(error, "Login failed.");
  }
}

export async function handleAuthLogoutPost() {
  try {
    return okJson(await logoutConsoleUser());
  } catch (error) {
    return errorJson(error, "Logout failed.");
  }
}
