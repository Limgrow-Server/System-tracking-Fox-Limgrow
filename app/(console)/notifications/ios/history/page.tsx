import { redirect } from "next/navigation";

export default async function IosNotificationHistoryRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  const params = await searchParams;
  const app = Array.isArray(params.app) ? params.app[0] : params.app;
  redirect(`/notifications/history${app ? `?app=${encodeURIComponent(app)}` : ""}`);
}
