export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export {
  handleReviewFetchSchedulesDelete as DELETE,
  handleReviewFetchSchedulesPatch as PATCH,
  handleReviewFetchSchedulesPost as POST,
} from "@/lib/server/api/review-fetch-schedules.handler";
