import "server-only";

import { cookies } from "next/headers";

function apiBaseUrl() {
  return (
    process.env.SYSTEM_TRACKING_API_URL
    || process.env.SYSTEM_TRACKING_FUNCTIONS_BASE_URL
    || `http://127.0.0.1:${process.env.SYSTEM_TRACKING_API_PORT || "2156"}`
  ).replace(/\/+$/, "");
}

export async function fetchSystemTrackingApi(
  path: string,
  init?: Omit<RequestInit, "cache">,
) {
  const headers = new Headers(init?.headers);
  const cookieHeader = (await cookies()).toString();

  if (cookieHeader) headers.set("cookie", cookieHeader);
  if (!headers.has("accept")) headers.set("accept", "application/json");

  return fetch(`${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    cache: "no-store",
    headers,
  });
}
