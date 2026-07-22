import { NotificationHistoryPage } from "@/components/notifications/notification-history-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { emptyNotificationsPageData } from "@/lib/tracking/empty-notifications";

export default async function NotificationHistoryRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const params = await searchParams;
  const initialAppId = Array.isArray(params.app) ? params.app[0] : params.app;

  return (
    <NotificationHistoryPage
      data={emptyNotificationsPageData()}
      deferInitialLoad
      initialAppId={initialAppId}
    />
  );
}
