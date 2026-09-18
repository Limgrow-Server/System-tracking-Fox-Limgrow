import { requireConsoleSession } from "@/lib/auth/session";
import { getReplyStoreListPageDataLoader } from "@/lib/server/page-loaders/reviews/reply-config.loader";
import { ReplyStoreListPage } from "@/components/tracking/pages/reviews/reply-store-list-page";

export default async function ReplyRoutePage() {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);

  const data = await getReplyStoreListPageDataLoader(session);

  return <ReplyStoreListPage data={data} />;
}
