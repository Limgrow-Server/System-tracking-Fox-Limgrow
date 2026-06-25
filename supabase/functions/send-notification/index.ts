import {
  corsHeaders,
  createAdminClient,
  jsonResponse as json,
} from "../_shared/edge-config.ts";
import {
  requireAdminCaller,
  sendNotificationPayload,
  type SendNotificationRequest,
} from "./notification-sender.ts";

function errorRecord(error: unknown) {
  return error && typeof error === "object" && !Array.isArray(error)
    ? error as Record<string, unknown>
    : {};
}

function errorString(error: unknown, key: string) {
  const value = errorRecord(error)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function responseError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : errorString(error, "message")
      ?? errorString(error, "error")
      ?? "Unknown send-notification error";

  return {
    code: errorString(error, "code"),
    details: errorString(error, "details"),
    error: message.slice(0, 500),
    hint: errorString(error, "hint"),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const payload = (await request.json()) as SendNotificationRequest;
    const supabase = createAdminClient();
    const caller = await requireAdminCaller(supabase, request);
    const result = await sendNotificationPayload(supabase, payload, caller.email);

    return json({
      ok: true,
      result,
    });
  } catch (error) {
    const failure = responseError(error);
    console.error("[send-notification] request failed", {
      error: failure,
      method: request.method,
      url: request.url,
    });

    return json(
      {
        ok: false,
        ...failure,
      },
      500
    );
  }
});
