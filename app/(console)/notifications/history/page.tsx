import { NotificationHistoryPage } from "@/components/notifications/notification-history-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationsPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

export default async function NotificationHistoryRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  await requireConsoleSession(["Admin", "Marketing"]);
  const params = await searchParams;
  const initialAppId = Array.isArray(params.app) ? params.app[0] : params.app;
  const data = await getNotificationsPageData();

  return <NotificationHistoryPage data={data} initialAppId={initialAppId} />;
}
