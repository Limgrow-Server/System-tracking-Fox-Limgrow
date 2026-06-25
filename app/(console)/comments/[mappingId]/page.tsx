import { requireConsoleSession } from "@/lib/auth/session";
import { ReviewAppDetailPage } from "@/components/tracking/pages/reviews/review-app-detail-page";
import { getReviewAppDetailPageData } from "@/lib/server/page-loaders/reviews/review-app-detail.loader";
import { notFound } from "next/navigation";

export default async function CommentsAppDetailRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ mappingId: string }>;
  searchParams: Promise<{ mock?: string }>;
}) {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);

  const { mappingId } = await params;
  const { mock } = await searchParams;
  const data = await getReviewAppDetailPageData(mappingId, session, {
    includeMockData: mock === "1" || mock === "true",
  });
  if (!data) notFound();

  return <ReviewAppDetailPage data={data} />;
}
