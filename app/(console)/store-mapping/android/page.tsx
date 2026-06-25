import { StoreMappingPage } from "@/components/tracking/pages/store-mapping-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getAndroidStoreMappingPageData } from "@/lib/server/page-loaders/android/store-mapping.loader";

export default async function AndroidStoreMappingRoutePage() {
  await requireConsoleSession(["Admin"]);
  const data = await getAndroidStoreMappingPageData();

  return <StoreMappingPage data={data} platformFilter="android" />;
}
