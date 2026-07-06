import "server-only";

import { randomUUID } from "crypto";
import type { NotificationSchedule, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendNotificationPayloadLocal, type LocaleNotificationInput, type SendNotificationRequest } from "@/lib/server/services/notifications/local-notification-sender.service";

const TITLE_MAX_LENGTH = 45;
const MESSAGE_MAX_LENGTH = 90;
const HCM_OFFSET_MINUTES = 7 * 60;
const SCHEDULE_DATA_KEY = "__notificationSchedule";

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

const FALLBACK_TEMPLATES = [
  { title: "Fresh update", message: "Open the app to see what is new today." },
  { title: "New things waiting", message: "Take a quick look at today's update." },
  { title: "Daily update", message: "Check in now for a fresh experience." },
  { title: "Worth a quick look", message: "Open the app for something new today." },
  { title: "New today", message: "See the latest update when you are ready." },
];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

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
  );
  if (!response.ok) throw new Error(`Google Translate fallback failed for ${topicCode}: ${response.status}`);

  const body = await response.json() as unknown;
  const segments = Array.isArray(body) && Array.isArray(body[0]) ? body[0] as unknown[] : [];
  const translated = segments
    .map((segment) => Array.isArray(segment) ? clean(segment[0]) : "")
    .join("");

  return translated || text;
}

function openRouterJsonShape() {
  const notifications = LANGUAGES.reduce<Record<string, { title: string; message: string }>>((items, language) => {
    items[language.topicCode] = { message: "...", title: "..." };
    return items;
  }, {});

  return JSON.stringify({ notifications });
}

function rowsFromOpenRouterJson(parsed: Record<string, unknown>) {
  const source = parsed.notifications ?? parsed;
  const record = source && typeof source === "object" && !Array.isArray(source) ? source as Record<string, unknown> : {};

  return LANGUAGES.map((language) => {
    const item = record[language.topicCode] as Record<string, unknown> | undefined;
    const title = limitText(clean(item?.title), TITLE_MAX_LENGTH);
    const message = limitText(clean(item?.message), MESSAGE_MAX_LENGTH);
    if (!title || !message) throw new Error(`Missing generated ${language.topicCode} copy`);
    return { message, title, topicCode: language.topicCode };
  });
}

async function openRouterGeneratedCopy(input: {
  appName: string;
  baseMessage: string;
  baseTitle: string;
  notes: string;
  now: Date;
  variantSeed: string;
}) {
  const apiKey = clean(process.env.OPENROUTER_API_KEY);
  if (!apiKey) return null;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      max_tokens: 1800,
      messages: [
        {
          content: "You write concise generic mobile push notifications. Return only valid JSON and no markdown.",
          role: "system",
        },
        {
          content: [
            "Generate fresh localized push notifications for today's scheduled send.",
            `Date: ${input.now.toISOString().slice(0, 10)}`,
            `Variation seed: ${input.variantSeed}`,
            input.appName ? `Display name context: ${input.appName}` : "",
            input.baseTitle ? `Fallback title: ${input.baseTitle}` : "",
            input.baseMessage ? `Fallback message: ${input.baseMessage}` : "",
            input.notes ? `Notes: ${input.notes}` : "",
            `Each title must be maximum ${TITLE_MAX_LENGTH} characters.`,
            `Each message must be maximum ${MESSAGE_MAX_LENGTH} characters.`,
            "Do not mention package name, bundle id, store name, or app id.",
            "Avoid fake discounts, false urgency, and unsupported claims.",
            "Every non-English locale must be written in that locale language, not English.",
            `Languages: ${LANGUAGES.map((language) => `${language.topicCode}=${language.label}`).join(", ")}`,
            "Return exactly this JSON shape with every language key:",
            openRouterJsonShape(),
          ].filter(Boolean).join("\n"),
          role: "user",
        },
      ],
      model: process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash",
      temperature: 0.9,
    }),
  });

  if (!response.ok) return null;

  const body = await response.json() as Record<string, unknown>;
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = clean(message?.content);
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  try {
    return rowsFromOpenRouterJson(JSON.parse(content.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function fallbackGeneratedCopy(input: {
  appName: string;
  now: Date;
  variantSeed: string;
}) {
  const appLabel = input.appName || "the app";
  const dynamicTemplates = [
    ...FALLBACK_TEMPLATES,
    { title: "Quick update", message: `Open ${appLabel} when you have a moment.` },
    { title: "Ready when you are", message: `Open ${appLabel} to continue where you left off.` },
    { title: "Small update", message: "There is something new to explore today." },
  ];
  const daySeed = Math.floor(input.now.getTime() / 86_400_000);
  const textSeed = Array.from(input.variantSeed).reduce((total, character) => total + character.charCodeAt(0), 0);
  const template = dynamicTemplates[(daySeed + textSeed) % dynamicTemplates.length];

  return Promise.all(
    LANGUAGES.map(async (language) => {
      if (language.topicCode === "en") {
        return {
          message: template.message,
          title: template.title,
          topicCode: language.topicCode,
        };
      }

      try {
        return {
          message: limitText(await translateGeneratedText(template.message, language.topicCode), MESSAGE_MAX_LENGTH),
          title: limitText(await translateGeneratedText(template.title, language.topicCode), TITLE_MAX_LENGTH),
          topicCode: language.topicCode,
        };
      } catch {
        return {
          message: template.message,
          title: template.title,
          topicCode: language.topicCode,
        };
      }
    }),
  );
}

function scheduleAutomation(row: NotificationSchedule) {
  const scheduleData = objectRecord(objectRecord(row.dataPayload)[SCHEDULE_DATA_KEY]);
  return {
    autoGenerateContent: (row.scheduleType === "daily" || row.scheduleType === "monthly") && scheduleData.autoGenerateContent === true,
    generateNotes: clean(scheduleData.generateNotes),
  };
}

function scheduleDeliveryData(row: NotificationSchedule) {
  const dataPayload = { ...objectRecord(row.dataPayload) };
  delete dataPayload[SCHEDULE_DATA_KEY];
  return dataPayload;
}

function scheduleToPayload(row: NotificationSchedule): SendNotificationRequest {
  return {
    appId: clean(row.appId) || clean(row.appName),
    appName: clean(row.appName),
    bundleId: row.bundleId,
    credentialRef: row.credentialRef,
    data: scheduleDeliveryData(row),
    deviceIds: row.targetValues,
    imageUrl: row.imageUrl,
    notifications: Array.isArray(row.localePayload) ? row.localePayload : [],
    packageName: row.packageName,
    platform: row.platform,
    productAppId: clean(row.appId) || clean(row.appName),
    scheduleId: row.id,
    storeAccountName: row.storeAccountName,
    storeProfileId: row.storeProfileId,
    targetType: clean(row.targetType) === "device" ? "device" : "topic",
    topicBase: clean(row.topicBase),
  };
}

function primaryGeneratedNotification(rows: LocaleNotificationInput[]) {
  return rows.find((row) => clean(row.topicCode) === "en") ?? rows[0] ?? null;
}

async function prepareSchedulePayload(
  row: NotificationSchedule,
  payload: SendNotificationRequest,
  now: Date,
) {
  const automation = scheduleAutomation(row);
  if (!automation.autoGenerateContent) {
    return { generatedNotifications: null, payload };
  }

  const appName = clean(row.appName);
  const variantSeed = [
    clean(row.id),
    clean(row.appId),
    appName,
    String(row.runCount ?? ""),
    now.toISOString(),
    randomUUID(),
  ].filter(Boolean).join(":");

  const generatedNotifications = await openRouterGeneratedCopy({
    appName,
    baseMessage: clean(row.message),
    baseTitle: clean(row.title),
    notes: automation.generateNotes,
    now,
    variantSeed,
  }) ?? await fallbackGeneratedCopy({ appName, now, variantSeed });

  return {
    generatedNotifications,
    payload: {
      ...payload,
      notifications: generatedNotifications,
    },
  };
}

function parseTimeOfDay(value: unknown) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 9, minute: 0 };

  return {
    hour: Math.min(23, Math.max(0, Number(match[1]))),
    minute: Math.min(59, Math.max(0, Number(match[2]))),
  };
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

function nextDailyRun(timeOfDay: string | null, now: Date) {
  const time = parseTimeOfDay(timeOfDay);
  const current = hcmParts(now);
  let candidate = hcmDate(current.year, current.month, current.date, time.hour, time.minute);
  if (candidate <= now) {
    candidate = hcmDate(current.year, current.month, current.date + 1, time.hour, time.minute);
  }
  return candidate;
}

function nextMonthlyRun(dayOfMonth: number | null, timeOfDay: string | null, now: Date) {
  const time = parseTimeOfDay(timeOfDay);
  const current = hcmParts(now);
  const targetDay = Math.min(Math.max(dayOfMonth ?? 1, 1), 31);
  let day = Math.min(targetDay, daysInMonth(current.year, current.month));
  let candidate = hcmDate(current.year, current.month, day, time.hour, time.minute);

  if (candidate <= now) {
    const nextMonth = current.month + 1;
    day = Math.min(targetDay, daysInMonth(current.year, nextMonth));
    candidate = hcmDate(current.year, nextMonth, day, time.hour, time.minute);
  }

  return candidate;
}

function nextRunAfter(row: NotificationSchedule, now: Date) {
  if (row.scheduleType === "daily") return nextDailyRun(row.timeOfDay, now);
  if (row.scheduleType === "monthly") return nextMonthlyRun(row.dayOfMonth, row.timeOfDay, now);
  return null;
}

export async function dispatchDueNotificationsOnServer(input: {
  actorEmail: string;
  limit?: number;
  now?: string;
  scheduleId?: string;
}) {
  const now = input.now ? new Date(input.now) : new Date();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const schedules = await prisma.notificationSchedule.findMany({
    where: clean(input.scheduleId)
      ? { id: clean(input.scheduleId) }
      : { nextRunAt: { lte: now }, status: "active" },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });
  const dispatched = [];

  for (const schedule of schedules) {
    const prepared = await prepareSchedulePayload(schedule, scheduleToPayload(schedule), now);
    const result = await sendNotificationPayloadLocal(prepared.payload, input.actorEmail);
    const hasErrors = Number(result.errorCount ?? 0) > 0;
    const hasSent = Number(result.sentCount ?? 0) > 0;
    const failed = hasErrors && !hasSent;

    if (hasErrors) {
      console.error("[notification-dispatcher] scheduled notification completed with failed targets", {
        errorCount: result.errorCount,
        firstError: result.results.find((item) => !item.ok)?.error ?? null,
        jobId: result.job?.id ?? null,
        scheduleId: schedule.id,
        sentCount: result.sentCount,
      });
    }

    const nextRunAt = nextRunAfter(schedule, now);
    const nextStatus =
      schedule.scheduleType === "once"
        ? failed ? "failed" : "completed"
        : schedule.status === "paused" ? "paused" : "active";
    const lastError = result.results.find((item) => !item.ok)?.error ?? null;
    const primaryGenerated = prepared.generatedNotifications
      ? primaryGeneratedNotification(prepared.generatedNotifications)
      : null;
    const updatePayload: Prisma.NotificationScheduleUpdateInput = {
      lastError,
      lastRunAt: now,
      lastStatus: hasSent ? "sent" : "failed",
      nextRunAt,
      runCount: schedule.runCount + 1,
      status: nextStatus,
      updatedAt: new Date(),
    };

    if (prepared.generatedNotifications) {
      updatePayload.localePayload = prepared.generatedNotifications as unknown as Prisma.InputJsonValue;
      updatePayload.message = clean(primaryGenerated?.message) || null;
      updatePayload.title = clean(primaryGenerated?.title) || null;
    }

    await prisma.notificationSchedule.update({
      where: { id: schedule.id },
      data: updatePayload,
    });

    dispatched.push({
      errorCount: result.errorCount,
      job: result.job,
      scheduleId: schedule.id,
      sentCount: result.sentCount,
      status: hasSent ? "sent" : "failed",
    });
  }

  return {
    dispatched,
    now: now.toISOString(),
    total: dispatched.length,
  };
}
