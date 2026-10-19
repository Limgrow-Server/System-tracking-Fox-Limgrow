import { EventAnalyticsAppGridPage } from "@/components/tracking/pages/events/event-analytics-app-grid-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getAppConfigOptions } from "@/lib/server/page-loaders/events/app-config-options.loader";

export default async function EventAnalyticsRoutePage() {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const apps = await getAppConfigOptions();

  return <EventAnalyticsAppGridPage apps={apps} />;
}
