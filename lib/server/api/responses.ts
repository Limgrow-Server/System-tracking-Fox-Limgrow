import { NextResponse } from "next/server";

import { ApiError, unknownToApiError } from "@/lib/server/api/errors";

export function okJson(body: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...body });
}

export function errorJson(error: unknown, fallbackMessage: string) {
  const apiError = error instanceof ApiError ? error : unknownToApiError(error, fallbackMessage);

  return NextResponse.json(
    { ok: false, error: apiError.message },
    { status: apiError.status }
  );
}

