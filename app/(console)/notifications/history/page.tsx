import { NotificationHistoryPage } from "@/components/notifications/notification-history-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationHistoryPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NotificationHistoryRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ appId?: string | string[] }>;
}) {
  const session = await requireConsoleSession(["Admin"]);
  const [data, query] = await Promise.all([
    getNotificationHistoryPageData(session),
    searchParams,
  ]);

  return <NotificationHistoryPage data={data} initialAppId={single(query.appId)} />;
}
