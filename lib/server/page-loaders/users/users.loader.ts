import "server-only";

import { getConsoleUsers } from "@/lib/server/services/users/user.service";
import { getAndroidStoreMappingDtos } from "@/lib/server/services/store-mappings/android-store-mapping.service";
import { getIosStoreMappingDtos } from "@/lib/server/services/store-mappings/ios-store-mapping.service";
import { sortMappings } from "@/lib/tracking/mappers/shared";
import type { UsersPageData } from "@/lib/tracking/page-data";

export async function getUsersPageData(): Promise<UsersPageData> {
  const [users, androidMappings, iosMappings] = await Promise.all([
    getConsoleUsers(),
    getAndroidStoreMappingDtos({ take: 500 }),
    getIosStoreMappingDtos({ take: 500 }),
  ]);

  return {
    appOptions: sortMappings([...androidMappings, ...iosMappings]),
    users: users.users,
  };
}
