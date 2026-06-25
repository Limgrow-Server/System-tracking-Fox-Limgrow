import "server-only";

import { getConsoleUsersPage } from "@/lib/server/services/users/user.service";
import { getAndroidStoreMappingDtos } from "@/lib/server/services/store-mappings/android-store-mapping.service";
import { getIosStoreMappingDtos } from "@/lib/server/services/store-mappings/ios-store-mapping.service";
import { sortMappings } from "@/lib/tracking/mappers/shared";
import type { UsersPageData } from "@/lib/tracking/page-data";

export async function getUsersPageData(): Promise<UsersPageData> {
  const [users, androidMappings, iosMappings] = await Promise.all([
    getConsoleUsersPage({ page: 1, pageSize: 10, skip: 0, take: 10 }),
    getAndroidStoreMappingDtos({ take: 500 }),
    getIosStoreMappingDtos({ take: 500 }),
  ]);

  return {
    appOptions: sortMappings([...androidMappings, ...iosMappings]),
    users: users.data,
    usersPagination: {
      page: users.page,
      pageSize: users.pageSize,
      total: users.total,
      totalPages: users.totalPages,
    },
  };
}
