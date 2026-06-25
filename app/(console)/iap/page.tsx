import { requireConsoleSession } from "@/lib/auth/session";
import { getIapAppGridPageData } from "@/lib/server/page-loaders/iap/app-grid.loader";
import { IapAppGridPage } from "@/components/tracking/pages/iap/iap-app-grid-page";

export default async function IapRoutePage() {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  
  const data = await getIapAppGridPageData(session);

  return <IapAppGridPage data={data} />;
}
