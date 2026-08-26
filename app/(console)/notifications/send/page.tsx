import { NotificationSendPage } from "@/components/notifications/notification-send-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationSendPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NotificationSendRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ appId?: string | string[] }>;
}) {
  const session = await requireConsoleSession(["Admin"]);
  const [data, query] = await Promise.all([
    getNotificationSendPageData(session),
    searchParams,
  ]);

  return <NotificationSendPage data={data} initialAppId={single(query.appId)} />;
}
