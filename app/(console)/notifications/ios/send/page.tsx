import { redirect } from "next/navigation";

export default async function IosNotificationSendRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  const params = await searchParams;
  const app = Array.isArray(params.app) ? params.app[0] : params.app;
  redirect(`/notifications/send${app ? `?app=${encodeURIComponent(app)}` : ""}`);
}
