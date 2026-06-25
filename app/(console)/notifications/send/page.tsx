import { NotificationSendPage } from "@/components/notifications/notification-send-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationsPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

export default async function NotificationSendRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  await requireConsoleSession(["Admin", "Marketing"]);
  const params = await searchParams;
  const initialAppId = Array.isArray(params.app) ? params.app[0] : params.app;
  const data = await getNotificationsPageData();

  return <NotificationSendPage data={data} initialAppId={initialAppId} />;
}
