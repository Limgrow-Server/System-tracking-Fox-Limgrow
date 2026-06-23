import {
  corsHeaders,
  createAdminClient,
  jsonResponse as json,
} from "../_shared/edge-config.ts";
import {
  dispatchDueNotifications,
  requireAdminOrDispatchSecret,
} from "./notification-dispatcher.ts";

type DispatchRequest = {
  limit?: number;
  now?: string;
  scheduleId?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as DispatchRequest;
    const supabase = createAdminClient();
    const caller = await requireAdminOrDispatchSecret(supabase, request);
    const result = await dispatchDueNotifications(supabase, {
      actorEmail: caller.email,
      limit: payload.limit,
      now: payload.now,
      scheduleId: payload.scheduleId,
    });

    return json({
      ok: true,
      result,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown dispatch-notifications error",
      },
      500
    );
  }
});
