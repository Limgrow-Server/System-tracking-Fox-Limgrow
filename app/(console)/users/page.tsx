import { AccountManagementPage } from "@/features/users";
import { requireConsoleSession } from "@/lib/auth/session";
import { getUsersPageData } from "@/lib/server/page-loaders/users/users.loader";

export default async function UsersRoutePage() {
  await requireConsoleSession(["Admin"]);
  const data = await getUsersPageData();
  return <AccountManagementPage data={data} />;
}
