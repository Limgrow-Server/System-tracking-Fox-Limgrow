import { IosIapVerifyPage } from "@/components/tracking/pages/ios-iap-verify-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getIosIapVerifyPageData } from "@/lib/server/page-loaders/ios/iap-verify.loader";

export default async function IosIapVerifyRoutePage() {
  await requireConsoleSession(["Admin"]);
  const data = await getIosIapVerifyPageData();

  return <IosIapVerifyPage data={data} />;
}
