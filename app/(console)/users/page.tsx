import { UsersPage } from "@/components/tracking/pages/users-page";
import { requireConsoleSession } from "@/lib/auth/session";
import { getUsersPageData } from "@/lib/server/page-loaders/users/users.loader";

export default async function UsersRoutePage() {
  await requireConsoleSession(["Admin"]);
  const users = await getUsersPageData();
  return <UsersPage users={users} />;
}
