import { handleReviewRawGet } from "@/lib/server/api/reviews.handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleReviewRawGet(request);
}
