const corsHeaders = {
  "access-control-allow-headers": "authorization, x-client-info, apikey, x-api-key, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "content-type": "application/json" },
    status,
  });
}

function serverBaseUrl() {
  const value =
    clean(Deno.env.get("TRACKING_SERVER_URL"))
    || clean(Deno.env.get("TRACKING_PLATFORM_URL"))
    || clean(Deno.env.get("APP_URL"))
    || clean(Deno.env.get("SITE_URL"))
    || clean(Deno.env.get("NEXT_PUBLIC_APP_URL"));

  return value.replace(/\/+$/, "");
}

function forwardedHeaders(request: Request) {
  const headers = new Headers();
  const passThroughHeaders = [
    "authorization",
    "apikey",
    "content-type",
    "user-agent",
    "x-api-key",
    "x-client-info",
  ];

  for (const header of passThroughHeaders) {
    const value = request.headers.get(header);
    if (value) headers.set(header, value);
  }

  headers.set("x-forwarded-from", "supabase-edge-function");

  return headers;
}

export async function forwardToServer(request: Request, path: string) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const baseUrl = serverBaseUrl();
  if (!baseUrl) {
    return json({ ok: false, error: "tracking_server_url_not_configured" }, 500);
  }

  const upstreamUrl = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      headers: forwardedHeaders(request),
      method: request.method,
    });
    const responseHeaders = new Headers(corsHeaders);
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);

    return new Response(await upstream.arrayBuffer(), {
      headers: responseHeaders,
      status: upstream.status,
      statusText: upstream.statusText,
    });
  } catch (error) {
    console.error("[server-proxy] upstream request failed", {
      error: error instanceof Error ? error.message : String(error),
      path,
      upstreamUrl,
    });

    return json({ ok: false, error: "tracking_server_proxy_failed" }, 502);
  }
}
