import { NextResponse, type NextRequest } from "next/server";

import { routeRequiredRoles } from "@/lib/auth/rbac";

function apiBaseUrl() {
  return (
    process.env.SYSTEM_TRACKING_API_URL ||
    process.env.SYSTEM_TRACKING_FUNCTIONS_BASE_URL ||
    "http://127.0.0.1:2156"
  ).replace(/\/+$/, "");
}

export async function proxy(request: NextRequest) {
  const requiredRoles = routeRequiredRoles(request.nextUrl.pathname);
  if (!requiredRoles) return NextResponse.next();

  try {
    const response = await fetch(`${apiBaseUrl()}/api/auth/session`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        cookie: request.headers.get("cookie") || "",
      },
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        session?: { role?: string } | null;
      };
      if (
        payload.session?.role &&
        requiredRoles.includes(payload.session.role as never)
      ) {
        return NextResponse.next();
      }
      if (payload.session) {
        return NextResponse.redirect(
          new URL("/dashboard?access=denied", request.url),
        );
      }
    }
  } catch {
    // Fail closed when the authentication API cannot be reached.
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
