import { AndroidIapPage } from "@/components/tracking/pages/android-iap-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getAndroidIapPageData } from "@/lib/server/page-loaders/android/iap.loader";

export default async function AndroidIapRoutePage() {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const data = await getAndroidIapPageData();

  return <AndroidIapPage transactions={data} />;
}
