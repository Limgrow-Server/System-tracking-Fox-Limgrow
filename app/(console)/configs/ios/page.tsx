import { ConfigsPage } from "@/components/tracking/pages/configs-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getIosConfigsPageData } from "@/lib/server/page-loaders/ios/configs.loader";

export default async function IosConfigsRoutePage() {
  await requireConsoleSession(["Admin"]);
  const data = await getIosConfigsPageData();

  return <ConfigsPage data={data} platform="ios" />;
}
