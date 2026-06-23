import "server-only";

import { getAndroidCredentialConfigs } from "@/lib/server/services/credentials/android-credential.service";
import { getIosCredentialConfigs } from "@/lib/server/services/credentials/ios-credential.service";
import {
  getDeviceTokens,
  getNotificationEvents,
  getNotificationJobs,
  getNotificationSchedules,
} from "@/lib/server/services/notifications/notification.service";
import { getAndroidStoreMappingDtos } from "@/lib/server/services/store-mappings/android-store-mapping.service";
import { getIosStoreMappingDtos } from "@/lib/server/services/store-mappings/ios-store-mapping.service";
import type { NotificationsPageData } from "@/lib/tracking/page-data";
import { sortMappings } from "@/lib/tracking/mappers/shared";

export async function getNotificationsPageData(): Promise<NotificationsPageData> {
  const [
    androidMappings,
    iosMappings,
    androidCredentials,
    iosCredentials,
    notificationJobs,
    notificationSchedules,
    notificationEvents,
    deviceTokens,
  ] = await Promise.all([
    getAndroidStoreMappingDtos({ take: 300 }),
    getIosStoreMappingDtos({ take: 300 }),
    getAndroidCredentialConfigs(),
    getIosCredentialConfigs(),
    getNotificationJobs(240),
    getNotificationSchedules(60),
    getNotificationEvents(1000),
    getDeviceTokens(2000),
  ]);

  return {
    credentialSecrets: [...androidCredentials.credentials, ...iosCredentials.credentials].filter(
      (credential) => credential.credential_purpose === "firebase_admin"
    ),
    deviceTokens,
    notificationEvents,
    notificationJobs,
    notificationSchedules,
    storeMappings: sortMappings([...androidMappings, ...iosMappings]),
  };
}
