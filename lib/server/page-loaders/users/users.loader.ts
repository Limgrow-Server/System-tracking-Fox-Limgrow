import "server-only";

import { getConsoleUsers } from "@/lib/server/services/users/user.service";
import type { TeamMember } from "@/lib/tracking/types";

export async function getUsersPageData(): Promise<TeamMember[]> {
  return (await getConsoleUsers()).users;
}
