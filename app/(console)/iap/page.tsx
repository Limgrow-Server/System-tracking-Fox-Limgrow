import { requireConsoleSession } from "@/lib/auth/session";
import { getIapAppGridPageData } from "@/lib/server/page-loaders/iap/app-grid.loader";
import { IapAppGridPage } from "@/components/tracking/pages/iap/iap-app-grid-page";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageNumber(value: string | string[] | undefined) {
  const parsed = Number.parseInt(single(value) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function IapRoutePage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    platform?: string | string[];
    search?: string | string[];
    store?: string | string[];
  }>;
}) {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const params = await searchParams;
  const data = await getIapAppGridPageData({
    page: pageNumber(params.page),
    platform: single(params.platform),
    search: single(params.search),
    storeAccountName: single(params.store),
  });

  return <IapAppGridPage data={data} />;
}
