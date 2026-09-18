import { requireConsoleSession } from "@/lib/auth/session";
import { ReviewAppGridPage } from "@/components/tracking/pages/reviews/review-app-grid-page";
import { getReviewAppGridPageData } from "@/lib/server/page-loaders/reviews/review-app-grid.loader";

export default async function CommentsRoutePage() {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);

  const data = await getReviewAppGridPageData(session);

  return <ReviewAppGridPage data={data} />;
}
