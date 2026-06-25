import { StoreMappingPage } from "@/components/tracking/pages/store-mapping-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getIosStoreMappingPageData } from "@/lib/server/page-loaders/ios/store-mapping.loader";

export default async function IosStoreMappingRoutePage() {
  await requireConsoleSession(["Admin", "Dev"]);
  const data = await getIosStoreMappingPageData();

  return <StoreMappingPage data={data} platformFilter="ios" />;
}
