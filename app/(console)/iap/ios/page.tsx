import { IosIapPage } from "@/components/tracking/pages/ios-iap-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getIosIapPageData } from "@/lib/server/page-loaders/ios/iap-verify.loader";

export default async function IosIapRoutePage() {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const data = await getIosIapPageData();

  return <IosIapPage transactions={data} />;
}
