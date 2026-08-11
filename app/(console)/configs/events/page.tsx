import { EventConfigPage } from "@/components/tracking/pages/events/event-config-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getAppConfigOptions } from "@/lib/server/page-loaders/events/app-config-options.loader";

export default async function EventConfigRoutePage() {
  await requireConsoleSession(["Admin"]);
  const apps = await getAppConfigOptions();

  return <EventConfigPage apps={apps} />;
}
