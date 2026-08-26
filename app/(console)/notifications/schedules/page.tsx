import { NotificationSchedulesPage } from "@/components/notifications/notification-schedules-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationSchedulesPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NotificationSchedulesRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ appId?: string | string[] }>;
}) {
  const session = await requireConsoleSession(["Admin"]);
  const [data, query] = await Promise.all([
    getNotificationSchedulesPageData(session),
    searchParams,
  ]);

  return (
    <NotificationSchedulesPage
      canManage={data.canManageNotifications}
      data={data}
      initialAppId={single(query.appId)}
    />
  );
}
