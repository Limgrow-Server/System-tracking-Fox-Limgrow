import { redirect } from "next/navigation";

export default async function ReviewAppDetailRoutePage({
  params,
}: {
  params: Promise<{ mappingId: string }>;
}) {
  const { mappingId } = await params;

  redirect(`/comments/${mappingId}`);
}
