import type { NumberLike, Platform } from "@/lib/tracking/types";

export function toNumber(value: NumberLike) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compactNumber(value: NumberLike) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toNumber(value));
}

export function money(value: NumberLike, currency = "USD") {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

export function microsToMoney(value: NumberLike, currency = "USD") {
  return money(toNumber(value) / 1000000, currency);
}

export function percent(value: number) {
  return `${Math.round(value)}%`;
}

export function dateTime(value: string | null) {
  if (!value) {
    return "No data";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function platformLabel(platform: Platform | string | null) {
  if (platform === "google_play") {
    return "Google Play";
  }

  if (platform === "apple_app_store") {
    return "App Store";
  }

  return platform ?? "Unknown";
}
