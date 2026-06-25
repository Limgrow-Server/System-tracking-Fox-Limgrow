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

async function resolveConsoleSession(): Promise<ConsoleSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id || !user.email) {
    return null;
  }

  const email = normalizeEmail(user.email);
  const member = await getTeamMemberByAuthUserOrEmail({
    authUserId: user.id,
    email,
  });

  if (!member || (member.authUserId && member.authUserId !== user.id)) {
    return null;
  }

  const role = prismaRoleToStaffRole[member.role];
  const status = prismaStatusToTeamMemberStatus[member.status];

  if (status !== "active" || !isStaffRole(role)) {
    return null;
  }

  const linkedMember =
    member.authUserId === user.id
      ? member
      : await linkTeamMemberAuthUser(member.id, user.id);

  return {
    authUserId: user.id,
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
