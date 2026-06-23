import "server-only";

import { getReplyConfigPageData } from "@/lib/server/services/reviews/android-review.service";
import type { ReplyConfigPageData } from "@/lib/tracking/page-data";

export function getReplyConfigPageDataLoader(): Promise<ReplyConfigPageData> {
  return getReplyConfigPageData();
}
