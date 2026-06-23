import {
  clean,
  stringValue,
  type MobilePlatform,
} from "../_shared/edge-config.ts";
import type {
  LocaleNotificationInput,
  SendNotificationRequest,
  TargetType,
} from "../send-notification/notification-sender.ts";

const SCHEDULE_DATA_KEY = "__notificationSchedule";

export type ScheduleAutomation = {
  autoGenerateContent: boolean;
  generateNotes: string;
};

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeTargetType(value: unknown): TargetType {
  return clean(value) === "device" ? "device" : "topic";
}

function normalizePlatform(value: unknown): MobilePlatform | undefined {
  const platform = clean(value);
  return platform === "android" || platform === "ios" ? platform : undefined;
}

export function scheduleAutomation(row: Record<string, unknown>): ScheduleAutomation {
  const scheduleData = objectRecord(objectRecord(row.data_payload)[SCHEDULE_DATA_KEY]);
  const scheduleType = clean(row.schedule_type);
  return {
    autoGenerateContent: (scheduleType === "daily" || scheduleType === "monthly") && scheduleData.autoGenerateContent === true,
    generateNotes: clean(scheduleData.generateNotes),
  };
}

function scheduleDeliveryData(row: Record<string, unknown>) {
  const dataPayload = { ...objectRecord(row.data_payload) };
  delete dataPayload[SCHEDULE_DATA_KEY];
  return dataPayload;
}

export function scheduleToPayload(row: Record<string, unknown>): SendNotificationRequest {
  return {
    appId: clean(row.app_id) || clean(row.app_name),
    appName: clean(row.app_name),
    bundleId: stringValue(row.bundle_id) ?? undefined,
    credentialRef: stringValue(row.credential_ref) ?? undefined,
    data: scheduleDeliveryData(row),
    deviceIds: Array.isArray(row.target_values) ? row.target_values.map((item) => clean(item)).filter(Boolean) : [],
    imageUrl: stringValue(row.image_url) ?? undefined,
    notifications: Array.isArray(row.locale_payload) ? row.locale_payload as LocaleNotificationInput[] : [],
    packageName: stringValue(row.package_name) ?? undefined,
    platform: normalizePlatform(row.platform),
    productAppId: clean(row.app_id) || clean(row.app_name),
    scheduleId: clean(row.id),
    storeAccountName: stringValue(row.store_account_name) ?? undefined,
    storeProfileId: stringValue(row.store_profile_id) ?? undefined,
    targetType: normalizeTargetType(row.target_type),
    topicBase: clean(row.topic_base),
  };
}
