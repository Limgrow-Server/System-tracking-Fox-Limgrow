import { clean } from "../_shared/edge-config.ts";
import type {
  LocaleNotificationInput,
  SendNotificationRequest,
} from "../send-notification/notification-sender.ts";
import { scheduleAutomation } from "./notification-schedule-payload.ts";

const TITLE_MAX_LENGTH = 45;
const MESSAGE_MAX_LENGTH = 90;

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
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return null;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENROUTER_MODEL") ?? "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "You write concise generic mobile push notifications. Return only valid JSON and no markdown.",
        },
        {
          role: "user",
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
        },
      ],
      max_tokens: 1800,
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

export function primaryGeneratedNotification(rows: LocaleNotificationInput[]) {
  return rows.find((row) => clean(row.topicCode) === "en") ?? rows[0] ?? null;
}

export async function prepareSchedulePayload(
  row: Record<string, unknown>,
  payload: SendNotificationRequest,
  now: Date,
) {
  const automation = scheduleAutomation(row);
  if (!automation.autoGenerateContent) {
    return { generatedNotifications: null, payload };
  }

  const appName = clean(row.app_name);
  const variantSeed = [
    clean(row.id),
    clean(row.app_id),
    appName,
    String(row.run_count ?? ""),
    now.toISOString(),
    crypto.randomUUID(),
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
