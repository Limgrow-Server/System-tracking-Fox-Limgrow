import { NotificationSendPage } from "@/components/notifications/notification-send-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationSendPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

export default async function NotificationSendRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  const session = await requireConsoleSession(["Admin"]);
  const params = await searchParams;
  const initialAppId = Array.isArray(params.app) ? params.app[0] : params.app;
  const data = await getNotificationSendPageData(session);

  return <NotificationSendPage data={data} initialAppId={initialAppId} />;
}
