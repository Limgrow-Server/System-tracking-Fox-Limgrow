import { EventApprovalPage } from "@/components/tracking/pages/events/event-approval-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getAppConfigOptions } from "@/lib/server/page-loaders/events/app-config-options.loader";

export default async function EventsRoutePage() {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const apps = await getAppConfigOptions();

  return <EventApprovalPage apps={apps} canApprove={session.role === "Admin"} />;
}
