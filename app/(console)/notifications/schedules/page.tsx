import { NotificationSchedulesPage } from "@/components/notifications/notification-schedules-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationSchedulesPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

export default async function NotificationSchedulesRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const params = await searchParams;
  const initialAppId = Array.isArray(params.app) ? params.app[0] : params.app;
  const data = await getNotificationSchedulesPageData(session);

  return <NotificationSchedulesPage data={data} initialAppId={initialAppId} />;
}
