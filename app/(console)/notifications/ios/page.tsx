import { redirect } from "next/navigation";

export default async function IosNotificationsRoutePage() {
  redirect("/notifications/send");
}
