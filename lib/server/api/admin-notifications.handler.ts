import "server-only";

import { createHash, randomUUID } from "crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/server/api/auth";
import { badRequest, ApiError } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { createClient } from "@/lib/supabase/server";
import {
  deviceTokenToTracking,
  notificationScheduleToTracking,
} from "@/lib/tracking/mappers/notification";

const LANGUAGES = [
  { topicCode: "zh", label: "Chinese" },
  { topicCode: "hi", label: "Hindi" },
  { topicCode: "es", label: "Spanish" },
  { topicCode: "fa", label: "Persian" },
  { topicCode: "ar", label: "Arabic" },
  { topicCode: "tr", label: "Turkish" },
  { topicCode: "fr", label: "French" },
  { topicCode: "bn", label: "Bengali" },
  { topicCode: "en", label: "English" },
  { topicCode: "pt", label: "Portuguese" },
  { topicCode: "sw", label: "Swahili" },
  { topicCode: "in", label: "Indonesian" },
  { topicCode: "it", label: "Italian" },
  { topicCode: "ja", label: "Japanese" },
  { topicCode: "de", label: "German" },
  { topicCode: "pa", label: "Punjabi" },
] as const;

const TITLE_MAX_LENGTH = 45;
const MESSAGE_MAX_LENGTH = 90;
const HCM_OFFSET_MINUTES = 7 * 60;

function supabaseFunctionUrl(functionName: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!supabaseUrl) throw badRequest("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => clean(item)).filter(Boolean)));
}

function jsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function topicSegment(value: unknown) {
  return clean(value)
    .replace(/^\/topics\//i, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9\-_.~%]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseTimeOfDay(value: unknown) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw badRequest("Time must use HH:mm format.");

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw badRequest("Time must use HH:mm format.");
  }

  return { hour, minute };
}

function hcmParts(date: Date) {
  const shifted = new Date(date.getTime() + HCM_OFFSET_MINUTES * 60_000);
  return {
    date: shifted.getUTCDate(),
    month: shifted.getUTCMonth(),
    year: shifted.getUTCFullYear(),
  };
}

function hcmDate(year: number, month: number, date: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month, date, hour, minute) - HCM_OFFSET_MINUTES * 60_000);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function nextDailyRun(timeOfDay: string, now = new Date()) {
  const time = parseTimeOfDay(timeOfDay);
  const current = hcmParts(now);
  let candidate = hcmDate(current.year, current.month, current.date, time.hour, time.minute);
  if (candidate <= now) {
    candidate = hcmDate(current.year, current.month, current.date + 1, time.hour, time.minute);
  }
  return candidate;
}

function nextMonthlyRun(dayOfMonth: number, timeOfDay: string, now = new Date()) {
  const time = parseTimeOfDay(timeOfDay);
  const current = hcmParts(now);
  const targetDay = Math.min(Math.max(dayOfMonth, 1), 31);
  let day = Math.min(targetDay, daysInMonth(current.year, current.month));
  let candidate = hcmDate(current.year, current.month, day, time.hour, time.minute);

  if (candidate <= now) {
    const nextMonth = current.month + 1;
    day = Math.min(targetDay, daysInMonth(current.year, nextMonth));
    candidate = hcmDate(current.year, nextMonth, day, time.hour, time.minute);
  }

  return candidate;
}

function onceRunAt(payload: Record<string, unknown>) {
  const date = clean(payload.scheduledDate);
  const time = clean(payload.timeOfDay || payload.scheduledTime);
  if (!date) throw badRequest("Scheduled date is required.");
  const parsedTime = parseTimeOfDay(time || "09:00");
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw badRequest("Scheduled date must use YYYY-MM-DD format.");
  return hcmDate(year, month - 1, day, parsedTime.hour, parsedTime.minute);
}

function nextRunAtForPayload(payload: Record<string, unknown>) {
  const scheduleType = clean(payload.scheduleType);
  const timeOfDay = clean(payload.timeOfDay || payload.scheduledTime) || "09:00";

  if (scheduleType === "daily") return nextDailyRun(timeOfDay);
  if (scheduleType === "monthly") return nextMonthlyRun(Number(payload.dayOfMonth ?? 1), timeOfDay);
  return onceRunAt(payload);
}

function normalizedNotifications(value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  const notifications = rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        enabled: record.enabled !== false,
        message: clean(record.message),
        title: clean(record.title),
        topicCode: topicSegment(record.topicCode || record.languageCode).toLowerCase(),
      };
    })
    .filter((row) => row.enabled && row.title && row.message && row.topicCode);

  if (!notifications.length) {
    throw badRequest("At least one notification language is required.");
  }

  return notifications;
}

function primaryNotification(notifications: ReturnType<typeof normalizedNotifications>) {
  return notifications.find((notification) => notification.topicCode === "en") ?? notifications[0];
}

async function currentAccessToken() {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw badRequest("A valid Supabase Auth session is required to call Edge Functions.");
  }

  return session.access_token;
}

async function callEdgeFunction(functionName: string, body: Record<string, unknown>) {
  const accessToken = await currentAccessToken();
  const response = await fetch(supabaseFunctionUrl(functionName), {
    method: "POST",
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    result?: unknown;
  };

  if (!response.ok || !payload.ok) {
    throw new ApiError(payload.error ?? `${functionName} failed.`, response.status);
  }

  return payload.result as Record<string, unknown>;
}

export async function handleAdminNotificationSendPost(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<Record<string, unknown>>(request);
    return okJson({
      message: "Notification sent.",
      result: await callEdgeFunction("send-notification", payload),
    });
  } catch (error) {
    return errorJson(error, "Send notification failed.");
  }
}

type GeneratedNotification = {
  message: string;
  title: string;
  topicCode: string;
};

const SCRIPT_CHECKS: Record<string, RegExp> = {
  ar: /[\u0600-\u06ff]/,
  bn: /[\u0980-\u09ff]/,
  fa: /[\u0600-\u06ff]/,
  hi: /[\u0900-\u097f]/,
  ja: /[\u3040-\u30ff\u3400-\u9fff]/,
  pa: /[\u0a00-\u0a7f]/,
  zh: /[\u3400-\u9fff]/,
};

function limitText(value: string, maxLength: number) {
  return Array.from(clean(value)).slice(0, maxLength).join("").trim();
}

function translateLanguageCode(topicCode: string) {
  return topicCode === "in" ? "id" : topicCode;
}

async function translateGeneratedText(text: string, topicCode: string) {
  if (!text || topicCode === "en") return text;

  const response = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${translateLanguageCode(topicCode)}&dt=t&q=${encodeURIComponent(text)}`,
    { cache: "no-store" }
  );
  if (!response.ok) throw new Error(`Google Translate fallback failed for ${topicCode}: ${response.status}`);

  const body = (await response.json()) as unknown;
  const segments = Array.isArray(body) && Array.isArray(body[0]) ? body[0] as unknown[] : [];
  const translated = segments
    .map((segment) => Array.isArray(segment) ? clean(segment[0]) : "")
    .join("");

  return translated || text;
}

function hasExpectedLocaleSignal(topicCode: string, notification: GeneratedNotification) {
  const check = SCRIPT_CHECKS[topicCode];
  if (!check) return true;
  return check.test(`${notification.title} ${notification.message}`);
}

async function ensureLocalizedNotification(notification: GeneratedNotification) {
  const limited = {
    message: limitText(notification.message, 90),
    title: limitText(notification.title, 45),
    topicCode: notification.topicCode,
  };

  if (limited.topicCode === "en" || hasExpectedLocaleSignal(limited.topicCode, limited)) {
    return limited;
  }

  try {
    return {
      message: limitText(await translateGeneratedText(limited.message, limited.topicCode), 90),
      title: limitText(await translateGeneratedText(limited.title, limited.topicCode), 45),
      topicCode: limited.topicCode,
    };
  } catch {
    return limited;
  }
}

function openRouterJsonShape() {
  const notifications = LANGUAGES.reduce<Record<string, { title: string; message: string }>>((items, language) => {
    items[language.topicCode] = { message: "...", title: "..." };
    return items;
  }, {});

  return JSON.stringify({ notifications });
}

function generatedRowsFromParsed(parsed: Record<string, unknown>) {
  const source = parsed.notifications ?? parsed;

  if (Array.isArray(source)) {
    return normalizedNotifications(source);
  }

  const record = source && typeof source === "object" ? source as Record<string, unknown> : {};
  return LANGUAGES.map((language) => {
    const item = record[language.topicCode] as Record<string, unknown> | undefined;
    const title = clean(item?.title);
    const message = clean(item?.message);
    if (!title || !message) {
      throw new Error(`OpenRouter response is missing ${language.topicCode} title/message.`);
    }

    return {
      message: limitText(message, MESSAGE_MAX_LENGTH),
      title: limitText(title, TITLE_MAX_LENGTH),
      topicCode: language.topicCode,
    };
  });
}

async function fallbackGeneratedCopy(input: {
  appName: string;
  intent?: string;
  message: string;
  notes: string;
  title: string;
  variantSeed?: string;
}) {
  const appLabel = input.appName && !["app", "the app"].includes(input.appName.toLowerCase()) ? input.appName : "the app";
  const templates = [
    { title: "Fresh update", message: `Open ${appLabel} for something new today.` },
    { title: "New things waiting", message: `Take a quick look at what is new.` },
    { title: "Quick update", message: `Open ${appLabel} when you have a moment.` },
    { title: "New today", message: `See the latest update when you are ready.` },
    { title: "Worth a look", message: `Check in now for a fresh experience.` },
    { title: "Small update", message: `There is something new to explore today.` },
    { title: "Ready when you are", message: `Open ${appLabel} to continue where you left off.` },
  ];
  const seedSource = input.variantSeed || `${Date.now()}-${Math.random()}`;
  const seed = Array.from(seedSource).reduce((total, character) => total + character.charCodeAt(0), 0);
  const template = templates[seed % templates.length];
  const shouldTranslateOnly = clean(input.intent) === "translate";
  const baseTitle = limitText(shouldTranslateOnly ? input.title || template.title : template.title, TITLE_MAX_LENGTH);
  const baseMessage = limitText(shouldTranslateOnly ? input.message || template.message : template.message, MESSAGE_MAX_LENGTH);

  return Promise.all(
    LANGUAGES.map(async (language) => {
      if (language.topicCode === "en") {
        return {
          message: baseMessage,
          title: baseTitle,
          topicCode: language.topicCode,
        };
      }

      try {
        return {
          message: limitText(await translateGeneratedText(baseMessage, language.topicCode), MESSAGE_MAX_LENGTH),
          title: limitText(await translateGeneratedText(baseTitle, language.topicCode), TITLE_MAX_LENGTH),
          topicCode: language.topicCode,
        };
      } catch {
        return {
          message: baseMessage,
          title: baseTitle,
          topicCode: language.topicCode,
        };
      }
    })
  );
}

async function openRouterGeneratedCopy(input: {
  appName: string;
  intent?: string;
  message: string;
  notes: string;
  title: string;
  variantSeed?: string;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "You write very concise mobile push notifications. Return only valid JSON and no markdown.",
        },
        {
          role: "user",
          content: [
            clean(input.intent) === "translate"
              ? "Translate the provided push notification into every requested language."
              : "Create fresh localized push notifications for a mobile app.",
            input.variantSeed ? `Variation seed: ${input.variantSeed}` : "",
            input.appName && !["app", "the app"].includes(input.appName.toLowerCase()) ? `Display name context: ${input.appName}` : "",
            input.title ? `Seed title: ${input.title}` : "",
            input.message ? `Seed message: ${input.message}` : "",
            input.notes ? `Additional notes: ${input.notes}` : "",
            "Create one title and one message for each requested language.",
            `Each title must be maximum ${TITLE_MAX_LENGTH} characters.`,
            `Each message must be maximum ${MESSAGE_MAX_LENGTH} characters.`,
            "Each message must be one short sentence.",
            "Use 6-10 words where possible.",
            "Do not use more than one comma in a message.",
            "Do not mention package name, bundle id, store name, or app id.",
            "Avoid fake discounts, false urgency, and unsupported claims.",
            "Use natural language for each locale.",
            "Every non-English locale must be written in that locale language, not English.",
            "For zh use Chinese characters. For hi use Devanagari. For ar/fa use Arabic script. For bn use Bengali. For ja use Japanese. For pa use Gurmukhi.",
            `Languages: ${LANGUAGES.map((language) => `${language.topicCode}=${language.label}`).join(", ")}`,
            "Return exactly this JSON shape with every language key:",
            openRouterJsonShape(),
          ].filter(Boolean).join("\n"),
        },
      ],
      max_tokens: 1800,
      temperature: 0.85,
    }),
  });

  if (!response.ok) return null;

  const body = (await response.json()) as Record<string, unknown>;
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = clean(message?.content);
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  try {
    const parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    const notifications = generatedRowsFromParsed(parsed);
    return notifications.length ? Promise.all(notifications.map(ensureLocalizedNotification)) : null;
  } catch {
    return null;
  }
}

export async function handleAdminNotificationGeneratePost(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<Record<string, unknown>>(request);
    const appName = clean(payload.appName) || "App";
    const intent = clean(payload.intent) === "translate" ? "translate" : "generate";
    const notes = clean(payload.notes);
    const title = clean(payload.title);
    const message = clean(payload.message);
    const variantSeed = clean(payload.variantSeed) || `${Date.now()}-${randomUUID()}`;
    const generated = await openRouterGeneratedCopy({ appName, intent, message, notes, title, variantSeed });

    return okJson({
      notifications: generated ?? await fallbackGeneratedCopy({ appName, intent, message, notes, title, variantSeed }),
      provider: generated ? "openrouter" : "fallback",
    });
  } catch (error) {
    return errorJson(error, "Generate notifications failed.");
  }
}

export async function handleAdminNotificationSchedulesPost(request: Request) {
  try {
    const admin = await requireAdminSession();
    const payload = await parseJsonBody<Record<string, unknown>>(request);
    const notifications = normalizedNotifications(payload.notifications);
    const scheduleType = clean(payload.scheduleType);
    if (!["once", "daily", "monthly"].includes(scheduleType)) {
      throw badRequest("Schedule type must be once, daily or monthly.");
    }

    const targetType = clean(payload.targetType) === "device" ? "device" : "topic";
    const targetValues = targetType === "device"
      ? stringArray(payload.deviceIds || payload.targetValues)
      : notifications.map((item) => `${topicSegment(payload.topicBase)}-${item.topicCode}`);
    if (targetType === "device" && !targetValues.length) {
      throw badRequest("At least one device id is required for device targeting.");
    }

    const firstNotification = primaryNotification(notifications);
    const schedule = await prisma.notificationSchedule.create({
      data: {
        appId: clean(payload.appId) || clean(payload.productAppId) || clean(payload.appName) || null,
        appName: clean(payload.appName) || clean(payload.productAppId) || "unknown_app",
        bundleId: clean(payload.bundleId) || null,
        credentialRef: clean(payload.credentialRef) || null,
        createdBy: admin.email,
        dataPayload: jsonObject(payload.data) as Prisma.InputJsonValue,
        dayOfMonth: scheduleType === "monthly" ? Number(payload.dayOfMonth ?? 1) : null,
        imageUrl: clean(payload.imageUrl) || null,
        localePayload: notifications as Prisma.InputJsonValue,
        message: firstNotification.message,
        name: clean(payload.name) || `${clean(payload.appName) || "Notification"} ${scheduleType}`,
        nextRunAt: nextRunAtForPayload(payload),
        packageName: clean(payload.packageName) || null,
        platform: clean(payload.platform) || "android",
        scheduleType,
        scheduledAt: scheduleType === "once" ? onceRunAt(payload) : null,
        status: "active",
        storeAccountName: clean(payload.storeAccountName) || null,
        storePlatform: clean(payload.storePlatform) || null,
        storeProfileId: clean(payload.storeProfileId) || null,
        targetType,
        targetValues,
        timeOfDay: scheduleType === "once" ? clean(payload.scheduledTime || payload.timeOfDay) || "09:00" : clean(payload.timeOfDay) || "09:00",
        title: firstNotification.title,
        topicBase: topicSegment(payload.topicBase) || clean(payload.appName) || "notification",
      },
    });

    return okJson({
      message: "Notification schedule saved.",
      schedule: notificationScheduleToTracking(schedule),
    });
  } catch (error) {
    return errorJson(error, "Save notification schedule failed.");
  }
}

export async function handleAdminNotificationSchedulesPatch(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<Record<string, unknown>>(request);
    const id = clean(payload.id);
    const status = clean(payload.status);
    if (!id) throw badRequest("Schedule id is required.");

    const updatePayload: Prisma.NotificationScheduleUpdateInput = {};
    if (status) {
      if (!["active", "paused"].includes(status)) throw badRequest("Schedule status must be active or paused.");
      updatePayload.status = status;
    }
    if ("scheduleType" in payload) {
      const scheduleType = clean(payload.scheduleType);
      if (!["once", "daily", "monthly"].includes(scheduleType)) {
        throw badRequest("Schedule type must be once, daily or monthly.");
      }
      const timeOfDay = clean(payload.timeOfDay || payload.scheduledTime) || "09:00";
      const dayOfMonth = Math.min(31, Math.max(1, Number(payload.dayOfMonth ?? 1) || 1));
      const schedulePayload = {
        ...payload,
        dayOfMonth,
        scheduleType,
        timeOfDay,
      };
      updatePayload.dayOfMonth = scheduleType === "monthly" ? dayOfMonth : null;
      updatePayload.nextRunAt = nextRunAtForPayload(schedulePayload);
      updatePayload.scheduledAt = scheduleType === "once" ? onceRunAt(schedulePayload) : null;
      updatePayload.scheduleType = scheduleType;
      updatePayload.timeOfDay = timeOfDay;
    }
    if ("notifications" in payload) {
      const notifications = normalizedNotifications(payload.notifications);
      const firstNotification = primaryNotification(notifications);
      updatePayload.localePayload = notifications as Prisma.InputJsonValue;
      updatePayload.message = firstNotification.message;
      updatePayload.title = firstNotification.title;
    }
    if ("data" in payload) {
      updatePayload.dataPayload = jsonObject(payload.data) as Prisma.InputJsonValue;
    }
    if (!Object.keys(updatePayload).length) {
      throw badRequest("No schedule changes were provided.");
    }

    const schedule = await prisma.notificationSchedule.update({
      where: { id },
      data: updatePayload,
    });

    return okJson({
      message: status ? `Schedule ${status}.` : "Schedule updated.",
      schedule: notificationScheduleToTracking(schedule),
    });
  } catch (error) {
    return errorJson(error, "Update notification schedule failed.");
  }
}

export async function handleAdminNotificationSchedulesDelete(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<Record<string, unknown>>(request);
    const id = clean(payload.id);
    if (!id) throw badRequest("Schedule id is required.");

    await prisma.notificationSchedule.delete({ where: { id } });

    return okJson({
      deleted: id,
      message: "Schedule deleted.",
    });
  } catch (error) {
    return errorJson(error, "Delete notification schedule failed.");
  }
}

export async function handleAdminNotificationDispatchPost(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<Record<string, unknown>>(request);
    return okJson({
      message: "Dispatcher finished.",
      result: await callEdgeFunction("dispatch-notifications", payload),
    });
  } catch (error) {
    return errorJson(error, "Dispatch notifications failed.");
  }
}

export async function handleAdminNotificationTestDevicePost(request: Request) {
  try {
    await requireAdminSession();
    const payload = await parseJsonBody<Record<string, unknown>>(request);
    const platform = clean(payload.platform) || "android";
    const deviceId = clean(payload.deviceId) || `test-device-${Date.now().toString(36)}`;
    const appId = clean(payload.appId) || clean(payload.appName) || clean(payload.productAppId) || "test-app";
    const fakeToken = `test-fcm-token-${deviceId}`;
    const tokenHash = createHash("sha256").update(fakeToken).digest("hex");

    const device = await prisma.deviceToken.upsert({
      where: { tokenHash },
      create: {
        appId,
        bundleId: platform === "ios" ? clean(payload.bundleId) || null : null,
        deviceId,
        fcmToken: fakeToken,
        locale: "en",
        packageName: platform === "android" ? clean(payload.packageName) || null : null,
        platform,
        productAppId: clean(payload.productAppId) || appId,
        status: "active",
        storeAccountName: clean(payload.storeAccountName) || null,
        storePlatform: clean(payload.storePlatform) || null,
        tokenHash,
        userId: `test:${deviceId}`,
      },
      update: {
        appId,
        bundleId: platform === "ios" ? clean(payload.bundleId) || null : null,
        locale: "en",
        packageName: platform === "android" ? clean(payload.packageName) || null : null,
        productAppId: clean(payload.productAppId) || appId,
        status: "active",
        storeAccountName: clean(payload.storeAccountName) || null,
        storePlatform: clean(payload.storePlatform) || null,
      },
    });

    return okJson({
      device: deviceTokenToTracking(device),
      message: "Test device created. Its fake FCM token is expected to fail at FCM and produce an error log.",
    });
  } catch (error) {
    return errorJson(error, "Create test device failed.");
  }
}
