import { NextResponse } from "next/server";

export type PaginationQuery = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

export type PaginatedResult<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 10;

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function paginationFromSearchParams(
  searchParams: URLSearchParams,
  options?: { defaultPageSize?: number; maxPageSize?: number },
): PaginationQuery {
  const defaultPageSize = options?.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = options?.maxPageSize ?? MAX_PAGE_SIZE;
  const page = positiveInt(searchParams.get("page"), DEFAULT_PAGE);
  const requestedPageSize = positiveInt(
    searchParams.get("pageSize"),
    defaultPageSize,
  );
  const pageSize = Math.min(requestedPageSize, maxPageSize);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function paginatedResult<T>(
  data: T[],
  total: number,
  pagination: PaginationQuery,
): PaginatedResult<T> {
  return {
    data,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

export function paginatedJson<T>(
  result: PaginatedResult<T>,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({
    success: true,
    data: result.data,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
    ...extra,
  });
}
