import { requireConsoleSession } from "@/lib/auth/session";
import { ReviewAppGridPage } from "@/components/tracking/pages/reviews/review-app-grid-page";
import { getReviewAppGridPageData } from "@/lib/server/page-loaders/reviews/review-app-grid.loader";

export default async function CommentsRoutePage() {
  await requireConsoleSession(["Admin", "Marketing"]);

  const data = await getReviewAppGridPageData();

  return <ReviewAppGridPage data={data} />;
}
