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
    console.error("[send-notification] request failed", {
      error: error instanceof Error
        ? { message: error.message, name: error.name, stack: error.stack }
        : { message: String(error) },
      method: request.method,
      url: request.url,
    });

    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown send-notification error",
      },
      500
    );
  }
});
