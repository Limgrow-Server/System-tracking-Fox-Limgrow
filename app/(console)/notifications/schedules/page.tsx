import { NotificationSchedulesPage } from "@/components/tracking/pages/notifications/notification-schedules-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationsPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

export default async function NotificationSchedulesRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  await requireConsoleSession(["Admin"]);
  const params = await searchParams;
  const initialAppId = Array.isArray(params.app) ? params.app[0] : params.app;
  const data = await getNotificationsPageData();

  return <NotificationSchedulesPage data={data} initialAppId={initialAppId} />;
}
