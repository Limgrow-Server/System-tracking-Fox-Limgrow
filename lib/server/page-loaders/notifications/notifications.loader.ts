import "server-only";

import type { ConsoleSession } from "@/lib/auth/rbac";
import {
  filterScopedRecordsForSession,
  filterStoreMappingsForSession,
  scopedCredentialSecrets,
  scopedNotificationEvents,
  scopedNotificationSchedules,
} from "@/lib/auth/app-scope";
import { getAndroidCredentialConfigs } from "@/lib/server/services/credentials/android-credential.service";
import { getIosCredentialConfigs } from "@/lib/server/services/credentials/ios-credential.service";
import {
  getDeviceTokens,
  getNotificationEvents,
  getNotificationEventsForJob,
  getNotificationJobById,
  getNotificationJobs,
  getNotificationSchedules,
} from "@/lib/server/services/notifications/notification.service";
import { getAndroidStoreMappingDtos } from "@/lib/server/services/store-mappings/android-store-mapping.service";
import { getIosStoreMappingDtos } from "@/lib/server/services/store-mappings/ios-store-mapping.service";
import type { NotificationsPageData } from "@/lib/tracking/page-data";
import { sortMappings } from "@/lib/tracking/mappers/shared";

function emptyNotificationsData(): NotificationsPageData {
  return {
    credentialSecrets: [],
    deviceTokens: [],
    notificationEvents: [],
    notificationJobs: [],
    notificationSchedules: [],
    storeMappings: [],
  };
}

function notificationData(data: Partial<NotificationsPageData>): NotificationsPageData {
  return {
    ...emptyNotificationsData(),
    ...data,
  };
}

async function getNotificationStoreMappings(session?: ConsoleSession) {
  const [androidMappings, iosMappings] = await Promise.all([
    getAndroidStoreMappingDtos({ take: 300 }),
    getIosStoreMappingDtos({ take: 300 }),
  ]);

  const mappings = sortMappings([...androidMappings, ...iosMappings]);
  return session ? filterStoreMappingsForSession(session, mappings) : mappings;
}

async function getFirebaseCredentialSecrets() {
  const [androidCredentials, iosCredentials] = await Promise.all([
    getAndroidCredentialConfigs(),
    getIosCredentialConfigs(),
  ]);

  return [...androidCredentials.credentials, ...iosCredentials.credentials].filter(
    (credential) => credential.credential_purpose === "firebase_admin"
  );
}

function scopedNotificationsData(
  session: ConsoleSession,
  data: NotificationsPageData,
): NotificationsPageData {
  const notificationJobs = filterScopedRecordsForSession(
    session,
    data.notificationJobs,
  );
  const deviceTokens = filterScopedRecordsForSession(session, data.deviceTokens);
  const notificationSchedules = scopedNotificationSchedules(
    session,
    data.notificationSchedules,
  );

  return {
    credentialSecrets: scopedCredentialSecrets(
      session,
      data.credentialSecrets,
      data.storeMappings,
    ),
    deviceTokens,
    notificationEvents: scopedNotificationEvents(
      data.notificationEvents,
      notificationJobs,
      deviceTokens,
    ),
    notificationJobs,
    notificationSchedules,
    storeMappings: data.storeMappings,
  };
}

export async function getNotificationOverviewPageData(
  session: ConsoleSession,
): Promise<NotificationsPageData> {
  const [storeMappings, notificationSchedules, deviceTokens] = await Promise.all([
    getNotificationStoreMappings(session),
    getNotificationSchedules(60),
    getDeviceTokens(2000),
  ]);

  return scopedNotificationsData(session, notificationData({
    deviceTokens,
    notificationSchedules,
    storeMappings,
  }));
}

export async function getNotificationTokenDetailPageData(
  session: ConsoleSession,
): Promise<NotificationsPageData> {
  const [storeMappings, notificationSchedules, deviceTokens, notificationJobs, notificationEvents] = await Promise.all([
    getNotificationStoreMappings(session),
    getNotificationSchedules(60),
    getDeviceTokens(2000),
    getNotificationJobs(240),
    getNotificationEvents(1000),
  ]);

  return scopedNotificationsData(session, notificationData({
    deviceTokens,
    notificationEvents,
    notificationJobs,
    notificationSchedules,
    storeMappings,
  }));
}

export async function getNotificationSendPageData(
  session: ConsoleSession,
): Promise<NotificationsPageData> {
  const [storeMappings, credentialSecrets, notificationSchedules, deviceTokens] = await Promise.all([
    getNotificationStoreMappings(session),
    getFirebaseCredentialSecrets(),
    getNotificationSchedules(60),
    getDeviceTokens(2000),
  ]);

  return scopedNotificationsData(session, notificationData({
    credentialSecrets,
    deviceTokens,
    notificationSchedules,
    storeMappings,
  }));
}

export async function getNotificationSchedulesPageData(
  session: ConsoleSession,
): Promise<NotificationsPageData> {
  const [storeMappings, notificationSchedules] = await Promise.all([
    getNotificationStoreMappings(session),
    getNotificationSchedules(120),
  ]);

  return scopedNotificationsData(session, notificationData({
    notificationSchedules,
    storeMappings,
  }));
}

export async function getNotificationHistoryPageData(
  session: ConsoleSession,
): Promise<NotificationsPageData> {
  const [storeMappings, notificationJobs, notificationEvents] = await Promise.all([
    getNotificationStoreMappings(session),
    getNotificationJobs(240),
    getNotificationEvents(1000),
  ]);

  return scopedNotificationsData(session, notificationData({
    notificationEvents,
    notificationJobs,
    storeMappings,
  }));
}

export async function getNotificationHistoryDetailPageData(
  jobId: string,
  session: ConsoleSession,
): Promise<NotificationsPageData> {
  const [storeMappings, notificationJobs, detailJob, recentEvents, detailEvents, deviceTokens] = await Promise.all([
    getNotificationStoreMappings(session),
    getNotificationJobs(120),
    getNotificationJobById(jobId),
    getNotificationEvents(500),
    getNotificationEventsForJob(jobId),
    getDeviceTokens(2000),
  ]);
  const jobs = detailJob && !notificationJobs.some((job) => job.id === detailJob.id)
    ? [detailJob, ...notificationJobs]
    : notificationJobs;
  const eventsById = new Map(
    [...detailEvents, ...recentEvents].map((event) => [event.id, event]),
  );

  return scopedNotificationsData(session, notificationData({
    deviceTokens,
    notificationEvents: Array.from(eventsById.values()),
    notificationJobs: jobs,
    storeMappings,
  }));
}

export async function getNotificationsPageData(
  session: ConsoleSession,
): Promise<NotificationsPageData> {
  const [
    storeMappings,
    credentialSecrets,
    notificationJobs,
    notificationSchedules,
    notificationEvents,
    deviceTokens,
  ] = await Promise.all([
    getNotificationStoreMappings(session),
    getFirebaseCredentialSecrets(),
    getNotificationJobs(240),
    getNotificationSchedules(60),
    getNotificationEvents(1000),
    getDeviceTokens(2000),
  ]);

  return scopedNotificationsData(session, {
    credentialSecrets,
    deviceTokens,
    notificationEvents,
    notificationJobs,
    notificationSchedules,
    storeMappings,
  });
}
