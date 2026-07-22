import "server-only";

import { canAccessReviewApp, hasAllAppAccess } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import type { PaginationQuery } from "@/lib/server/api/pagination";
import {
  getReviewAppDetail,
  getReviewCommentsPage,
} from "@/lib/server/services/reviews/review.service";
import type {
  ReviewAppDetailPageData,
  ReviewCommentsPageData,
} from "@/lib/tracking/page-data";

export async function getReviewAppDetailPageData(
  mappingId: string,
  session: ConsoleSession,
  options?: {
    context?: boolean;
    platform?: string;
    rating?: string;
    reply?: string;
    reviewPagination?: PaginationQuery;
    search?: string;
  },
): Promise<ReviewAppDetailPageData | null> {
  const data = await getReviewAppDetail(mappingId, options);
  return canAccessReviewApp(session, data.app) ? data : null;
}

export async function getReviewCommentsPageData(
  mappingId: string,
  session: ConsoleSession,
  options?: {
    knownTotal?: number;
    platform?: string;
    rating?: string;
    reply?: string;
    reviewPagination?: PaginationQuery;
    search?: string;
  },
): Promise<ReviewCommentsPageData | null> {
  const data = await getReviewCommentsPage(mappingId, {
    ...options,
    skipAppLookup: hasAllAppAccess(session),
  });

  if (!data.app) return data;

  return canAccessReviewApp(session, data.app) ? data : null;
}
