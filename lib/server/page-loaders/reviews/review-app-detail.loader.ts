import "server-only";

import { canAccessReviewApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import type { PaginationQuery } from "@/lib/server/api/pagination";
import { getReviewAppDetail } from "@/lib/server/services/reviews/review.service";
import type { ReviewAppDetailPageData } from "@/lib/tracking/page-data";

export async function getReviewAppDetailPageData(
  mappingId: string,
  session: ConsoleSession,
  options?: {
    context?: boolean;
    rating?: string;
    reply?: string;
    reviewPagination?: PaginationQuery;
    search?: string;
  },
): Promise<ReviewAppDetailPageData | null> {
  const data = await getReviewAppDetail(mappingId, options);
  return canAccessReviewApp(session, data.app) ? data : null;
}
