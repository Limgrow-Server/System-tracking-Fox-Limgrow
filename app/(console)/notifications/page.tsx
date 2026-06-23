import { redirect } from "next/navigation";

export default async function NotificationsRoutePage() {
  redirect("/notifications/send");
}
