import type { StaffRole, TeamMember } from "@/lib/tracking/types";
import type { ManagedAccount, ManagedAppOption } from "./types";

export function accountFromTeamMember(user: TeamMember): ManagedAccount {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    authUserId: user.auth_user_id,
    role: user.role,
    globalAccess: user.global_access,
    appScope: user.app_scope ?? [],
    storeScope: user.store_scope ?? [],
    consoleStatus: user.status,
    authStatus: user.auth_user_id ? "confirmed" : "invited",
    lastLoginAt: user.last_login_at,
    lastActiveAt: user.last_active_at,
    createdAt: user.created_at,
  };
}

export function roleBadgeTone(role: StaffRole) {
  if (role === "Admin") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (role === "Dev") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function formatAccountDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clean(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function appOptionKeys(app: ManagedAppOption) {
  return [
    app.id,
    app.app_id,
    app.app_name,
    app.package_name,
    app.bundle_id,
    app.store_profile_id,
    app.store_account_name,
  ]
    .map(clean)
    .filter(Boolean);
}

export function accountInitials(account: ManagedAccount) {
  const source = account.name || account.email;
  const parts = source
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);

  return (parts[0]?.[0] ?? "U").concat(parts[1]?.[0] ?? "").toUpperCase();
}

export function appOptionLabel(app: ManagedAppOption) {
  return app.app_name || app.app_id || app.package_name || app.bundle_id || app.id;
}

export function appOptionIdentifier(app: ManagedAppOption) {
  return app.package_name || app.bundle_id || app.app_id || app.store_profile_id;
}

export function managedAppsForAccount(
  account: ManagedAccount,
  appOptions: ManagedAppOption[],
) {
  if (account.role === "Admin") return appOptions;

  const scope = new Set([
    ...account.appScope.map(clean),
    ...account.storeScope.map(clean),
  ].filter(Boolean));

  return appOptions.filter((app) =>
    appOptionKeys(app).some((key) => scope.has(key)),
  );
}

export function accountHasApp(
  account: ManagedAccount,
  app: ManagedAppOption,
) {
  if (account.role === "Admin") return true;
  const scope = new Set(account.appScope.map(clean).filter(Boolean));
  return appOptionKeys(app).some((key) => scope.has(key));
}

export function availabilityLabel(account: ManagedAccount) {
  if (account.consoleStatus === "active") return "Available";
  if (account.consoleStatus === "invited") return "Invited";
  if (account.consoleStatus === "suspended") return "Suspended";
  return "Offline";
}

export function availabilityBadgeTone(account: ManagedAccount) {
  if (account.consoleStatus === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (account.consoleStatus === "invited") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (account.consoleStatus === "suspended") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-muted bg-muted text-muted-foreground";
}

export function searchAccount(
  account: ManagedAccount,
  appOptions: ManagedAppOption[],
) {
  const appSearch = managedAppsForAccount(account, appOptions)
    .flatMap((app) => [
      app.app_name,
      app.app_id,
      app.package_name,
      app.bundle_id,
      app.store_account_name,
    ])
    .filter(Boolean);

  return [
    account.name,
    account.email,
    account.authUserId,
    account.role,
    account.consoleStatus,
    account.authStatus,
    ...appSearch,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isInactiveUser(account: ManagedAccount) {
  return account.consoleStatus === "disabled" || account.authStatus === "disabled";
}
