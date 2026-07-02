import { NotificationOverviewPage } from "@/components/notifications/notification-overview-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { emptyNotificationsPageData } from "@/lib/tracking/empty-notifications";

export default async function NotificationOverviewRoutePage() {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);

  return <NotificationOverviewPage data={emptyNotificationsPageData()} deferInitialLoad />;
}
