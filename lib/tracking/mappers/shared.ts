import type { Platform, StoreMapping } from "@/lib/tracking/types";

export function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function enumValue(value: unknown) {
  return String(value ?? "").toLowerCase();
}

export function sortByUpdatedAt<T extends { updated_at: string | null }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    return new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime();
  });
}

export function sortMappings(rows: StoreMapping[]) {
  return sortByUpdatedAt(rows);
}

export function platformFromStore(storePlatform: Platform): "android" | "ios" {
  return storePlatform === "google_play" ? "android" : "ios";
}
