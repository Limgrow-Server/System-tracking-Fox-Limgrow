import { requireConsoleSession } from "@/lib/auth/session";
import { getReplyConfigPageDataLoader } from "@/lib/server/page-loaders/reviews/reply-config.loader";
import { ReplyConfigPage } from "@/components/tracking/pages/reply-config-page";

export default async function ReplyRoutePage() {
  await requireConsoleSession(["Admin", "Marketing"]);

  const data = await getReplyConfigPageDataLoader();

  return <ReplyConfigPage data={data} />;
}
