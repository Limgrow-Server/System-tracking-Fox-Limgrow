import type { NotificationsPageData } from "@/lib/tracking/page-data";

export function emptyNotificationsPageData(): NotificationsPageData {
  return {
    canManageNotifications: false,
    credentialSecrets: [],
    deviceTokens: [],
    notificationDeviceCounts: {},
    notificationScheduleStats: {},
    notificationTokenStats: {},
    notificationDeliveryEvents: [],
    notificationEvents: [],
    notificationJobs: [],
    notificationPagination: {},
    notificationSchedules: [],
    notificationStoreOptions: [],
    notificationSummary: {
      activeSchedules: 0,
      activeTokens: 0,
      appCount: 0,
      totalSchedules: 0,
      totalTokens: 0,
    },
    storeMappings: [],
  };
}
