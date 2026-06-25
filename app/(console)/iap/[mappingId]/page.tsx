import { requireConsoleSession } from "@/lib/auth/session";
import { getIapAppDetailPageData } from "@/lib/server/page-loaders/iap/app-detail.loader";
import { IapAppDetailPage } from "@/components/tracking/pages/iap/iap-app-detail-page";
import { notFound } from "next/navigation";

export default async function IapAppDetailRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ mappingId: string }>;
  searchParams: Promise<{ platform?: string }>;
}) {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);

  const { mappingId } = await params;
  const { platform } = await searchParams;
  
  if (!platform) {
    notFound();
  }

  const data = await getIapAppDetailPageData(mappingId, platform, session);
  if (!data) notFound();

  return <IapAppDetailPage data={data} />;
}
