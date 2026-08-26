import { NotificationConfigPage } from "@/components/tracking/pages/events/notification-config-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getAppConfigOptions } from "@/lib/server/page-loaders/events/app-config-options.loader";

export default async function NotificationConfigRoutePage() {
  await requireConsoleSession(["Admin"]);
  const apps = await getAppConfigOptions();

  return <NotificationConfigPage apps={apps} />;
}
