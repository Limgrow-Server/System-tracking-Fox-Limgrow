import { NotificationTokenDetailPage } from "@/components/notifications/notification-token-detail-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationTokenDetailPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";
import { notFound } from "next/navigation";

export default async function NotificationTokenDetailRoutePage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const { appId } = await params;
  const data = await getNotificationTokenDetailPageData(session);
  const selectedApp = data.storeMappings.find(
    (app) => app.id === appId || app.app_id?.toLowerCase() === appId.toLowerCase(),
  );
  if (!selectedApp) notFound();

  return <NotificationTokenDetailPage appId={appId} data={data} />;
}
