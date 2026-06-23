import { redirect } from "next/navigation";

export default async function ReviewAppDetailRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ mappingId: string }>;
  searchParams: Promise<{ mock?: string }>;
}) {
  const { mappingId } = await params;
  const { mock } = await searchParams;
  const query = new URLSearchParams();

  if (mock) {
    query.set("mock", mock);
  }

  redirect(`/comments/${mappingId}${query.size ? `?${query.toString()}` : ""}`);
}
