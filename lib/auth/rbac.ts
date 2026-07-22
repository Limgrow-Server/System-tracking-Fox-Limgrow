import type { StaffRole } from "@/lib/tracking/types";

export const consoleRoles = ["Admin", "Dev", "Marketing"] as const;

export type ConsoleSession = {
  authUserId: string;
  memberId: string;
  email: string;
  name: string;
  role: StaffRole;
  status: "active";
  globalAccess: boolean;
  appScope: string[];
  storeScope: string[];
};

export const routeRoles: Record<string, StaffRole[]> = {
  "/dashboard": ["Admin", "Dev", "Marketing"],
  "/store-mapping": ["Admin"],
  "/configs": ["Admin"],
  "/notifications/android/send": ["Admin"],
  "/notifications/ios/send": ["Admin"],
  "/notifications/send": ["Admin"],
  "/iap": ["Admin", "Dev", "Marketing"],
  "/notifications": ["Admin", "Dev", "Marketing"],
  "/comments": ["Admin", "Dev", "Marketing"],
  "/comments-schedule": ["Admin", "Dev", "Marketing"],
  "/review": ["Admin", "Dev", "Marketing"],
  "/reply": ["Admin", "Dev", "Marketing"],
  "/users": ["Admin"],
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && consoleRoles.includes(value as StaffRole);
}

export function routeRequiredRoles(pathname: string) {
  const normalized = pathname === "/" ? "/dashboard" : pathname;
  const match = Object.entries(routeRoles)
    .sort(([left], [right]) => right.length - left.length)
    .find(
      ([route]) => normalized === route || normalized.startsWith(`${route}/`),
    );

  return match?.[1] ?? null;
}

export function isConsolePath(pathname: string) {
  return Boolean(routeRequiredRoles(pathname));
}

export function canAccessPath(role: StaffRole, pathname: string) {
  const requiredRoles = routeRequiredRoles(pathname);
  return !requiredRoles || requiredRoles.includes(role);
}
