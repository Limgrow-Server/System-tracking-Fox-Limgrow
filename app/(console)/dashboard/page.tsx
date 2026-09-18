import { DashboardPage as DashboardOverview } from "@/components/tracking/pages/dashboard/dashboard-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getDashboardPageData } from "@/lib/server/page-loaders/dashboard/dashboard.loader";

export default async function DashboardPage() {
  const session = await requireConsoleSession(["Admin", "Dev", "Marketing"]);
  const data = await getDashboardPageData();

  return <DashboardOverview data={data} role={session.role} />;
}
