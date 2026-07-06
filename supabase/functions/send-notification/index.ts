const corsHeaders = {
  "access-control-allow-headers": "authorization, x-client-info, apikey, x-api-key, content-type, x-dispatch-secret, x-notification-queue-secret",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "content-type": "application/json" },
    status,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  console.warn("[send-notification] disabled: notification sends are handled by the Next.js server worker.");

  return json({
    disabled: true,
    ok: false,
    error: "supabase_send_notification_disabled_use_server_worker",
  }, 409);
});
