import { redirect } from "next/navigation";

import { requireConsoleSession } from "@/lib/auth/session";

export default async function DashboardPage() {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  redirect("/store-mapping/android");
}
