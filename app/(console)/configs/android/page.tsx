import { ConfigsPage } from "@/components/tracking/pages/configs-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getAndroidConfigsPageData } from "@/lib/server/page-loaders/android/configs.loader";

export default async function AndroidConfigsRoutePage() {
  await requireConsoleSession(["Admin"]);
  const data = await getAndroidConfigsPageData();

  return <ConfigsPage data={data} platform="android" />;
}
