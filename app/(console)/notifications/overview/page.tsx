import { NotificationOverviewPage } from "@/components/notifications/notification-overview-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationOverviewPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

export default async function NotificationOverviewRoutePage() {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const data = await getNotificationOverviewPageData(session);

  return <NotificationOverviewPage data={data} />;
}
