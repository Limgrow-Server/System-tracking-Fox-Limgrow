import "server-only";

import { getReviewAppDetail } from "@/lib/server/services/reviews/android-review.service";
import type { ReviewAppDetailPageData } from "@/lib/tracking/page-data";

export function getReviewAppDetailPageData(
  mappingId: string,
  options?: { includeMockData?: boolean },
): Promise<ReviewAppDetailPageData> {
  return getReviewAppDetail(mappingId, options);
}
