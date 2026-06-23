import { requireConsoleSession } from "@/lib/auth/session";
import { getReplyStoreListPageDataLoader } from "@/lib/server/page-loaders/reviews/reply-config.loader";
import { ReplyStoreListPage } from "@/components/tracking/pages/reply-store-list-page";

export default async function ReplyRoutePage() {
  await requireConsoleSession(["Admin", "Marketing"]);

  const data = await getReplyStoreListPageDataLoader();

  return <ReplyStoreListPage data={data} />;
}
