import { notFound, redirect } from "next/navigation";

import { IapTrialConversionPage } from "@/components/tracking/pages/iap/iap-trial-conversion-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getIapTrialConversionPageData } from "@/lib/server/page-loaders/iap/trial-conversion.loader";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function IapAppTrialConversionRoute({
  params,
  searchParams,
}: {
  params: Promise<{ mappingId: string }>;
  searchParams: Promise<{ platform?: string | string[] }>;
}) {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);

  const { mappingId } = await params;
  const platform = single((await searchParams).platform);

  if (platform && platform !== "ios") {
    redirect(
      `/iap/${encodeURIComponent(mappingId)}?platform=${encodeURIComponent(platform)}`,
    );
  }

  const data = await getIapTrialConversionPageData(mappingId);
  if (
    !data.selectedApp ||
    data.selectedApp.mappingId !== mappingId ||
    data.selectedApp.platform !== "ios"
  ) {
    notFound();
  }

  return <IapTrialConversionPage data={data} />;
}
