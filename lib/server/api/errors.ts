import "server-only";

import { Prisma } from "@prisma/client";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function badRequest(message: string) {
  return new ApiError(message, 400);
}

export function forbidden(message: string) {
  return new ApiError(message, 403);
}

export function notFound(message: string) {
  return new ApiError(message, 404);
}

export function conflict(message: string) {
  return new ApiError(message, 409);
}

export function unknownToApiError(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError) return error;

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return conflict("A record with the same unique fields already exists.");
  }

  return new ApiError(error instanceof Error ? error.message : fallbackMessage, 500);
}

