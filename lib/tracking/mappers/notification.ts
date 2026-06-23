import { iso } from "@/lib/tracking/mappers/shared";
import type {
  DeviceToken,
  NotificationEvent,
  NotificationJob,
  NotificationSchedule,
} from "@/lib/tracking/types";

import type {
  DeviceToken as DeviceTokenRecord,
  NotificationEvent as NotificationEventRecord,
  NotificationJob as NotificationJobRecord,
  NotificationSchedule as NotificationScheduleRecord,
} from "@prisma/client";

export function notificationJobToTracking(job: NotificationJobRecord): NotificationJob {
  return {
    id: job.id,
    schedule_id: job.scheduleId,
    platform: job.platform,
    store_platform: job.storePlatform,
    store_profile_id: job.storeProfileId,
    store_account_name: job.storeAccountName,
    app_mapping_id: job.appMappingId,
    app_id: job.appId,
    app_name: job.appName,
    package_name: job.packageName,
    bundle_id: job.bundleId,
    topic_base: job.topicBase,
    credential_ref: job.credentialRef,
    project_id: job.projectId,
    target_type: job.targetType,
    target_values: job.targetValues,
    title: job.title,
    message: job.message,
    image_url: job.imageUrl,
    data_payload: job.dataPayload,
    locale_payload: job.localePayload,
    status: job.status,
    sent_count: job.sentCount,
    error_count: job.errorCount,
    requested_by: job.requestedBy,
    sent_at: iso(job.sentAt),
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString(),
  };
}

export function notificationScheduleToTracking(schedule: NotificationScheduleRecord): NotificationSchedule {
  return {
    id: schedule.id,
    name: schedule.name,
    platform: schedule.platform,
    store_platform: schedule.storePlatform,
    store_profile_id: schedule.storeProfileId,
    store_account_name: schedule.storeAccountName,
    app_mapping_id: schedule.appMappingId,
    app_id: schedule.appId,
    app_name: schedule.appName,
    package_name: schedule.packageName,
    bundle_id: schedule.bundleId,
    topic_base: schedule.topicBase,
    credential_ref: schedule.credentialRef,
    project_id: schedule.projectId,
    target_type: schedule.targetType,
    target_values: schedule.targetValues,
    title: schedule.title,
    message: schedule.message,
    image_url: schedule.imageUrl,
    data_payload: schedule.dataPayload,
    locale_payload: schedule.localePayload,
    schedule_type: schedule.scheduleType,
    timezone: schedule.timezone,
    scheduled_at: iso(schedule.scheduledAt),
    time_of_day: schedule.timeOfDay,
    day_of_month: schedule.dayOfMonth,
    status: schedule.status,
    next_run_at: iso(schedule.nextRunAt),
    last_run_at: iso(schedule.lastRunAt),
    last_status: schedule.lastStatus,
    last_error: schedule.lastError,
    run_count: schedule.runCount,
    created_by: schedule.createdBy,
    created_at: schedule.createdAt.toISOString(),
    updated_at: schedule.updatedAt.toISOString(),
  };
}

export function notificationEventToTracking(event: NotificationEventRecord): NotificationEvent {
  return {
    id: event.id,
    notification_id: event.notificationId,
    job_id: event.jobId,
    event_type: event.eventType,
    device_id: event.deviceId,
    platform: event.platform,
    target_type: event.targetType,
    target_value: event.targetValue,
    status: event.status,
    provider_message_id: event.providerMessageId,
    error_code: event.errorCode,
    error_detail: event.errorDetail,
    metadata: event.metadata,
    created_at: event.createdAt.toISOString(),
  };
}

export function deviceTokenToTracking(device: DeviceTokenRecord): DeviceToken {
  return {
    id: device.id,
    user_id: device.userId,
    app_id: device.appId,
    device_id: device.deviceId,
    platform: device.platform,
    firebase_app_id: device.firebaseAppId,
    firebase_project_id: device.firebaseProjectId,
    app_version: device.appVersion,
    os_version: device.osVersion,
    locale: device.locale,
    status: device.status,
    last_seen_at: device.lastSeenAt.toISOString(),
    store_platform: device.storePlatform,
    store_account_name: device.storeAccountName,
    product_app_id: device.productAppId,
    package_name: device.packageName,
    bundle_id: device.bundleId,
    device_model: device.deviceModel,
    device_manufacturer: device.deviceManufacturer,
    created_at: device.createdAt.toISOString(),
    updated_at: device.updatedAt.toISOString(),
  };
}
