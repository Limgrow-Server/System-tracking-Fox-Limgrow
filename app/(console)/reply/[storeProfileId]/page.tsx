import { notFound } from "next/navigation";

import { requireConsoleSession } from "@/lib/auth/session";
import { getReplyConfigPageDataLoader } from "@/lib/server/page-loaders/reviews/reply-config.loader";
import { ReplyConfigPage } from "@/components/tracking/pages/reply-config-page";

export default async function ReplyStoreRoutePage({
  params,
}: {
  params: Promise<{ storeProfileId: string }>;
}) {
  await requireConsoleSession(["Admin", "Marketing"]);

  const { storeProfileId } = await params;
  const data = await getReplyConfigPageDataLoader(storeProfileId);
  if (!data) notFound();

  return <ReplyConfigPage data={data} />;
}
