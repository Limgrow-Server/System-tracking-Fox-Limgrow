import type { StaffRole, TeamMember } from "@/lib/tracking/types";
import type { ManagedAccount } from "./types";

export function accountFromTeamMember(user: TeamMember): ManagedAccount {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    authUserId: user.auth_user_id,
    role: user.role,
    consoleStatus: user.status,
    authStatus: user.auth_user_id ? "confirmed" : "invited",
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

export function searchAccount(account: ManagedAccount) {
  return [
    account.name,
    account.email,
    account.authUserId,
    account.role,
    account.consoleStatus,
    account.authStatus,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isInactiveUser(account: ManagedAccount) {
  return account.consoleStatus === "disabled" || account.authStatus === "disabled";
}
