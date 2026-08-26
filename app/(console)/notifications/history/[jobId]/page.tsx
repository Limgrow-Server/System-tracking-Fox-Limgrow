import { notFound } from "next/navigation";

import { NotificationHistoryPage } from "@/components/notifications/notification-history-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationHistoryDetailPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

export default async function NotificationHistoryDetailRoutePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const session = await requireConsoleSession(["Admin"]);
  const { jobId } = await params;
  if (!jobId) notFound();

  const data = await getNotificationHistoryDetailPageData(jobId, session);
  if (!data.notificationJobs.some((job) => job.id === jobId)) notFound();

  return <NotificationHistoryPage data={data} historyJobId={jobId} />;
}
