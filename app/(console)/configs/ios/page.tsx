import { ConfigsPage } from "@/components/tracking/pages/configs/configs-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getIosConfigsPageData } from "@/lib/server/page-loaders/ios/configs.loader";

export default async function IosConfigsRoutePage() {
  await requireConsoleSession(["Admin", "Dev"]);
  const data = await getIosConfigsPageData();

  return <ConfigsPage data={data} platform="ios" />;
}
