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
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown send-notification error",
      },
      500
    );
  }
});
