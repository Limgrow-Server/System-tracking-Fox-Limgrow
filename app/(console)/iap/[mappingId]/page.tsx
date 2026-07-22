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
    adjustStatus?: string | string[];
    conversionStatus?: string | string[];
    environment?: string | string[];
    firebaseStatus?: string | string[];
    kind?: string | string[];
    page?: string | string[];
    platform?: string | string[];
    purchaseDateFrom?: string | string[];
    purchaseDateTo?: string | string[];
    revenueGranularity?: string | string[];
    revenueSort?: string | string[];
    state?: string | string[];
    twoHourStatus?: string | string[];
    trial?: string | string[];
  }>;
}) {
  const query = await searchParams;
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);

  const { mappingId } = await params;
  const platform = single(query.platform);

  if (!platform) {
    notFound();
  }

  const data = await getIapAppDetailPageData(mappingId, platform, {
    adjustStatus: single(query.adjustStatus),
    conversionStatus: single(query.conversionStatus),
    environment: single(query.environment),
    firebaseStatus: single(query.firebaseStatus),
    kind: single(query.kind),
    page: pageNumber(query.page),
    purchaseDateFrom: single(query.purchaseDateFrom),
    purchaseDateTo: single(query.purchaseDateTo),
    revenueGranularity: single(query.revenueGranularity),
    revenueSort: single(query.revenueSort),
    state: single(query.state),
    twoHourStatus: single(query.twoHourStatus),
    trial: single(query.trial),
  });
  if (!data) notFound();

  return <IapAppDetailPage data={data} />;
}
