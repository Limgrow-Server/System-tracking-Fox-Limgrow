import { NotificationSchedulesPage } from "@/components/notifications/notification-schedules-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { emptyNotificationsPageData } from "@/lib/tracking/empty-notifications";

export default async function NotificationSchedulesRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const params = await searchParams;
  const initialAppId = Array.isArray(params.app) ? params.app[0] : params.app;

  return (
    <NotificationSchedulesPage
      canManage={session.role === "Admin"}
      data={emptyNotificationsPageData()}
      deferInitialLoad
      initialAppId={initialAppId}
    />
  );
}
