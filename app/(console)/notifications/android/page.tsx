import { redirect } from "next/navigation";

export default async function AndroidNotificationsRoutePage() {
  redirect("/notifications/overview");
}
