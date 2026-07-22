import { PageHeader } from "@/components/tracking/primitives";
import { requireConsoleSession } from "@/lib/auth/session";

export default async function DashboardPage() {
  await requireConsoleSession(["Admin", "Dev", "Marketing"]);

  return (
    <PageHeader
      eyebrow="General"
      title="Dashboard"
      description="Dashboard overview will be added here."
    />
  );
}
