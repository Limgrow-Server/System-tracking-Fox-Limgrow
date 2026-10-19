import "server-only";

import { revalidateTag } from "next/cache";

export const CACHE_TAGS = {
  androidCredentials: "android-credentials",
  androidStoreMappings: "android-store-mappings",
  deviceTokens: "device-tokens",
  iosCredentials: "ios-credentials",
  iosStoreMappings: "ios-store-mappings",
  notificationEvents: "notification-events",
  notificationJobs: "notification-jobs",
  notificationSchedules: "notification-schedules",
} as const;

export function revalidateCacheTags(tags: string[]) {
  tags.forEach((tag) => revalidateTag(tag, { expire: 0 }));
}
