import { notFound } from "next/navigation";

import { EventAnalyticsPage } from "@/components/tracking/pages/events/event-analytics-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getAppConfigOptions } from "@/lib/server/page-loaders/events/app-config-options.loader";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EventAnalyticsDetailRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ mappingId: string }>;
  searchParams: Promise<{ platform?: string | string[] }>;
}) {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const [{ mappingId }, query, apps] = await Promise.all([
    params,
    searchParams,
    getAppConfigOptions(),
  ]);
  const platform = single(query.platform);
  const selectedApp = apps.find(
    (app) =>
      app.mappingId === mappingId &&
      (!platform || app.platform === platform),
  );
  if (!selectedApp) notFound();

  return (
    <EventAnalyticsPage
      key={selectedApp.key}
      apps={apps}
      initialApp={selectedApp}
    />
  );
}
