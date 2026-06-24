import { NotificationTokenDetailPage } from "@/components/notifications/notification-token-detail-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationsPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

export default async function NotificationTokenDetailRoutePage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  await requireConsoleSession(["Admin"]);
  const { appId } = await params;
  const data = await getNotificationsPageData();

  return <NotificationTokenDetailPage appId={appId} data={data} />;
}
