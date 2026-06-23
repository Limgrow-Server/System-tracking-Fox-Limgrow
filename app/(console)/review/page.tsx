import { requireConsoleSession } from "@/lib/auth/session";
import { getReviewAppGridPageData } from "@/lib/server/page-loaders/reviews/review-app-grid.loader";
import { ReviewAppGridPage } from "@/components/tracking/pages/reviews/review-app-grid-page";

export default async function ReviewRoutePage() {
  await requireConsoleSession(["Admin", "Marketing"]);

  const data = await getReviewAppGridPageData();

  return <ReviewAppGridPage data={data} />;
}
