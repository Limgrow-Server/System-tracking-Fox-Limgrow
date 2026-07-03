import { redirect } from "next/navigation";
import { cache } from "react";

import { canAccessPath, type ConsoleSession, isStaffRole } from "@/lib/auth/rbac";
import { normalizeEmail, prismaRoleToStaffRole, prismaStatusToTeamMemberStatus } from "@/lib/auth/team-members";
import {
  getTeamMemberByAuthUserOrEmail,
  linkTeamMemberAuthUser,
} from "@/lib/server/repositories/auth/team-member.repository";
import { createClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/tracking/types";

function cleanClaimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveConsoleSession(): Promise<ConsoleSession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const authUserId = cleanClaimString(data?.claims?.sub);
  const email = normalizeEmail(data?.claims?.email);

  if (error || !authUserId || !email) {
    return null;
  }

  const member = await getTeamMemberByAuthUserOrEmail({
    authUserId,
    email,
  });

  if (!member || (member.authUserId && member.authUserId !== authUserId)) {
    return null;
  }

  const role = prismaRoleToStaffRole[member.role];
  const status = prismaStatusToTeamMemberStatus[member.status];

  if (status !== "active" || !isStaffRole(role)) {
    return null;
  }

  const linkedMember =
    member.authUserId === authUserId
      ? member
      : await linkTeamMemberAuthUser(member.id, authUserId);

  return {
    authUserId,
    memberId: linkedMember.id,
    email: linkedMember.email,
    role,
    name: linkedMember.name || linkedMember.email,
    status: "active",
    globalAccess: linkedMember.globalAccess,
    appScope: linkedMember.appScope,
    storeScope: linkedMember.storeScope,
  };
}

export const getConsoleSession = cache(resolveConsoleSession);

export async function requireConsoleSession(allowedRoles?: StaffRole[]) {
  const session = await getConsoleSession();

  if (!session) {
    redirect("/login");
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    redirect("/dashboard?access=denied");
  }

  return session;
}

export async function requireRouteAccess(pathname: string) {
  const session = await requireConsoleSession();

  if (!canAccessPath(session.role, pathname)) {
    redirect("/dashboard?access=denied");
  }

  return session;
}
