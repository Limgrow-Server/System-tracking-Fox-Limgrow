import { NotificationOverviewPage } from "@/components/notifications/notification-overview-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationsPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

export default async function NotificationOverviewRoutePage() {
  await requireConsoleSession(["Admin"]);
  const data = await getNotificationsPageData();

  return <NotificationOverviewPage data={data} />;
}
