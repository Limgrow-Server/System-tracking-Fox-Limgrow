import { NotificationHistoryPage } from "@/components/tracking/pages/notifications/notification-history-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationsPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

export default async function NotificationHistoryDetailRoutePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  await requireConsoleSession(["Admin"]);
  const { jobId } = await params;
  const data = await getNotificationsPageData();

  return <NotificationHistoryPage data={data} historyJobId={jobId} />;
}
