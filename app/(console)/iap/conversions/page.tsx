import { requireConsoleSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function IapTrialConversionsRoute({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const params = await searchParams;
  const mappingId = single(params.app)?.trim();

  if (mappingId) {
    redirect(
      `/iap/${encodeURIComponent(mappingId)}/conversion?platform=ios`,
    );
  }

  redirect("/iap");
}
