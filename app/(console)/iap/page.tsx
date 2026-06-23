import { requireConsoleSession } from "@/lib/auth/session";
import { getIapAppGridPageData } from "@/lib/server/page-loaders/iap/app-grid.loader";
import { IapAppGridPage } from "@/components/tracking/pages/iap-app-grid-page";

export default async function IapRoutePage() {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  
  const data = await getIapAppGridPageData();

  return <IapAppGridPage data={data} />;
}
