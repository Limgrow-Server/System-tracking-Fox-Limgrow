import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function firstHeaderValue(value: string | null) {
  return clean(value).split(",")[0]?.trim() ?? "";
}

function configuredOrigin() {
  const value =
    clean(process.env.NEXT_PUBLIC_SITE_URL) ||
    clean(process.env.NEXT_PUBLIC_APP_URL) ||
    clean(process.env.SITE_URL) ||
    clean(process.env.APP_URL);

  if (!value) return "";

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function publicOrigin(request: Request, requestUrl: URL) {
  const configured = configuredOrigin();
  if (configured) return configured;

  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ||
    firstHeaderValue(request.headers.get("host"));
  if (!host) return requestUrl.origin;

  const proto =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ||
    requestUrl.protocol.replace(/:$/, "") ||
    "https";

  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const redirectTo = next?.startsWith("/") ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(
    new URL(redirectTo, publicOrigin(request, requestUrl)),
  );
}
