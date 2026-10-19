import { redirect } from "next/navigation";

import { LoginPage } from "@/components/tracking/pages/login-page";
import { getConsoleSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginRoutePage() {
  const session = await getConsoleSession();
  if (session) {
    redirect("/dashboard");
  }

  return <LoginPage />;
}
