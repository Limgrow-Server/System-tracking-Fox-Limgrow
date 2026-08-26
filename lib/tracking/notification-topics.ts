export const NOTIFICATION_TOPIC_SCHEMA_VERSION = 1;
export const NOTIFICATION_TOPIC_FALLBACK_LOCALE = "en";

export const NOTIFICATION_TOPIC_LOCALES = [
  "ar",
  "bn",
  "de",
  "en",
  "es",
  "fa",
  "fr",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "pa",
  "pt",
  "sw",
  "th",
  "tr",
  "vi",
  "zh",
  "zh-cn",
  "zh-tw",
] as const;

const supportedLocales = new Set<string>(NOTIFICATION_TOPIC_LOCALES);

export function notificationTopicSegment(value: unknown) {
  return (typeof value === "string" ? value : "")
    .trim()
    .replace(/^\/topics\//i, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9\-_.~%]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function canonicalNotificationLocale(value: unknown) {
  const normalized = (typeof value === "string" ? value : "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/^in(?=-|$)/, "id");

  if (supportedLocales.has(normalized)) return normalized;

  const baseLocale = normalized.split("-")[0];

  return supportedLocales.has(baseLocale)
    ? baseLocale
    : NOTIFICATION_TOPIC_FALLBACK_LOCALE;
}

export function notificationTopicBase(appMappingId: unknown) {
  const mappingKey = notificationTopicSegment(appMappingId).toLowerCase();
  if (!mappingKey) throw new Error("notification_app_mapping_id_required");
  return `ntf-v${NOTIFICATION_TOPIC_SCHEMA_VERSION}-${mappingKey}`;
}

export function notificationTopicName(appMappingId: unknown, locale: unknown) {
  return `${notificationTopicBase(appMappingId)}-lang-${canonicalNotificationLocale(locale)}`;
}

export function notificationTopicNameFromBase(topicBase: unknown, locale: unknown) {
  const base = notificationTopicSegment(topicBase);
  if (!base) throw new Error("notification_topic_base_required");
  return `${base}-lang-${canonicalNotificationLocale(locale)}`;
}
