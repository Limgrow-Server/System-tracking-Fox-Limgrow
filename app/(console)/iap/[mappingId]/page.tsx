import { requireConsoleSession } from "@/lib/auth/session";
import { getIapAppDetailPageData } from "@/lib/server/page-loaders/iap/app-detail.loader";
import { IapAppDetailPage } from "@/components/tracking/pages/iap/iap-app-detail-page";
import { notFound } from "next/navigation";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageNumber(value: string | string[] | undefined) {
  const parsed = Number.parseInt(single(value) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function IapAppDetailRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ mappingId: string }>;
  searchParams: Promise<{
    environment?: string | string[];
    kind?: string | string[];
    page?: string | string[];
    platform?: string | string[];
    state?: string | string[];
    trial?: string | string[];
  }>;
}) {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);

  const { mappingId } = await params;
  const query = await searchParams;
  const platform = single(query.platform);
  
  if (!platform) {
    notFound();
  }

  const data = await getIapAppDetailPageData(mappingId, platform, session, {
    environment: single(query.environment),
    kind: single(query.kind),
    page: pageNumber(query.page),
    state: single(query.state),
    trial: single(query.trial),
  });
  if (!data) notFound();

  return <IapAppDetailPage data={data} />;
}
