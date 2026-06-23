import { requireConsoleSession } from "@/lib/auth/session";
import { getReviewAppDetailPageData } from "@/lib/server/page-loaders/reviews/review-app-detail.loader";
import { ReviewAppDetailPage } from "@/components/tracking/pages/review-app-detail-page";

export default async function ReviewAppDetailRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ mappingId: string }>;
  searchParams: Promise<{ mock?: string }>;
}) {
  await requireConsoleSession(["Admin", "Marketing"]);

  const { mappingId } = await params;
  const { mock } = await searchParams;
  const data = await getReviewAppDetailPageData(mappingId, {
    includeMockData: mock === "1" || mock === "true",
  });

  return <ReviewAppDetailPage data={data} />;
}
