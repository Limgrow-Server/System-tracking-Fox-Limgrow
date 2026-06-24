import { requireConsoleSession } from "@/lib/auth/session";
import { ReviewFetchSchedulePage } from "@/components/tracking/pages/reviews/review-fetch-schedule-page";
import { getReviewFetchSchedulePageData } from "@/lib/server/page-loaders/reviews/review-fetch-schedule.loader";

export default async function CommentsScheduleRoutePage() {
  await requireConsoleSession(["Admin", "Marketing"]);

  const data = await getReviewFetchSchedulePageData();

  return <ReviewFetchSchedulePage data={data} />;
}
