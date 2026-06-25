import { requireConsoleSession } from "@/lib/auth/session";
import { ReviewFetchSchedulePage } from "@/components/tracking/pages/reviews/review-fetch-schedule-page";
import { getReviewFetchSchedulePageData } from "@/lib/server/page-loaders/reviews/review-fetch-schedule.loader";

export default async function CommentsScheduleRoutePage() {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);

  const data = await getReviewFetchSchedulePageData(session);

  return <ReviewFetchSchedulePage data={data} />;
}
