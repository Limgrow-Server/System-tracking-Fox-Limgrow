import {
  clean,
  stringValue,
} from "../_shared/edge-config.ts";

const HCM_OFFSET_MINUTES = 7 * 60;

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

export function nextRunAfter(row: Record<string, unknown>, now: Date) {
  const scheduleType = clean(row.schedule_type);
  if (scheduleType === "daily") return nextDailyRun(stringValue(row.time_of_day), now);
  if (scheduleType === "monthly") return nextMonthlyRun(Number(row.day_of_month ?? 1), stringValue(row.time_of_day), now);
  return null;
}
