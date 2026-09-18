import { NotificationTokenDetailPage } from "@/components/notifications/notification-token-detail-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getNotificationTokenDetailPageData } from "@/lib/server/page-loaders/notifications/notifications.loader";
import { valuesMatchSearch } from "@/lib/search";
import { notFound } from "next/navigation";

export default async function NotificationTokenDetailRoutePage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const { appId } = await params;
  const data = await getNotificationTokenDetailPageData(session, appId);
  const normalizedAppId = appId.toLowerCase();
  const selectedApp = data.storeMappings.find(
    (app) =>
      app.id === appId ||
      app.app_id?.toLowerCase() === normalizedAppId ||
      app.package_name?.toLowerCase() === normalizedAppId ||
      app.bundle_id?.toLowerCase() === normalizedAppId ||
      valuesMatchSearch([app.id, app.app_id, app.package_name, app.bundle_id], appId),
  );
  if (!selectedApp) notFound();

  return <NotificationTokenDetailPage appId={appId} canManage={session.role === "Admin"} data={data} />;
}
