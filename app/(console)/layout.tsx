import { AppShell } from "@/components/tracking/app-shell";
import { requireConsoleSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireConsoleSession();

  return <AppShell session={session}>{children}</AppShell>;
}
