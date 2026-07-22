import { requireConsoleSession } from "@/lib/auth/session";
import { ReviewAppDetailPage } from "@/components/tracking/pages/reviews/review-app-detail-page";
import { getReviewAppDetailPageData } from "@/lib/server/page-loaders/reviews/review-app-detail.loader";
import { notFound } from "next/navigation";

export default async function CommentsAppDetailRoutePage({
  params,
}: {
  params: Promise<{ mappingId: string }>;
}) {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);

  const { mappingId } = await params;
  const data = await getReviewAppDetailPageData(mappingId, session);
  if (!data) notFound();

  return <ReviewAppDetailPage data={data} />;
}
